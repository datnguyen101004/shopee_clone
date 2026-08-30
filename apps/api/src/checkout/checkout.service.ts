import { createHash, randomUUID } from 'node:crypto';

import type {
  CheckoutConfirmationRequest,
  CheckoutConfirmationResponse,
  CheckoutPreviewRequest,
  CheckoutPreviewResponse,
  PurchaseResult,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import {
  PricingAddressNotFoundError,
  PricingConflictError,
  PricingValidationError,
} from '../pricing/pricing.errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  VoucherConsumptionConflictError,
  VoucherConsumptionService,
  VoucherConsumptionUnavailableError,
} from '../vouchers/voucher-consumption.service';
import { VoucherHoldService } from '../vouchers/voucher-hold.service';
import { advisoryLockKeys, confirmationRequestDigest } from './checkout-canonical';
import { CheckoutAssembler } from './checkout-assembler';
import { CheckoutPurchaseBuilder } from './checkout-purchase-builder';
import {
  CheckoutCartConflictError,
  CheckoutIdempotencyConflictError,
  CheckoutInventoryConflictError,
  CheckoutNotReadyError,
  CheckoutPreviewChangedError,
  CheckoutPurchaseNotFoundError,
  CheckoutUnavailableError,
} from './checkout.errors';
import { purchaseInclude, PurchaseProjector } from './purchase-projector';
import { InventoryService } from '../inventory/inventory.service';
import {
  InventoryIdempotencyConflictError,
  InventoryInsufficientError,
} from '../inventory/inventory.errors';
import { orderNotificationEvent } from '../notifications/notification-events';
import { NotificationService } from '../notifications/notification.service';
import { publicSellerProductMediaUrl } from '../seller-products/seller-product-media.storage';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

const onlinePurchaseInclude = {
  ...purchaseInclude,
  paymentAttempt: true,
} satisfies Prisma.PurchaseInclude;

export interface MomoPendingIntent {
  replayed: boolean;
  purchase: PurchaseResult;
  attempt: {
    id: string;
    publicReference: string;
    orderId: string;
    requestId: string;
    amountMinor: bigint;
    expiresAt: Date;
  };
}

function momoRequestDigest(baseDigest: string): string {
  return createHash('sha256').update(`MOMO:${baseDigest}`).digest('hex');
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  const detail = `${error.message} ${String(error.meta?.driverAdapterError ?? '')}`;
  return (
    error.code === 'P2010' &&
    (detail.includes('40001') ||
      detail.includes('could not serialize') ||
      detail.includes('TransactionWriteConflict'))
  );
}

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CheckoutAssembler) private readonly assembler: CheckoutAssembler,
    @Inject(CheckoutPurchaseBuilder) private readonly purchaseBuilder: CheckoutPurchaseBuilder,
    @Inject(PurchaseProjector) private readonly projector: PurchaseProjector,
    @Inject(VoucherConsumptionService)
    private readonly voucherConsumption: VoucherConsumptionService,
    @Inject(VoucherHoldService) private readonly voucherHold: VoucherHoldService,
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  preview(
    userId: string,
    expectedVersion: number,
    input: CheckoutPreviewRequest,
  ): Promise<CheckoutPreviewResponse> {
    return this.assembler.preview(userId, expectedVersion, input);
  }

  async confirmCod(
    userId: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: CheckoutConfirmationRequest,
  ): Promise<CheckoutConfirmationResponse> {
    const requestDigest = confirmationRequestDigest(userId, expectedVersion, input);
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        const result = await this.prisma.$transaction(
          async (transaction) => {
            const [firstLockKey, secondLockKey] = advisoryLockKeys(userId, idempotencyKey);
            await transaction.$executeRaw(Prisma.sql`
              SELECT pg_advisory_xact_lock(${firstLockKey}, ${secondLockKey})
            `);
            const existing = await transaction.purchase.findUnique({
              where: { buyerId_idempotencyKey: { buyerId: userId, idempotencyKey } },
              include: purchaseInclude,
            });
            if (existing) {
              if (existing.requestDigest !== requestDigest) {
                throw new CheckoutIdempotencyConflictError();
              }
              return { replayed: true, purchase: this.projector.project(existing) };
            }

            const lockedCart = await transaction.$queryRaw<{ id: string; version: number }[]>(
              Prisma.sql`
                SELECT "id", "version"
                FROM "carts"
                WHERE "user_id" = ${userId}::uuid
                FOR UPDATE
              `,
            );
            const currentVersion = lockedCart[0]?.version ?? 0;
            if (currentVersion !== expectedVersion) {
              throw new CheckoutCartConflictError(currentVersion);
            }

            const built = await this.purchaseBuilder.buildInTransaction(transaction, {
              userId,
              expectedVersion,
              idempotencyKey,
              requestDigest,
              confirmation: input,
              paymentMethod: 'COD',
              paymentStatus: 'UNPAID',
            });
            await this.inventory.consumeInTransaction(
              transaction,
              built.reservationId,
              userId,
              built.purchaseId,
              built.purchaseId,
            );
            const consumption = await this.voucherConsumption.consumeInTransaction(transaction, {
              purchaseReference: built.purchaseId,
              idempotencyKey: built.purchaseId,
              userId,
              evaluatedAt: built.evaluatedAt,
              applied: built.appliedVouchers,
            });
            await this.purchaseBuilder.linkRedemptions(
              transaction,
              built.purchaseId,
              built.writtenPurchaseVouchers,
              consumption.redemptions,
            );

            const removed = await transaction.cartLine.deleteMany({
              where: { id: { in: [...built.cartLineIds] }, cart: { userId } },
            });
            if (removed.count !== built.cartLineIds.length)
              throw new CheckoutCartConflictError(currentVersion);
            const cartId = lockedCart[0]?.id;
            if (!cartId) throw new CheckoutCartConflictError(0);
            const advanced = await transaction.cart.updateMany({
              where: { id: cartId, userId, version: expectedVersion },
              data: { version: { increment: 1 } },
            });
            if (advanced.count !== 1) throw new CheckoutCartConflictError(currentVersion);

            const committed = await transaction.purchase.findUniqueOrThrow({
              where: { id: built.purchaseId },
              include: purchaseInclude,
            });
            return { replayed: false, purchase: this.projector.project(committed) };
          },
          { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 20_000 },
        );
        if (!result.replayed) {
          await this.emitNewOrderNotifications(result.purchase.purchaseReference);
        }
        return result;
      } catch (error) {
        if (isRetryableTransactionError(error) && attempt < MAX_SERIALIZABLE_ATTEMPTS) continue;
        if (error instanceof VoucherConsumptionUnavailableError) {
          throw new CheckoutNotReadyError();
        }
        if (error instanceof VoucherConsumptionConflictError) {
          throw new CheckoutUnavailableError();
        }
        if (error instanceof InventoryInsufficientError)
          throw new CheckoutInventoryConflictError(error.availableQuantity);
        if (error instanceof InventoryIdempotencyConflictError)
          throw new CheckoutIdempotencyConflictError();
        if (
          error instanceof CheckoutCartConflictError ||
          error instanceof CheckoutIdempotencyConflictError ||
          error instanceof CheckoutInventoryConflictError ||
          error instanceof CheckoutNotReadyError ||
          error instanceof CheckoutPreviewChangedError ||
          error instanceof CheckoutUnavailableError ||
          error instanceof PricingAddressNotFoundError ||
          error instanceof PricingConflictError ||
          error instanceof PricingValidationError
        ) {
          throw error;
        }
        throw new CheckoutUnavailableError();
      }
    }
    throw new CheckoutUnavailableError();
  }

  async createMomoPendingIntent(
    userId: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: CheckoutConfirmationRequest,
    paymentTtlSeconds: number,
  ): Promise<MomoPendingIntent> {
    const requestDigest = momoRequestDigest(
      confirmationRequestDigest(userId, expectedVersion, input),
    );
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const [firstLockKey, secondLockKey] = advisoryLockKeys(userId, idempotencyKey);
            await transaction.$executeRaw(Prisma.sql`
              SELECT pg_advisory_xact_lock(${firstLockKey}, ${secondLockKey})
            `);
            const existing = await transaction.purchase.findUnique({
              where: { buyerId_idempotencyKey: { buyerId: userId, idempotencyKey } },
              include: onlinePurchaseInclude,
            });
            if (existing) {
              if (
                existing.requestDigest !== requestDigest ||
                existing.paymentMethod !== 'MOMO' ||
                !existing.paymentAttempt
              ) {
                throw new CheckoutIdempotencyConflictError();
              }
              return {
                replayed: true,
                purchase: this.projector.project(existing),
                attempt: existing.paymentAttempt,
              };
            }

            const lockedCart = await transaction.$queryRaw<{ id: string; version: number }[]>(
              Prisma.sql`
                SELECT "id", "version"
                FROM "carts"
                WHERE "user_id" = ${userId}::uuid
                FOR UPDATE
              `,
            );
            const currentVersion = lockedCart[0]?.version ?? 0;
            if (currentVersion !== expectedVersion) {
              throw new CheckoutCartConflictError(currentVersion);
            }

            const built = await this.purchaseBuilder.buildInTransaction(transaction, {
              userId,
              expectedVersion,
              idempotencyKey,
              requestDigest,
              confirmation: input,
              paymentMethod: 'MOMO',
              paymentStatus: 'PENDING',
            });
            const settlement = await transaction.purchase.findUniqueOrThrow({
              where: { id: built.purchaseId },
              select: {
                payableTotalMinor: true,
                orders: { select: { payableTotalMinor: true } },
              },
            });
            const shopPayableTotalMinor = settlement.orders.reduce(
              (total, order) => total + order.payableTotalMinor,
              0n,
            );
            if (
              shopPayableTotalMinor !== settlement.payableTotalMinor ||
              settlement.payableTotalMinor < 1_000n ||
              settlement.payableTotalMinor > 50_000_000n
            ) {
              throw new CheckoutNotReadyError();
            }

            const databaseClock = await transaction.$queryRaw<Array<{ now: Date }>>(
              Prisma.sql`SELECT clock_timestamp() AS "now"`,
            );
            const now = databaseClock[0]?.now;
            if (!(now instanceof Date)) throw new CheckoutUnavailableError();
            const expiresAt = new Date(now.getTime() + paymentTtlSeconds * 1_000);
            await this.voucherHold.assertAvailableInTransaction(transaction, {
              purchaseId: built.purchaseId,
              userId,
              evaluatedAt: built.evaluatedAt,
              applied: built.appliedVouchers,
            });

            const paymentAttemptId = randomUUID();
            const paymentAttempt = await transaction.paymentAttempt.create({
              data: {
                id: paymentAttemptId,
                publicReference: randomUUID(),
                purchaseId: built.purchaseId,
                provider: 'MOMO',
                environment: 'SANDBOX',
                orderId: `momo_${built.purchaseId.replaceAll('-', '')}`,
                requestId: `req_${paymentAttemptId.replaceAll('-', '')}`,
                amountMinor: settlement.payableTotalMinor,
                currency: 'VND',
                status: 'PENDING',
                lastResultClass: 'PENDING',
                expiresAt,
              },
            });

            const removed = await transaction.cartLine.deleteMany({
              where: { id: { in: [...built.cartLineIds] }, cart: { userId } },
            });
            if (removed.count !== built.cartLineIds.length) {
              throw new CheckoutCartConflictError(currentVersion);
            }
            const cartId = lockedCart[0]?.id;
            if (!cartId) throw new CheckoutCartConflictError(0);
            const advanced = await transaction.cart.updateMany({
              where: { id: cartId, userId, version: expectedVersion },
              data: { version: { increment: 1 } },
            });
            if (advanced.count !== 1) throw new CheckoutCartConflictError(currentVersion);

            const committed = await transaction.purchase.findUniqueOrThrow({
              where: { id: built.purchaseId },
              include: onlinePurchaseInclude,
            });
            return {
              replayed: false,
              purchase: this.projector.project(committed),
              attempt: paymentAttempt,
            };
          },
          { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 20_000 },
        );
      } catch (error) {
        if (isRetryableTransactionError(error) && attempt < MAX_SERIALIZABLE_ATTEMPTS) continue;
        if (error instanceof VoucherConsumptionUnavailableError) {
          throw new CheckoutNotReadyError();
        }
        if (error instanceof VoucherConsumptionConflictError) {
          throw new CheckoutUnavailableError();
        }
        if (error instanceof InventoryInsufficientError) {
          throw new CheckoutInventoryConflictError(error.availableQuantity);
        }
        if (error instanceof InventoryIdempotencyConflictError) {
          throw new CheckoutIdempotencyConflictError();
        }
        if (
          error instanceof CheckoutCartConflictError ||
          error instanceof CheckoutIdempotencyConflictError ||
          error instanceof CheckoutInventoryConflictError ||
          error instanceof CheckoutNotReadyError ||
          error instanceof CheckoutPreviewChangedError ||
          error instanceof CheckoutUnavailableError ||
          error instanceof PricingAddressNotFoundError ||
          error instanceof PricingConflictError ||
          error instanceof PricingValidationError
        ) {
          throw error;
        }
        throw new CheckoutUnavailableError();
      }
    }
    throw new CheckoutUnavailableError();
  }

  async getPurchase(userId: string, purchaseReference: string): Promise<PurchaseResult> {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseReference, buyerId: userId },
      include: purchaseInclude,
    });
    if (!purchase) throw new CheckoutPurchaseNotFoundError();
    return this.projector.project(purchase);
  }

  private async emitNewOrderNotifications(purchaseId: string): Promise<void> {
    try {
      const orders = await this.prisma.shopOrder.findMany({
        where: { purchaseId },
        select: {
          id: true,
          payableTotalMinor: true,
          shop: { select: { ownerId: true } },
          purchase: { select: { buyerId: true } },
          lines: {
            take: 1,
            select: {
              productImageUrl: true,
              product: {
                select: {
                  images: {
                    where: { variantId: null },
                    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                    take: 1,
                    select: {
                      url: true,
                      sellerProductMediaAsset: { select: { storageKey: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      for (const order of orders) {
        const image = order.lines[0]?.product.images[0];
        const cdnUrl = image?.sellerProductMediaAsset?.storageKey
          ? publicSellerProductMediaUrl(image.sellerProductMediaAsset.storageKey)
          : null;
        await this.notifications.notify(
          orderNotificationEvent({
            type: 'ORDER_CREATED',
            orderId: order.id,
            buyerId: order.purchase.buyerId,
            sellerOwnerId: order.shop.ownerId,
            amountMinor: Number(order.payableTotalMinor),
            thumbnailUrl: cdnUrl ?? order.lines[0]?.productImageUrl ?? image?.url ?? null,
          }),
        );
      }
    } catch (error) {
      console.error('[notifications] checkout order-created emit failed', error);
    }
  }
  async markPaymentFailed(
    userId: string,
    purchaseReference: string,
  ): Promise<{ released: boolean }> {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseReference, buyerId: userId },
      select: {
        paymentMethod: true,
        inventoryReservation: { select: { id: true, status: true } },
      },
    });
    if (!purchase) throw new CheckoutPurchaseNotFoundError();
    if (purchase.paymentMethod === 'MOMO') return { released: false };
    const reservation = purchase.inventoryReservation;
    if (!reservation || reservation.status !== 'ACTIVE') return { released: false };
    await this.inventory.release(reservation.id, 'payment-failed', purchaseReference);
    return { released: true };
  }
}

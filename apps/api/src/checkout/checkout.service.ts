import { randomUUID } from 'node:crypto';

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
import { SystemUtcClock } from '../vouchers/utc-clock';
import {
  advisoryLockKeys,
  confirmationRequestDigest,
  fingerprintsEqual,
} from './checkout-canonical';
import { CheckoutAssembler } from './checkout-assembler';
import {
  CheckoutCartConflictError,
  CheckoutIdempotencyConflictError,
  CheckoutNotReadyError,
  CheckoutPreviewChangedError,
  CheckoutPurchaseNotFoundError,
  CheckoutUnavailableError,
} from './checkout.errors';
import { OrderWriter } from './order-writer';
import { purchaseInclude, PurchaseProjector } from './purchase-projector';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

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
    @Inject(OrderWriter) private readonly writer: OrderWriter,
    @Inject(PurchaseProjector) private readonly projector: PurchaseProjector,
    @Inject(VoucherConsumptionService)
    private readonly voucherConsumption: VoucherConsumptionService,
    @Inject(SystemUtcClock) private readonly clock: SystemUtcClock,
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
        return await this.prisma.$transaction(
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

            const assembled = await this.assembler.assembleInTransaction(
              transaction,
              userId,
              expectedVersion,
              input,
              this.clock.now(),
            );
            if (!assembled.preview.ready || assembled.preview.checkoutFingerprint === null) {
              throw new CheckoutNotReadyError(assembled.preview);
            }
            if (
              !fingerprintsEqual(assembled.preview.checkoutFingerprint, input.checkoutFingerprint)
            ) {
              throw new CheckoutPreviewChangedError(assembled.preview);
            }

            const purchaseId = randomUUID();
            const writtenPurchaseVouchers = await this.writer.write(transaction, {
              purchaseId,
              buyerId: userId,
              idempotencyKey,
              requestDigest,
              preview: assembled.preview,
              applied: assembled.applied,
            });
            const consumption = await this.voucherConsumption.consumeInTransaction(transaction, {
              purchaseReference: purchaseId,
              userId,
              evaluatedAt: new Date(assembled.preview.evaluatedAt),
              applied: assembled.applied,
            });
            await this.writer.linkRedemptions(
              transaction,
              purchaseId,
              writtenPurchaseVouchers,
              consumption.redemptions,
            );

            const lineIds = assembled.preview.shops.flatMap((shop) =>
              shop.lines.map(({ lineId }) => lineId),
            );
            const removed = await transaction.cartLine.deleteMany({
              where: { id: { in: lineIds }, cart: { userId } },
            });
            if (removed.count !== lineIds.length)
              throw new CheckoutCartConflictError(currentVersion);
            const cartId = lockedCart[0]?.id;
            if (!cartId) throw new CheckoutCartConflictError(0);
            const advanced = await transaction.cart.updateMany({
              where: { id: cartId, userId, version: expectedVersion },
              data: { version: { increment: 1 } },
            });
            if (advanced.count !== 1) throw new CheckoutCartConflictError(currentVersion);

            const committed = await transaction.purchase.findUniqueOrThrow({
              where: { id: purchaseId },
              include: purchaseInclude,
            });
            return { replayed: false, purchase: this.projector.project(committed) };
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
        if (
          error instanceof CheckoutCartConflictError ||
          error instanceof CheckoutIdempotencyConflictError ||
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
}

import { createHash, randomUUID } from 'node:crypto';

import type { PurchasePaymentStatus, ShopOrderStatus } from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { VoucherConsumptionService } from '../vouchers/voucher-consumption.service';
import { classifyMomoResultCode, MomoResultCodeMetrics } from './momo-result-code';
import { classifyVnpayResultCode, VnpayResultCodeMetrics } from './vnpay-result-code';
import type {
  NotificationFieldValue,
  PaymentProviderName,
  ProviderOperationResult,
} from './payment-provider.port';
import { classifyPaymentResult } from './payment-result';
import { decidePaymentTransition } from './payment-state';

export type ProviderObservationSource = 'IPN' | 'QUERY' | 'RETURN';

export interface ApplyProviderObservationInput {
  source: ProviderObservationSource;
  observation: ProviderOperationResult;
  fingerprint?: string;
  sanitizedMetadata?: Readonly<Record<string, NotificationFieldValue>>;
}

export interface AppliedProviderObservation {
  attemptId: string;
  eventId: string;
  decision: 'APPLIED' | 'IGNORED' | 'DUPLICATE' | 'MISMATCH';
  status: PurchasePaymentStatus;
  duplicate: boolean;
}

export class ProviderObservationNotFoundError extends Error {}
export class ProviderObservationValidationError extends Error {}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export function providerObservationFingerprint(observation: ProviderOperationResult): string {
  return sha256(
    JSON.stringify({
      provider: observation.provider,
      environment: observation.environment,
      orderId: observation.orderId,
      requestId: observation.requestId,
      amountMinor: observation.amountMinor.toString(),
      currency: observation.currency,
      resultCode: observation.resultCode,
      providerTransactionId: observation.providerTransactionId?.toString() ?? null,
    }),
  );
}

function targetStatus(resultClass: string): PurchasePaymentStatus {
  switch (resultClass) {
    case 'SUCCESS':
      return 'PAID';
    case 'PENDING':
      return 'PENDING';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'DENIED':
    case 'FAILURE':
      return 'FAILED';
    default:
      return 'UNKNOWN';
  }
}

export function fulfillmentStatusAfterPaymentObservation(
  provider: PaymentProviderName,
  paymentStatus: PurchasePaymentStatus,
  terminalFailure: boolean,
  currentStatus: ShopOrderStatus,
): ShopOrderStatus {
  if (paymentStatus === 'PAID' && currentStatus === 'PENDING_PAYMENT') {
    return 'PENDING_CONFIRMATION';
  }
  if (
    terminalFailure &&
    ((provider === 'VNPAY' && currentStatus === 'PENDING_PAYMENT') ||
      (provider === 'MOMO' && currentStatus === 'PENDING_CONFIRMATION'))
  ) {
    return 'CANCELLED';
  }
  return currentStatus;
}

@Injectable()
export class PaymentObservationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MomoResultCodeMetrics) private readonly metrics: MomoResultCodeMetrics,
    @Inject(VnpayResultCodeMetrics) private readonly vnpayMetrics: VnpayResultCodeMetrics,
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(VoucherConsumptionService)
    private readonly voucherConsumption: VoucherConsumptionService,
  ) {}

  async applyProviderObservation(
    input: ApplyProviderObservationInput,
  ): Promise<AppliedProviderObservation> {
    const fingerprint = input.fingerprint ?? providerObservationFingerprint(input.observation);
    if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
      throw new ProviderObservationValidationError('Observation fingerprint is invalid.');
    }
    return this.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.paymentAttempt.findUnique({
        where: {
          provider_orderId: {
            provider: input.observation.provider,
            orderId: input.observation.orderId,
          },
        },
      });
      if (!candidate) throw new ProviderObservationNotFoundError();
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "payment_attempts"
        WHERE "id" = ${candidate.id}::uuid
        FOR UPDATE
      `);
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "purchases"
        WHERE "id" = ${candidate.purchaseId}::uuid
        FOR UPDATE
      `);
      const attempt = await transaction.paymentAttempt.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      const dedupeKey = sha256(`${input.source}:${attempt.id}:${fingerprint}`);
      const existing = await transaction.paymentEvent.findUnique({ where: { dedupeKey } });
      if (existing) {
        return {
          attemptId: attempt.id,
          eventId: existing.id,
          decision: 'DUPLICATE',
          status: attempt.status,
          duplicate: true,
        };
      }

      const classification =
        input.observation.provider === 'VNPAY'
          ? classifyVnpayResultCode(input.observation.resultCode, 'OBSERVATION', this.vnpayMetrics)
          : classifyMomoResultCode(
              input.observation.resultCode,
              'PAYMENT_OBSERVATION',
              this.metrics,
            );
      const observedStatus = targetStatus(classification.resultClass);
      const correlationMatches =
        attempt.provider === input.observation.provider &&
        attempt.environment === input.observation.environment &&
        attempt.orderId === input.observation.orderId &&
        (input.observation.provider === 'VNPAY' ||
          attempt.requestId === input.observation.requestId) &&
        attempt.amountMinor === input.observation.amountMinor &&
        attempt.currency === input.observation.currency &&
        (attempt.providerTransactionId === null ||
          input.observation.providerTransactionId === null ||
          attempt.providerTransactionId === input.observation.providerTransactionId);
      const result = classifyPaymentResult(classification.resultClass, correlationMatches);
      const lateSuccess =
        correlationMatches &&
        input.observation.providerTransactionId !== null &&
        observedStatus === 'PAID' &&
        (attempt.status === 'FAILED' ||
          attempt.status === 'CANCELLED' ||
          attempt.status === 'EXPIRED');
      const desiredStatus: PurchasePaymentStatus = lateSuccess
        ? 'REFUND_PENDING'
        : correlationMatches
          ? observedStatus
          : 'PENDING_RECONCILIATION';
      let effectiveStatus: PurchasePaymentStatus = desiredStatus;
      let effectiveLateSuccess = lateSuccess;
      let transition = decidePaymentTransition(attempt.status, effectiveStatus);
      let decision: AppliedProviderObservation['decision'] = !correlationMatches
        ? 'MISMATCH'
        : transition === 'APPLY'
          ? 'APPLIED'
          : 'IGNORED';
      let shouldApply = transition === 'APPLY';
      const now = new Date();

      if (shouldApply) {
        const purchase = await transaction.purchase.findUniqueOrThrow({
          where: { id: attempt.purchaseId },
          include: {
            inventoryReservation: true,
            vouchers: true,
            orders: {
              select: {
                id: true,
                status: true,
                version: true,
                lines: {
                  select: { variantId: true, quantity: true, sellingUnitPriceMinor: true },
                },
                fulfillment: { select: { state: true, version: true } },
              },
            },
          },
        });
        // A distinct attempt can report success after another attempt already
        // paid or after the hold was released. Keep the payment evidence, but
        // never consume resources or regress the settled Purchase.
        if (
          effectiveStatus === 'PAID' &&
          (purchase.paymentStatus === 'PAID' || purchase.inventoryReservation?.status !== 'ACTIVE')
        ) {
          effectiveStatus = 'REFUND_PENDING';
          effectiveLateSuccess = true;
          transition = decidePaymentTransition(attempt.status, effectiveStatus);
          shouldApply = transition === 'APPLY';
          decision = shouldApply ? 'APPLIED' : 'IGNORED';
        }
        if (effectiveStatus === 'PAID' && input.observation.providerTransactionId !== null) {
          const duplicateTransaction = await transaction.paymentAttempt.findFirst({
            where: {
              provider: input.observation.provider,
              providerTransactionId: input.observation.providerTransactionId,
              id: { not: attempt.id },
            },
            select: { id: true },
          });
          if (duplicateTransaction) {
            effectiveStatus = 'REFUND_PENDING';
            effectiveLateSuccess = true;
            transition = decidePaymentTransition(attempt.status, effectiveStatus);
            shouldApply = transition === 'APPLY';
            decision = shouldApply ? 'APPLIED' : 'IGNORED';
          }
        }
        const terminalFailure =
          effectiveStatus === 'FAILED' ||
          effectiveStatus === 'CANCELLED' ||
          effectiveStatus === 'EXPIRED';
        if (effectiveStatus === 'PAID') {
          if (!purchase.inventoryReservation) {
            throw new ProviderObservationValidationError('Payment inventory hold is missing.');
          }
          await this.inventory.consumeInTransaction(
            transaction,
            purchase.inventoryReservation.id,
            purchase.buyerId,
            purchase.id,
            attempt.id,
          );
          const consumption = await this.voucherConsumption.consumeInTransaction(transaction, {
            purchaseReference: purchase.id,
            idempotencyKey: attempt.id,
            userId: purchase.buyerId,
            evaluatedAt: purchase.createdAt,
            applied: purchase.vouchers.map((voucher) => ({
              voucherId: voucher.voucherId,
              code: voucher.code,
              merchandiseDiscountMinor: Number(voucher.merchandiseDiscountMinor),
              shippingDiscountMinor: Number(voucher.shippingDiscountMinor),
              discountMinor: Number(voucher.discountMinor),
            })),
          });
          for (const redemption of consumption.redemptions) {
            await transaction.purchaseVoucher.updateMany({
              where: {
                purchaseId: purchase.id,
                voucherId: redemption.voucherId,
                redemptionId: null,
              },
              data: { redemptionId: redemption.id },
            });
          }
        } else if (terminalFailure && purchase.inventoryReservation) {
          await this.inventory.releaseInTransaction(
            transaction,
            purchase.inventoryReservation.id,
            effectiveStatus === 'EXPIRED' ? 'expired' : 'payment-failed',
            attempt.id,
          );
        }
        await transaction.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: effectiveStatus,
            lastResultCode: input.observation.resultCode,
            lastResultClass: result.resultClass,
            providerTransactionId:
              input.observation.providerTransactionId ?? attempt.providerTransactionId,
            lastObservedAt: input.observation.observedAt,
            nextReconcileAt:
              effectiveStatus === 'UNKNOWN' || effectiveStatus === 'PENDING_RECONCILIATION'
                ? now
                : null,
            version: { increment: 1 },
          },
        });
        const purchaseStatus =
          effectiveStatus === 'REFUND_PENDING' && purchase.paymentStatus === 'PAID'
            ? 'PAID'
            : effectiveStatus;
        await transaction.purchase.update({
          where: { id: attempt.purchaseId },
          data: { paymentStatus: purchaseStatus },
        });
        for (const order of purchase.orders) {
          const fulfillmentStatus = fulfillmentStatusAfterPaymentObservation(
            input.observation.provider,
            effectiveStatus,
            terminalFailure,
            order.status,
          );
          const orderPaymentStatus =
            effectiveStatus === 'REFUND_PENDING' && purchase.paymentStatus === 'PAID'
              ? 'PAID'
              : effectiveStatus;
          await transaction.shopOrder.update({
            where: { id: order.id },
            data: {
              paymentStatus: orderPaymentStatus,
              ...(effectiveStatus === 'PAID' || terminalFailure
                ? { version: { increment: 1 } }
                : {}),
              ...(fulfillmentStatus !== order.status ? { status: fulfillmentStatus } : {}),
            },
          });
          if (effectiveStatus === 'PAID' || terminalFailure) {
            await transaction.orderTimelineEvent.create({
              data: {
                id: randomUUID(),
                orderId: order.id,
                previousStatus: order.status,
                status: fulfillmentStatus,
                orderVersion: order.version + 1,
                actorType: 'SYSTEM',
                actorUserId: null,
                reasonCode: terminalFailure
                  ? `${input.observation.provider}_PAYMENT_${effectiveStatus}`
                  : `${input.observation.provider}_PAYMENT_CONFIRMED`,
                reasonNote: null,
                idempotencyKey: attempt.id,
                requestDigest: fingerprint,
              },
            });
          }
          if (terminalFailure && order.fulfillment?.state === 'PENDING_CONFIRMATION') {
            await transaction.sellerOrderFulfillment.update({
              where: { orderId: order.id },
              data: {
                state: 'CANCELLED',
                version: { increment: 1 },
                cancelledAt: now,
              },
            });
            await transaction.sellerOrderFulfillmentEvent.create({
              data: {
                id: randomUUID(),
                orderId: order.id,
                previousState: order.fulfillment.state,
                state: 'CANCELLED',
                fulfillmentVersion: order.fulfillment.version + 1,
                actorType: 'SYSTEM',
                actorUserId: null,
                action: 'PAYMENT_TERMINATED',
                reasonCode: `${input.observation.provider}_PAYMENT_${effectiveStatus}`,
                reasonNote: null,
                late: false,
                idempotencyKey: attempt.id,
                requestDigest: fingerprint,
              },
            });
          }
        }
        if (terminalFailure && input.observation.provider === 'VNPAY') {
          const cart = await transaction.cart.findUnique({
            where: { userId: purchase.buyerId },
            select: { id: true, consumedAt: true },
          });
          if (cart && !cart.consumedAt) {
            const restore = new Map<string, { quantity: number; price: bigint }>();
            for (const order of purchase.orders) {
              for (const line of order.lines) {
                const prior = restore.get(line.variantId);
                restore.set(line.variantId, {
                  quantity: (prior?.quantity ?? 0) + line.quantity,
                  price: prior?.price ?? line.sellingUnitPriceMinor,
                });
              }
            }
            for (const [variantId, line] of restore) {
              await transaction.cartLine.upsert({
                where: { cartId_variantId: { cartId: cart.id, variantId } },
                update: { quantity: { increment: line.quantity }, isSelected: true },
                create: {
                  id: randomUUID(),
                  cartId: cart.id,
                  variantId,
                  quantity: line.quantity,
                  isSelected: true,
                  lastObservedUnitPriceMinor: line.price,
                },
              });
            }
            if (restore.size > 0) {
              await transaction.cart.update({
                where: { id: cart.id },
                data: { version: { increment: 1 } },
              });
            }
          }
        }
        if (effectiveLateSuccess) {
          const compactAttemptId = attempt.id.replaceAll('-', '');
          await transaction.paymentRefund.create({
            data: {
              id: randomUUID(),
              attemptId: attempt.id,
              provider: input.observation.provider,
              orderId: `refund_${compactAttemptId}`,
              requestId: `rreq_${compactAttemptId}`,
              amountMinor: attempt.amountMinor,
              currency: attempt.currency,
              status: 'PENDING',
              nextReconcileAt: now,
            },
          });
        }
        if (effectiveStatus === 'PAID') {
          const notification = await transaction.notification.create({
            data: {
              id: randomUUID(),
              recipientId: purchase.buyerId,
              category: 'SYSTEM',
              type: 'SYSTEM_NOTICE',
              title: `Thanh toán ${input.observation.provider} thành công`,
              body: `Thanh toán cho đơn #${purchase.id.slice(0, 8)} đã được xác nhận.`,
              metadata: {
                targetUrl: `/checkout/payment/${attempt.publicReference}`,
                thumbnailUrl: null,
                referenceId: purchase.id,
                amountMinor: Number(attempt.amountMinor),
                currency: attempt.currency,
              },
              deduplicationKey: `payment:${attempt.id}:paid:buyer`,
            },
          });
          await transaction.notificationDeliveryAttempt.create({
            data: {
              id: randomUUID(),
              notificationId: notification.id,
              channel: 'EMAIL',
              status: 'PENDING',
              attemptCount: 0,
              nextRetryAt: now,
            },
          });
        }
      }

      const eventId = randomUUID();
      await transaction.paymentEvent.create({
        data: {
          id: eventId,
          attemptId: attempt.id,
          source: input.source,
          dedupeKey,
          fingerprint,
          resultCode: input.observation.resultCode,
          resultClass: result.resultClass,
          observedStatus,
          providerTransactionId: input.observation.providerTransactionId,
          sanitizedMetadata: (input.sanitizedMetadata ?? {}) as Prisma.InputJsonValue,
          decision,
          receivedAt: input.observation.observedAt,
          processedAt: now,
        },
      });
      return {
        attemptId: attempt.id,
        eventId,
        decision,
        status: shouldApply ? effectiveStatus : attempt.status,
        duplicate: false,
      };
    });
  }
}

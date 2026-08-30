import { createHash, randomUUID } from 'node:crypto';

import type { PurchasePaymentStatus } from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { VoucherConsumptionService } from '../vouchers/voucher-consumption.service';
import { classifyMomoResultCode, MomoResultCodeMetrics } from './momo-result-code';
import type { NotificationFieldValue, ProviderOperationResult } from './payment-provider.port';
import { classifyPaymentResult } from './payment-result';
import { decidePaymentTransition } from './payment-state';

export type ProviderObservationSource = 'IPN' | 'QUERY';

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

@Injectable()
export class PaymentObservationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MomoResultCodeMetrics) private readonly metrics: MomoResultCodeMetrics,
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

      const classification = classifyMomoResultCode(
        input.observation.resultCode,
        'PAYMENT_OBSERVATION',
        this.metrics,
      );
      const observedStatus = targetStatus(classification.resultClass);
      const correlationMatches =
        attempt.provider === input.observation.provider &&
        attempt.environment === input.observation.environment &&
        attempt.orderId === input.observation.orderId &&
        attempt.requestId === input.observation.requestId &&
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
      const transition = decidePaymentTransition(attempt.status, desiredStatus);
      const decision = !correlationMatches
        ? 'MISMATCH'
        : transition === 'APPLY'
          ? 'APPLIED'
          : 'IGNORED';
      const shouldApply = transition === 'APPLY';
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
                fulfillment: { select: { state: true, version: true } },
              },
            },
          },
        });
        const terminalFailure =
          desiredStatus === 'FAILED' ||
          desiredStatus === 'CANCELLED' ||
          desiredStatus === 'EXPIRED';
        if (desiredStatus === 'PAID') {
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
            desiredStatus === 'EXPIRED' ? 'expired' : 'payment-failed',
            attempt.id,
          );
        }
        await transaction.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: desiredStatus,
            lastResultCode: input.observation.resultCode,
            lastResultClass: result.resultClass,
            providerTransactionId:
              input.observation.providerTransactionId ?? attempt.providerTransactionId,
            lastObservedAt: input.observation.observedAt,
            nextReconcileAt:
              desiredStatus === 'UNKNOWN' || desiredStatus === 'PENDING_RECONCILIATION'
                ? now
                : null,
            version: { increment: 1 },
          },
        });
        await transaction.purchase.update({
          where: { id: attempt.purchaseId },
          data: { paymentStatus: desiredStatus },
        });
        for (const order of purchase.orders) {
          await transaction.shopOrder.update({
            where: { id: order.id },
            data: {
              paymentStatus: desiredStatus,
              ...(desiredStatus === 'PAID' || terminalFailure
                ? { version: { increment: 1 } }
                : {}),
              ...(terminalFailure ? { status: 'CANCELLED' } : {}),
            },
          });
          if (desiredStatus === 'PAID' || terminalFailure) {
            await transaction.orderTimelineEvent.create({
              data: {
                id: randomUUID(),
                orderId: order.id,
                previousStatus: order.status,
                status: terminalFailure ? 'CANCELLED' : order.status,
                orderVersion: order.version + 1,
                actorType: 'SYSTEM',
                actorUserId: null,
                reasonCode: terminalFailure
                  ? `MOMO_PAYMENT_${desiredStatus}`
                  : 'MOMO_PAYMENT_CONFIRMED',
                reasonNote: null,
                idempotencyKey: attempt.id,
                requestDigest: fingerprint,
              },
            });
          }
          if (
            terminalFailure &&
            order.fulfillment?.state === 'PENDING_CONFIRMATION'
          ) {
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
                reasonCode: `MOMO_PAYMENT_${desiredStatus}`,
                reasonNote: null,
                late: false,
                idempotencyKey: attempt.id,
                requestDigest: fingerprint,
              },
            });
          }
        }
        if (lateSuccess) {
          const compactAttemptId = attempt.id.replaceAll('-', '');
          await transaction.paymentRefund.create({
            data: {
              id: randomUUID(),
              attemptId: attempt.id,
              provider: 'MOMO',
              orderId: `refund_${compactAttemptId}`,
              requestId: `rreq_${compactAttemptId}`,
              amountMinor: attempt.amountMinor,
              currency: attempt.currency,
              status: 'PENDING',
              nextReconcileAt: now,
            },
          });
        }
        if (desiredStatus === 'PAID') {
          const notification = await transaction.notification.create({
            data: {
              id: randomUUID(),
              recipientId: purchase.buyerId,
              category: 'SYSTEM',
              type: 'SYSTEM_NOTICE',
              title: 'Thanh toán MoMo thành công',
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
        status: shouldApply ? desiredStatus : attempt.status,
        duplicate: false,
      };
    });
  }
}

import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { classifyMomoResultCode } from './momo-result-code';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.port';
import { reconciliationBackoffMs } from './payment-reconciliation.service';

@Injectable()
export class RefundReconciliationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  @Interval(30_000)
  async scheduledReconcile(): Promise<void> {
    try {
      await this.reconcileDue();
    } catch {
      // Keep the scheduler alive; leased rows become eligible again.
    }
  }

  async reconcileDue(limit = 50): Promise<number> {
    const now = new Date();
    const candidates = await this.prisma.paymentRefund.findMany({
      where: {
        status: { in: ['PENDING', 'UNKNOWN', 'PENDING_RECONCILIATION'] },
        AND: [
          { OR: [{ nextReconcileAt: null }, { nextReconcileAt: { lte: now } }] },
          { OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
        ],
      },
      include: { attempt: true },
      orderBy: [{ nextReconcileAt: 'asc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(limit, 200)),
    });
    let claimed = 0;
    for (const refund of candidates) {
      const leaseExpiresAt = new Date(now.getTime() + 120_000);
      const lease = await this.prisma.paymentRefund.updateMany({
        where: {
          id: refund.id,
          version: refund.version,
          status: { in: ['PENDING', 'UNKNOWN', 'PENDING_RECONCILIATION'] },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
        },
        data: {
          leaseExpiresAt,
          requestedAt: refund.requestedAt ?? now,
          version: { increment: 1 },
        },
      });
      if (lease.count !== 1) continue;
      claimed += 1;
      try {
        if (refund.provider === 'VNPAY') {
          // VNPAY refund calls are deliberately out of scope for the sandbox
          // change. Retain a redacted manual-resolution backlog and never send
          // a VNPAY row through the MoMo adapter.
          await this.markManual(refund.id, leaseExpiresAt);
          continue;
        }
        if (refund.attempt.providerTransactionId === null) throw new Error('Missing transaction');
        const result = refund.requestedAt
          ? await this.provider.queryRefund({
              provider: 'MOMO',
              environment: 'SANDBOX',
              orderId: refund.orderId,
              requestId: refund.requestId,
            })
          : await this.provider.refundPayment({
              provider: 'MOMO',
              environment: 'SANDBOX',
              orderId: refund.orderId,
              requestId: refund.requestId,
              amountMinor: refund.amountMinor,
              currency: 'VND',
              providerTransactionId: refund.attempt.providerTransactionId,
              description: `Late payment refund ${refund.attempt.publicReference}`,
            });
        const classification = classifyMomoResultCode(result.resultCode, 'REFUND');
        if (classification.resultClass === 'SUCCESS') {
          await this.complete(refund.id, result.resultCode, result.providerTransactionId);
        } else {
          await this.reschedule(
            refund.id,
            leaseExpiresAt,
            result.resultCode,
            classification.resultClass,
          );
        }
      } catch {
        await this.reschedule(refund.id, leaseExpiresAt, null, 'UNKNOWN');
      }
    }
    return claimed;
  }

  private async markManual(refundId: string, leaseExpiresAt: Date): Promise<void> {
    await this.prisma.paymentRefund.updateMany({
      where: { id: refundId, leaseExpiresAt },
      data: {
        status: 'FAILED',
        lastResultClass: 'MANUAL_REQUIRED',
        nextReconcileAt: null,
        leaseExpiresAt: null,
        version: { increment: 1 },
      },
    });
  }

  async backlogSnapshot(): Promise<{ pending: number; oldestCreatedAt: string | null }> {
    const [pending, oldest] = await Promise.all([
      this.prisma.paymentRefund.count({
        where: { status: { in: ['PENDING', 'UNKNOWN', 'PENDING_RECONCILIATION'] } },
      }),
      this.prisma.paymentRefund.findFirst({
        where: { status: { in: ['PENDING', 'UNKNOWN', 'PENDING_RECONCILIATION'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);
    return { pending, oldestCreatedAt: oldest?.createdAt.toISOString() ?? null };
  }

  private async reschedule(
    refundId: string,
    leaseExpiresAt: Date,
    resultCode: number | null,
    resultClass: string,
  ): Promise<void> {
    const current = await this.prisma.paymentRefund.findUniqueOrThrow({ where: { id: refundId } });
    const nextAttempt = current.reconcileAttempts + 1;
    await this.prisma.paymentRefund.updateMany({
      where: { id: refundId, leaseExpiresAt, status: { not: 'SUCCEEDED' } },
      data: {
        status: 'PENDING_RECONCILIATION',
        lastResultCode: resultCode,
        lastResultClass: resultClass,
        reconcileAttempts: nextAttempt,
        nextReconcileAt: new Date(Date.now() + reconciliationBackoffMs(nextAttempt, refundId)),
        leaseExpiresAt: null,
        version: { increment: 1 },
      },
    });
  }

  private async complete(
    refundId: string,
    resultCode: number,
    providerTransactionId: bigint | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const refund = await transaction.paymentRefund.findUniqueOrThrow({
        where: { id: refundId },
        include: { attempt: { include: { purchase: true } } },
      });
      if (refund.status === 'SUCCEEDED') return;
      const now = new Date();
      await transaction.paymentRefund.update({
        where: { id: refund.id },
        data: {
          status: 'SUCCEEDED',
          lastResultCode: resultCode,
          lastResultClass: 'SUCCESS',
          providerTransactionId,
          completedAt: now,
          nextReconcileAt: null,
          leaseExpiresAt: null,
          version: { increment: 1 },
        },
      });
      await transaction.paymentAttempt.updateMany({
        where: { id: refund.attemptId, status: 'REFUND_PENDING' },
        data: { status: 'REFUNDED', version: { increment: 1 } },
      });
      await transaction.purchase.updateMany({
        where: { id: refund.attempt.purchaseId, paymentStatus: 'REFUND_PENDING' },
        data: { paymentStatus: 'REFUNDED' },
      });
      await transaction.shopOrder.updateMany({
        where: { purchaseId: refund.attempt.purchaseId, paymentStatus: 'REFUND_PENDING' },
        data: { paymentStatus: 'REFUNDED' },
      });
      await transaction.notification.create({
        data: {
          id: randomUUID(),
          recipientId: refund.attempt.purchase.buyerId,
          category: 'ORDERS',
          type: 'REFUNDED',
          title: 'Hoàn tiền MoMo thành công',
          body: `Khoản thanh toán #${refund.attempt.publicReference.slice(0, 8)} đã được hoàn.`,
          metadata: {
            targetUrl: `/checkout/payment/${refund.attempt.publicReference}`,
            thumbnailUrl: null,
            referenceId: refund.attempt.purchaseId,
            amountMinor: Number(refund.amountMinor),
            currency: refund.currency,
          },
          deduplicationKey: `payment:${refund.attemptId}:refunded:buyer`,
        },
      });
    });
  }
}

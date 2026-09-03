import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';
import { PaymentObservationService } from './payment-observation.service';
import {
  PAYMENT_PROVIDER_REGISTRY,
  type PaymentProviderRegistry,
} from './payment-provider.registry';

const RECONCILIATION_INTERVAL_MS = 30_000;
const RECONCILIATION_LEASE_MS = 120_000;
const MAX_BACKOFF_MS = 15 * 60_000;

export function reconciliationBackoffMs(attempt: number, identity: string): number {
  const base = Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** Math.min(attempt, 8));
  const hash = createHash('sha256').update(`${identity}:${attempt}`).digest();
  const jitterBasisPoints = hash.readUInt16BE(0) % 3_001;
  return Math.round(base * (0.85 + jitterBasisPoints / 10_000));
}

@Injectable()
export class PaymentReconciliationService {
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER_REGISTRY) private readonly providers: PaymentProviderRegistry,
    @Inject(PaymentObservationService)
    private readonly observations: PaymentObservationService,
  ) {}

  @Interval(RECONCILIATION_INTERVAL_MS)
  async scheduledReconcile(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcileDue();
    } catch {
      // Individual observations are persisted/retried; the scheduler must remain alive.
    } finally {
      this.running = false;
    }
  }

  async reconcileDue(limit = 50): Promise<number> {
    const now = new Date();
    const staleCreate = new Date(now.getTime() - RECONCILIATION_INTERVAL_MS);
    const candidates = await this.prisma.paymentAttempt.findMany({
      where: {
        provider: { in: ['MOMO', 'VNPAY'] },
        status: { in: ['PENDING', 'UNKNOWN', 'PENDING_RECONCILIATION'] },
        AND: [
          {
            OR: [
              { nextReconcileAt: { lte: now } },
              { nextReconcileAt: null, createRequestedAt: { lte: staleCreate } },
              { expiresAt: { lte: now } },
            ],
          },
          { OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
        ],
      },
      orderBy: [{ nextReconcileAt: 'asc' }, { id: 'asc' }],
      take: Math.max(1, Math.min(limit, 200)),
    });
    let claimed = 0;
    for (const candidate of candidates) {
      const leaseExpiresAt = new Date(now.getTime() + RECONCILIATION_LEASE_MS);
      const lease = await this.prisma.paymentAttempt.updateMany({
        where: {
          id: candidate.id,
          version: candidate.version,
          status: { in: ['PENDING', 'UNKNOWN', 'PENDING_RECONCILIATION'] },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
        },
        data: { leaseExpiresAt, version: { increment: 1 } },
      });
      if (lease.count !== 1) continue;
      claimed += 1;
      try {
        if (candidate.provider === 'VNPAY' && candidate.expiresAt <= now) {
          await this.observations.applyProviderObservation({
            source: 'QUERY',
            observation: {
              provider: 'VNPAY',
              environment: 'SANDBOX',
              orderId: candidate.orderId,
              requestId: candidate.requestId,
              amountMinor: candidate.amountMinor,
              currency: 'VND',
              resultCode: 11,
              message: 'Payment window expired',
              providerTransactionId: null,
              observedAt: now,
            },
          });
          await this.prisma.paymentAttempt.updateMany({
            where: { id: candidate.id, leaseExpiresAt },
            data: { leaseExpiresAt: null },
          });
          continue;
        }
        const provider = this.providers.resolve(candidate.provider);
        const observation = await provider.queryPayment({
          provider: candidate.provider,
          environment: 'SANDBOX',
          orderId: candidate.orderId,
          requestId: candidate.requestId,
          transactionDate: candidate.providerCreatedAt ?? candidate.createdAt,
          queryRequestedAt: now,
        });
        await this.observations.applyProviderObservation({ source: 'QUERY', observation });
        await this.prisma.paymentAttempt.updateMany({
          where: { id: candidate.id, leaseExpiresAt },
          data: { leaseExpiresAt: null },
        });
      } catch {
        const nextAttempt = candidate.reconcileAttempts + 1;
        await this.prisma.paymentAttempt.updateMany({
          where: {
            id: candidate.id,
            leaseExpiresAt,
            status: { in: ['PENDING', 'UNKNOWN', 'PENDING_RECONCILIATION'] },
          },
          data: {
            status: 'PENDING_RECONCILIATION',
            reconcileAttempts: nextAttempt,
            nextReconcileAt: new Date(
              Date.now() + reconciliationBackoffMs(nextAttempt, candidate.id),
            ),
            leaseExpiresAt: null,
            version: { increment: 1 },
          },
        });
        await this.prisma.purchase.updateMany({
          where: { id: candidate.purchaseId, paymentStatus: { in: ['PENDING', 'UNKNOWN'] } },
          data: { paymentStatus: 'PENDING_RECONCILIATION' },
        });
        await this.prisma.shopOrder.updateMany({
          where: {
            purchaseId: candidate.purchaseId,
            paymentStatus: { in: ['PENDING', 'UNKNOWN'] },
          },
          data: { paymentStatus: 'PENDING_RECONCILIATION' },
        });
      }
    }
    return claimed;
  }
}

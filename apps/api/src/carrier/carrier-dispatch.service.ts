import { createHash, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { createCarrierSignature } from './carrier-signature';
import { isShippingBreakdown, type DemoCarrierShippingBreakdown } from '@shopee-clone/contracts';

@Injectable()
export class CarrierDispatchService {
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Interval(5_000)
  async processDue(): Promise<void> {
    if (this.running || process.env.DEMO_CARRIER_ENABLED !== 'true') return;
    this.running = true;
    try {
      const now = new Date();
      const leaseUntil = new Date(now.getTime() + 15_000);
      const leaseOwner = `carrier-dispatch-${randomUUID()}`;
      const claimed = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id FROM "carrier_dispatch_outbox"
          WHERE outcome IS NULL
            AND next_attempt_at <= ${now}
            AND (lease_until IS NULL OR lease_until < ${now})
          ORDER BY next_attempt_at ASC, id ASC
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        `);
        if (rows.length) {
          await tx.carrierDispatchOutbox.updateMany({
            where: { id: { in: rows.map((row) => row.id) }, outcome: null },
            data: { leaseOwner, leaseUntil, attemptCount: { increment: 1 } },
          });
        }
        return rows.map((row) => row.id);
      });
      for (const id of claimed) await this.dispatch(id, leaseOwner);
    } finally {
      this.running = false;
    }
  }

  private async dispatch(outboxId: string, leaseOwner: string): Promise<void> {
    const row = await this.prisma.carrierDispatchOutbox.findUnique({
      where: { id: outboxId },
      include: { shipment: true },
    });
    if (!row) return;
    try {
      const snapshot = row.shipment.shippingSnapshot;
      if (!isShippingBreakdown(snapshot) || snapshot.provider !== 'DEMO_CARRIER') {
        throw new Error('carrier_payload_invalid');
      }
      const demoShipping = snapshot as DemoCarrierShippingBreakdown;
      const payload = {
        shipmentReference: row.shipmentReference,
        trackingCode: row.shipment.trackingCode,
        pickup: { provinceCode: demoShipping.originProvinceCode, districtCode: demoShipping.originDistrictCode },
        delivery: { provinceCode: demoShipping.destinationProvinceCode, districtCode: demoShipping.destinationDistrictCode },
        shipmentWeightGrams: demoShipping.shipmentWeightGrams,
        service: demoShipping.service,
      };
      const body = Buffer.from(JSON.stringify(payload), 'utf8');
      const timestamp = Math.floor(Date.now() / 1_000).toString();
      const secret = process.env.DEMO_CARRIER_HMAC_ACTIVE_SECRET;
      const response = await fetch(`${process.env.DEMO_CARRIER_URL ?? 'http://localhost:3010'}/internal/v1/shipments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-Carrier-Timestamp': timestamp,
          'X-Demo-Carrier-Key-Id': process.env.DEMO_CARRIER_HMAC_ACTIVE_KEY_ID ?? 'local-demo-carrier-v1',
          ...(secret ? { 'X-Demo-Carrier-Signature': createCarrierSignature(secret, timestamp, 'POST', '/internal/v1/shipments', body) } : {}),
        },
        body,
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`carrier_http_${response.status}`);
      const external = (await response.json()) as { externalShipmentId?: string; status?: string };
      if (!external || typeof external.externalShipmentId !== 'string' || external.status !== 'CREATED') {
        throw new Error('carrier_malformed_response');
      }
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.sellerOrderShipment.findUnique({ where: { id: row.shipmentId } });
        if (!current || current.shipmentVersion !== 0) {
          await tx.carrierDispatchOutbox.updateMany({ where: { id: row.id, leaseOwner }, data: { outcome: 'DUPLICATE', leaseUntil: null, leaseOwner: null } });
          return;
        }
        await tx.sellerOrderShipment.update({ where: { id: row.shipmentId }, data: { status: 'CREATED', providerVersion: 'demo-distance-v1', externalShipmentId: external.externalShipmentId ?? null, shipmentVersion: 1, registeredAt: new Date(), lastUpdatedAt: new Date() } });
        await tx.sellerOrderShipmentEvent.create({ data: { id: randomUUID(), shipmentId: row.shipmentId, status: 'CREATED', previousStatus: 'REGISTRATION_PENDING', shipmentVersion: 1, externalEventId: `register-${randomUUID()}`, carrierOccurredAt: new Date(), occurredAt: new Date() } });
        await tx.carrierDispatchOutbox.updateMany({ where: { id: row.id, leaseOwner }, data: { outcome: 'SUCCEEDED', leaseUntil: null, leaseOwner: null } });
      });
    } catch (error) {
      const attempt = row.attemptCount;
      const errorCode = error instanceof Error ? error.message.slice(0, 80) : 'carrier_unavailable';
      const terminal = attempt >= 5 || /carrier_(?:http_4\d\d|malformed_response|payload_invalid)/.test(errorCode);
      const baseDelay = Math.min(60_000, 2 ** Math.min(attempt, 6) * 1_000);
      const jitterSeed = (createHash('sha256').update(`${row.id}:${attempt}`).digest()[0] ?? 0) / 255;
      const retryDelay = Math.min(60_000, Math.max(1_000, Math.round(baseDelay * (0.8 + jitterSeed * 0.4))));
      await this.prisma.$transaction(async (tx) => {
        await tx.carrierDispatchOutbox.updateMany({ where: { id: row.id, leaseOwner }, data: { outcome: terminal ? 'FAILED' : null, errorCode, leaseUntil: null, leaseOwner: null, nextAttemptAt: new Date(Date.now() + retryDelay) } });
        if (terminal) {
          const current = await tx.sellerOrderShipment.findUnique({ where: { id: row.shipmentId } });
          if (current && current.status === 'REGISTRATION_PENDING') {
            const now = new Date();
            const nextVersion = current.shipmentVersion + 1;
            await tx.sellerOrderShipment.update({ where: { id: row.shipmentId }, data: { status: 'REGISTRATION_FAILED', lastUpdatedAt: now, shipmentVersion: nextVersion } });
            await tx.sellerOrderShipmentEvent.create({ data: { id: randomUUID(), shipmentId: row.shipmentId, status: 'REGISTRATION_FAILED', previousStatus: 'REGISTRATION_PENDING', shipmentVersion: nextVersion, externalEventId: `registration-failed-${randomUUID()}`, publicReason: null, carrierOccurredAt: now, occurredAt: now } });
          }
        }
      });
    }
  }
}

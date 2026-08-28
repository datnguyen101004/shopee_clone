import { createHash, randomUUID } from 'node:crypto';

import {
  DEMO_CARRIER_LOCATION_SNAPSHOT,
  DEMO_CARRIER_MAX_DISTANCE_KM,
  DEMO_CARRIER_MIN_DISTANCE_KM,
  DEMO_CARRIER_OPERATION_ACTIONS,
  DEMO_CARRIER_PROVIDER,
  DEMO_CARRIER_ROAD_FACTOR,
  DEMO_CARRIER_SERVICES,
  DEMO_CARRIER_TARIFFS,
  DEMO_CARRIER_VERSION,
  demoCarrierActionAllowed,
  demoCarrierNextState,
  type DemoCarrierCallbackAcknowledgement,
  type DemoCarrierOperationAction,
  type DemoCarrierOperationResponse,
  type DemoCarrierQuote,
  type DemoCarrierShipment,
  type DemoCarrierTrackingEvent,
} from '@shopee-clone/contracts';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import type { OperationDto, QuoteRequestDto, RegisterShipmentDto, ShipmentListQueryDto } from './carrier.dto';

@Injectable()
export class DemoCarrierService {
  private readonly shipments = new Map<string, DemoCarrierShipment>();
  private readonly registrationDigests = new Map<string, string>();
  private readonly operationCommands = new Map<string, { digest: string; response: DemoCarrierOperationResponse }>();

  quote(request: QuoteRequestDto): DemoCarrierQuote {
    try {
      const service = request.service ?? 'STANDARD';
      const weight = request.shipmentWeightGrams;
      if (!DEMO_CARRIER_SERVICES.includes(service)) throw new BadRequestException('Unsupported service');
      const pickup = this.location(request.pickup.provinceCode, request.pickup.districtCode);
      const delivery = this.location(request.delivery.provinceCode, request.delivery.districtCode);
      const straightLineDistanceKm = this.distanceKm(pickup.latitude, pickup.longitude, delivery.latitude, delivery.longitude);
      const estimatedDistanceKm = Math.ceil(straightLineDistanceKm * DEMO_CARRIER_ROAD_FACTOR);
      if (estimatedDistanceKm > DEMO_CARRIER_MAX_DISTANCE_KM) throw new BadRequestException('Unsupported route distance');
      const distance = Math.max(DEMO_CARRIER_MIN_DISTANCE_KM, estimatedDistanceKm);
      const tariff = DEMO_CARRIER_TARIFFS[service];
      const nearBlocks = Math.ceil(Math.min(Math.max(distance - 5, 0), 45) / 5);
      const longBlocks = Math.ceil(Math.max(distance - 50, 0) / 100);
      const weightBlocks = Math.ceil(Math.max(weight - 500, 0) / 500);
      const baseFeeMinor = tariff.baseFeeMinor;
      const nearDistanceFeeMinor = nearBlocks * tariff.nearDistanceBlockMinor;
      const longDistanceFeeMinor = longBlocks * tariff.longDistanceBlockMinor;
      const weightFeeMinor = weightBlocks * tariff.weightBlockMinor;
      return {
        provider: 'DEMO_CARRIER',
        version: DEMO_CARRIER_VERSION,
        simulation: true,
        shipmentReference: request.shipmentReference,
        pickup: { provinceCode: pickup.provinceCode, districtCode: pickup.districtCode, provinceName: pickup.provinceName, districtName: pickup.districtName, resolutionLevel: 'DISTRICT' },
        delivery: { provinceCode: delivery.provinceCode, districtCode: delivery.districtCode, provinceName: delivery.provinceName, districtName: delivery.districtName, resolutionLevel: 'DISTRICT' },
        straightLineDistanceKm,
        estimatedDistanceKm: distance,
        billableDistanceKm: distance,
        shipmentWeightGrams: weight,
        service,
        estimatedDaysMin: tariff.estimatedDaysMin,
        estimatedDaysMax: tariff.estimatedDaysMax,
        baseFeeMinor,
        nearDistanceFeeMinor,
        longDistanceFeeMinor,
        weightFeeMinor,
        totalFeeMinor: baseFeeMinor + nearDistanceFeeMinor + longDistanceFeeMinor + weightFeeMinor,
        currency: 'VND',
        calculationVersion: DEMO_CARRIER_VERSION,
        locationSnapshotVersion: 'vn-legacy-63-696-v1',
        calculatedAt: new Date().toISOString(),
      };
    } catch (error) {
      throw new BadRequestException({
        type: 'https://shopee-clone.local/problems/carrier-quote-unavailable',
        title: 'Không thể tính phí vận chuyển',
        status: 400,
        detail: error instanceof Error ? error.message : 'Bad Request',
      });
    }
  }

  private location(provinceCode: string, districtCode: string) {
    const point = DEMO_CARRIER_LOCATION_SNAPSHOT.find(
      (item) => item.provinceCode === provinceCode && item.districtCode === districtCode,
    );
    if (!point) throw new BadRequestException('Unknown pickup or delivery location');
    return point;
  }

  private distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6_371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  register(request: RegisterShipmentDto): DemoCarrierShipment {
    const digest = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const existing = this.shipments.get(request.shipmentReference);
    const previousDigest = this.registrationDigests.get(request.shipmentReference);
    if (existing) {
      if (previousDigest !== digest) throw new BadRequestException('Shipment reference conflict');
      return existing;
    }
    const quote = this.quote(request);
    const now = new Date().toISOString();
    const shipment: DemoCarrierShipment = {
      provider: DEMO_CARRIER_PROVIDER,
      version: DEMO_CARRIER_VERSION,
      simulation: true,
      shipmentReference: request.shipmentReference,
      trackingCode: request.trackingCode,
      externalShipmentId: `DEMO-${randomUUID().slice(0, 12).toUpperCase()}`,
      status: 'CREATED',
      service: quote.service,
      quote,
      versionNumber: 1,
      registeredAt: now,
      lastUpdatedAt: now,
      deliveredAt: null,
      returnedAt: null,
      events: [
        {
          externalEventId: `evt-${randomUUID()}`,
          shipmentReference: request.shipmentReference,
          previousStatus: null,
          status: 'CREATED',
          versionNumber: 1,
          reason: null,
          note: null,
          occurredAt: now,
        },
      ],
    };
    this.registrationDigests.set(request.shipmentReference, digest);
    this.shipments.set(request.shipmentReference, shipment);
    return shipment;
  }

  list(query: ShipmentListQueryDto = { limit: 50 }): { body: { provider: typeof DEMO_CARRIER_PROVIDER; simulation: true; items: DemoCarrierShipment[]; page: { limit: number; nextCursor: string | null } }; etag: string } {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 50);
    const cursor = this.decodeCursor(query.cursor);
    const from = query.from ? Date.parse(query.from) : null;
    const to = query.to ? Date.parse(query.to) : null;
    const filtered = [...this.shipments.values()]
      .filter((shipment) => !query.reference || shipment.shipmentReference === query.reference)
      .filter((shipment) => !query.status || shipment.status === query.status)
      .filter((shipment) => !query.service || shipment.service === query.service)
      .filter((shipment) => from === null || Date.parse(shipment.lastUpdatedAt) >= from)
      .filter((shipment) => to === null || Date.parse(shipment.lastUpdatedAt) <= to)
      .sort((left, right) => right.lastUpdatedAt.localeCompare(left.lastUpdatedAt) || right.trackingCode.localeCompare(left.trackingCode));
    const afterCursor = cursor
      ? filtered.filter((shipment) => shipment.lastUpdatedAt < cursor.updatedAt || (shipment.lastUpdatedAt === cursor.updatedAt && shipment.trackingCode < cursor.trackingCode))
      : filtered;
    const items = afterCursor.slice(0, limit);
    const last = items.at(-1);
    const hasMore = afterCursor.length > limit;
    const nextCursor = hasMore && last ? this.encodeCursor({ updatedAt: last.lastUpdatedAt, trackingCode: last.trackingCode }) : null;
    const body = { provider: DEMO_CARRIER_PROVIDER, simulation: true as const, items, page: { limit: items.length, nextCursor } };
    return { body, etag: `"${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)}"` };
  }

  detail(shipmentReference: string): DemoCarrierShipment {
    const shipment = this.shipments.get(shipmentReference);
    if (!shipment) throw new NotFoundException('Shipment not found');
    return shipment;
  }

  private encodeCursor(value: { updatedAt: string; trackingCode: string }): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  }

  private decodeCursor(value?: string): { updatedAt: string; trackingCode: string } | null {
    if (!value) return null;
    try {
      const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
      if (typeof decoded.updatedAt !== 'string' || typeof decoded.trackingCode !== 'string' || !Number.isFinite(Date.parse(decoded.updatedAt))) throw new Error('invalid');
      return { updatedAt: decoded.updatedAt, trackingCode: decoded.trackingCode };
    } catch {
      throw new BadRequestException('Invalid shipment cursor');
    }
  }

  action(shipmentReference: string, request: OperationDto, commandId?: string): DemoCarrierOperationResponse {
    const digest = commandId ? createHash('sha256').update(JSON.stringify(request)).digest('hex') : null;
    if (commandId) {
      const replay = this.operationCommands.get(commandId);
      if (replay) {
        if (replay.digest !== digest) throw new BadRequestException('Idempotency key conflict');
        return replay.response;
      }
    }
    const shipment = this.detail(shipmentReference);
    const action = request.action as DemoCarrierOperationAction;
    if (!DEMO_CARRIER_OPERATION_ACTIONS.includes(action) || !demoCarrierActionAllowed(shipment.status, action)) {
      throw new BadRequestException('Action is not available for the current shipment state');
    }
    if (action === 'FAIL_DELIVERY' && !request.reason) throw new BadRequestException('Failure reason is required');
    if (action === 'FAIL_DELIVERY' && request.reason === 'OTHER' && !request.note?.trim()) throw new BadRequestException('A note is required for OTHER');
    const next = demoCarrierNextState(shipment.status, action);
    if (!next) throw new BadRequestException('Invalid shipment transition');
    const now = new Date().toISOString();
    const event: DemoCarrierTrackingEvent = {
      externalEventId: `evt-${randomUUID()}`,
      shipmentReference,
      previousStatus: shipment.status,
      status: next,
      versionNumber: shipment.versionNumber + 1,
      reason: request.reason ?? null,
      note: request.note?.trim() || null,
      occurredAt: now,
    };
    const updated: DemoCarrierShipment = {
      ...shipment,
      status: next,
      versionNumber: event.versionNumber,
      lastUpdatedAt: now,
      deliveredAt: next === 'DELIVERED' ? now : shipment.deliveredAt,
      returnedAt: next === 'RETURNED' ? now : shipment.returnedAt,
      events: [...shipment.events, event],
    };
    this.shipments.set(shipmentReference, updated);
    const callback: DemoCarrierCallbackAcknowledgement = {
      provider: DEMO_CARRIER_PROVIDER,
      externalEventId: event.externalEventId,
      outcome: 'APPLIED',
      status: next,
      versionNumber: event.versionNumber,
      receivedAt: now,
    };
    const response = { shipment: updated, callback };
    if (commandId && digest) this.operationCommands.set(commandId, { digest, response });
    return response;
  }
}

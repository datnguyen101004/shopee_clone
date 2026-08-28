import { BadRequestException } from '@nestjs/common';

import { DemoCarrierService } from './demo-carrier.service';

describe('DemoCarrierService', () => {
  const request = {
    shipmentReference: 'order-1',
    trackingCode: 'DEMO-ORDER-1',
    pickup: { provinceCode: '01', districtCode: '01-001' },
    delivery: { provinceCode: '79', districtCode: '79-001' },
    shipmentWeightGrams: 1_000,
    service: 'STANDARD' as const,
  };

  it('calculates a distance-based quote with the committed location snapshot', () => {
    const service = new DemoCarrierService();
    const quote = service.quote(request);
    expect(quote.provider).toBe('DEMO_CARRIER');
    expect(quote.billableDistanceKm).toBeGreaterThanOrEqual(3);
    expect(quote.totalFeeMinor).toBe(
      quote.baseFeeMinor +
        quote.nearDistanceFeeMinor +
        quote.longDistanceFeeMinor +
        quote.weightFeeMinor,
    );
    expect(quote.pickup.districtName).not.toBe(request.pickup.districtCode);
  });

  it('replays identical registrations and rejects a digest conflict', () => {
    const service = new DemoCarrierService();
    const first = service.register(request);
    expect(service.register(request)).toBe(first);
    expect(() => service.register({ ...request, trackingCode: 'DEMO-OTHER' })).toThrow(
      BadRequestException,
    );
  });

  it('filters and paginates shipments with a stable cursor and ETag', () => {
    const service = new DemoCarrierService();
    service.register(request);
    service.register({ ...request, shipmentReference: 'order-2', trackingCode: 'DEMO-ORDER-2' });
    const first = service.list({ limit: 1 });
    expect(first.body.items).toHaveLength(1);
    expect(first.body.page.nextCursor).toBeTruthy();
    expect(first.etag).toMatch(/^"[a-f0-9]{32}"$/);
    const second = service.list({ limit: 1, cursor: first.body.page.nextCursor ?? undefined });
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0]?.shipmentReference).not.toBe(first.body.items[0]?.shipmentReference);
  });

  it('replays a carrier command by idempotency key and rejects a conflicting body', () => {
    const service = new DemoCarrierService();
    service.register(request);
    const first = service.action(request.shipmentReference, { action: 'ADVANCE' }, '00000000-0000-4000-8000-000000000001');
    expect(service.action(request.shipmentReference, { action: 'ADVANCE' }, '00000000-0000-4000-8000-000000000001')).toBe(first);
    expect(() => service.action(request.shipmentReference, { action: 'FAIL_DELIVERY', reason: 'OTHER', note: 'x' }, '00000000-0000-4000-8000-000000000001')).toThrow(BadRequestException);
  });
});

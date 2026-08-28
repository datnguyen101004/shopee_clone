import {
  DEMO_CARRIER_LOCATION_SNAPSHOT,
  DEMO_CARRIER_LOCATION_SNAPSHOT_DIGEST,
  demoCarrierActionAllowed,
  demoCarrierNextState,
  isDemoCarrierCallbackPayload,
  isDemoCarrierOperationRequest,
  isDemoCarrierQuote,
} from '../src/carrier';
import { describe, expect, it } from 'vitest';

describe('Demo Carrier contracts', () => {
  it('accepts an exact callback payload and rejects unknown fields', () => {
    const payload = {
      externalEventId: 'evt-1',
      externalShipmentId: 'DEMO-1',
      shipmentReference: 'order-1',
      status: 'IN_TRANSIT',
      versionNumber: 3,
      occurredAt: '2026-01-01T00:00:00.000Z',
    };
    expect(isDemoCarrierCallbackPayload(payload)).toBe(true);
    expect(isDemoCarrierCallbackPayload({ ...payload, unexpected: true })).toBe(false);
  });

  it('only allows forward delivery actions and controlled failures', () => {
    expect(demoCarrierNextState('CREATED', 'ADVANCE')).toBe('OUT_FOR_DELIVERY');
    expect(demoCarrierNextState('DELIVERY_FAILED', 'RETRY_DELIVERY')).toBe('OUT_FOR_DELIVERY');
    expect(demoCarrierActionAllowed('DELIVERED', 'ADVANCE')).toBe(false);
    expect(demoCarrierActionAllowed('DELIVERY_FAILED', 'START_RETURN')).toBe(true);
  });

  it('requires a reason only at the application boundary for delivery failure', () => {
    expect(isDemoCarrierOperationRequest({ action: 'FAIL_DELIVERY' })).toBe(true);
    expect(isDemoCarrierOperationRequest({ action: 'FAIL_DELIVERY', reason: 'RECIPIENT_UNREACHABLE' })).toBe(true);
    expect(isDemoCarrierOperationRequest({ action: 'NOPE' })).toBe(false);
  });

  it('rejects malformed quote objects', () => {
    expect(isDemoCarrierQuote({ provider: 'DEMO_CARRIER' })).toBe(false);
  });

  it('keeps the location snapshot count, bounds and digest stable', () => {
    expect(DEMO_CARRIER_LOCATION_SNAPSHOT).toHaveLength(696);
    expect(new Set(DEMO_CARRIER_LOCATION_SNAPSHOT.map((item) => item.districtCode)).size).toBe(696);
    expect(new Set(DEMO_CARRIER_LOCATION_SNAPSHOT.map((item) => item.districtName)).size).toBe(696);
    expect(DEMO_CARRIER_LOCATION_SNAPSHOT.every((item) => item.latitude >= 8 && item.latitude <= 21 && item.longitude >= 102 && item.longitude <= 110)).toBe(true);
    expect(DEMO_CARRIER_LOCATION_SNAPSHOT_DIGEST).toMatch(/^[0-9a-f]{8}$/);
  });
});

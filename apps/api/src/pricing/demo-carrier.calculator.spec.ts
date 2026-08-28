import { DemoCarrierCalculator } from './demo-carrier.calculator';

describe('DemoCarrierCalculator', () => {
  const calculator = new DemoCarrierCalculator();
  const base = {
    shipmentReference: '11111111-1111-4111-8111-111111111111',
    originProvince: 'Hà Nội',
    originDistrict: 'Ba Đình',
    destinationProvince: 'Hà Nội',
    destinationDistrict: 'Ba Dinh',
    shipmentWeightGrams: 500,
    service: 'STANDARD' as const,
  };

  it('returns a deterministic minimum distance quote for the same district', () => {
    const first = calculator.calculate({ ...base, calculatedAt: new Date('2026-01-01T00:00:00.000Z') });
    const second = calculator.calculate({ ...base, calculatedAt: new Date('2026-01-02T00:00:00.000Z') });
    expect(first.billableDistanceKm).toBe(3);
    expect(first.totalFeeMinor).toBe(22_000);
    expect(first.pickup.districtCode).toBe('01-001');
    expect(first.delivery.districtCode).toBe('01-001');
    expect({ ...first, calculatedAt: 'same' }).toEqual({ ...second, calculatedAt: 'same' });
  });

  it('applies near, long-distance and weight blocks', () => {
    const quote = calculator.calculate({
      ...base,
      originProvince: 'Hà Nội',
      destinationProvince: 'Thành phố Hồ Chí Minh',
      destinationDistrict: 'Quận 1',
      shipmentWeightGrams: 1_200,
    });
    expect(quote.nearDistanceFeeMinor).toBeGreaterThan(0);
    expect(quote.weightFeeMinor).toBe(6_000);
    expect(quote.totalFeeMinor).toBe(
      quote.baseFeeMinor + quote.nearDistanceFeeMinor + quote.longDistanceFeeMinor + quote.weightFeeMinor,
    );
  });

  it('requires a pickup district', () => {
    expect(() => calculator.calculate({ ...base, originDistrict: null })).toThrow('MISSING_PICKUP_DISTRICT');
  });
});

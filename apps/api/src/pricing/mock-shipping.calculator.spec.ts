import { MockShippingCalculator } from './mock-shipping.calculator';

const calculator = new MockShippingCalculator();
const shopId = '00000000-0000-4000-8000-000000000001';

describe('mock shipping calculator', () => {
  it.each([
    {
      name: 'same province first 500g',
      origin: 'TP. Hồ Chí Minh',
      destination: 'Thành phố Hồ Chí Minh',
      weight: 500,
      service: 'STANDARD' as const,
      zone: 'SAME_PROVINCE',
      fee: 22_000,
    },
    {
      name: 'same region started block',
      origin: 'Hà Nội',
      destination: 'Hải Phòng',
      weight: 501,
      service: 'ECONOMY' as const,
      zone: 'SAME_REGION',
      fee: 24_000,
    },
    {
      name: 'cross region 1200g',
      origin: 'Hà Nội',
      destination: 'TP. Hồ Chí Minh',
      weight: 1_200,
      service: 'STANDARD' as const,
      zone: 'CROSS_REGION',
      fee: 42_000,
    },
    {
      name: 'unknown origin is conservative',
      origin: 'Kho hàng chưa chuẩn hóa',
      destination: 'Đà Nẵng',
      weight: 500,
      service: 'EXPRESS' as const,
      zone: 'UNKNOWN',
      fee: 47_000,
    },
  ])(
    'calculates $name deterministically',
    ({ origin, destination, weight, service, zone, fee }) => {
      const result = calculator.calculate({
        shopId,
        originProvince: origin,
        destinationProvince: destination,
        shipmentWeightGrams: weight,
        service,
      });
      expect(result.zone).toBe(zone);
      expect(result.shippingFeeMinor).toBe(fee);
      expect(result.provider).toBe('MOCK');
    },
  );

  it('publishes the versioned service catalog rates and ETA', () => {
    expect(
      (['ECONOMY', 'STANDARD', 'EXPRESS'] as const).map((service) => {
        const result = calculator.calculate({
          shopId,
          originProvince: 'Hà Nội',
          destinationProvince: 'Hà Nội',
          shipmentWeightGrams: 500,
          service,
        });
        return [service, result.baseFeeMinor, result.estimatedDaysMin, result.estimatedDaysMax];
      }),
    ).toEqual([
      ['ECONOMY', 15_000, 4, 6],
      ['STANDARD', 22_000, 2, 4],
      ['EXPRESS', 35_000, 1, 2],
    ]);
  });
});

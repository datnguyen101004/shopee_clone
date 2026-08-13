import {
  MOCK_SHIPPING_VERSION,
  resolveLegacyVietnamProvince,
  type MockShippingBreakdown,
  type ShippingServiceCode,
  type ShippingZone,
} from '@shopee-clone/contracts';
import { Injectable } from '@nestjs/common';

import { checkedAdd, checkedInteger, checkedMultiply } from './money';

const SERVICE_RULES: Record<
  ShippingServiceCode,
  {
    baseFeeMinor: number;
    perBlockMinor: number;
    estimatedDaysMin: number;
    estimatedDaysMax: number;
  }
> = {
  ECONOMY: {
    baseFeeMinor: 15_000,
    perBlockMinor: 3_000,
    estimatedDaysMin: 4,
    estimatedDaysMax: 6,
  },
  STANDARD: {
    baseFeeMinor: 22_000,
    perBlockMinor: 4_000,
    estimatedDaysMin: 2,
    estimatedDaysMax: 4,
  },
  EXPRESS: {
    baseFeeMinor: 35_000,
    perBlockMinor: 6_000,
    estimatedDaysMin: 1,
    estimatedDaysMax: 2,
  },
};

export interface MockShippingInput {
  shopId: string;
  originProvince: string;
  destinationProvince: string;
  shipmentWeightGrams: number;
  service: ShippingServiceCode;
}

function resolveZone(origin: string, destination: string): ShippingZone {
  const originProvince = resolveLegacyVietnamProvince(origin);
  const destinationProvince = resolveLegacyVietnamProvince(destination);
  if (!originProvince || !destinationProvince) return 'UNKNOWN';
  if (originProvince.code === destinationProvince.code) return 'SAME_PROVINCE';
  return originProvince.region === destinationProvince.region ? 'SAME_REGION' : 'CROSS_REGION';
}

@Injectable()
export class MockShippingCalculator {
  calculate(input: MockShippingInput): MockShippingBreakdown {
    const weight = checkedInteger(input.shipmentWeightGrams);
    if (weight < 1) throw new Error('A non-empty shipment requires positive weight.');
    const rule = SERVICE_RULES[input.service];
    if (!rule) throw new Error('Unsupported mock shipping service.');
    const zone = resolveZone(input.originProvince, input.destinationProvince);
    const zoneSurchargeMinor =
      zone === 'SAME_PROVINCE' ? 0 : zone === 'SAME_REGION' ? 6_000 : 12_000;
    const extraWeight = Math.max(0, weight - 500);
    const extraBlocks = Math.floor((extraWeight + 499) / 500);
    const weightSurchargeMinor = checkedMultiply(extraBlocks, rule.perBlockMinor);
    return {
      provider: 'MOCK',
      version: MOCK_SHIPPING_VERSION,
      shopId: input.shopId,
      originProvince: input.originProvince,
      destinationProvince: input.destinationProvince,
      zone,
      shipmentWeightGrams: weight,
      service: input.service,
      estimatedDaysMin: rule.estimatedDaysMin,
      estimatedDaysMax: rule.estimatedDaysMax,
      baseFeeMinor: rule.baseFeeMinor,
      zoneSurchargeMinor,
      weightSurchargeMinor,
      shippingFeeMinor: checkedAdd(rule.baseFeeMinor, zoneSurchargeMinor, weightSurchargeMinor),
    };
  }
}

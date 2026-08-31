import {
  PRICING_CURRENCY,
  PRICING_VERSION,
  MOCK_SHIPPING_VERSION,
  VOUCHER_VERSION,
  type PricingQuoteAddress,
  type PricingQuoteExclusion,
  type PricingQuoteLine,
  type PricingQuoteResponse,
  type PricingQuoteShop,
  type ShippingServiceCode,
  type ShopShippingServiceSelection,
  type DemoCarrierShippingBreakdown,
} from '@shopee-clone/contracts';
import { Inject, Injectable, Optional } from '@nestjs/common';

import {
  checkedAdd,
  checkedInteger,
  checkedMoneyFromBigInt,
  checkedMultiply,
  checkedSubtract,
} from './money';
import { MockShippingCalculator } from './mock-shipping.calculator';
import { DemoCarrierCalculator } from './demo-carrier.calculator';

export interface AuthoritativePricingLine {
  lineId: string;
  productId: string;
  variantId: string;
  quantity: number;
  unitWeightGrams: number;
  sellingUnitPriceMinor: bigint;
  compareAtUnitPriceMinor: bigint | null;
  shop: {
    id: string;
    ownerUserId: string;
    slug: string;
    name: string;
    location: string;
    pickupProvince?: string | null;
    pickupDistrict?: string | null;
  };
}

export interface AuthoritativePricingSnapshot {
  cartVersion: number;
  evaluatedAt: Date;
  address: PricingQuoteAddress | null;
  lines: readonly AuthoritativePricingLine[];
  exclusions: readonly PricingQuoteExclusion[];
  services: readonly ShopShippingServiceSelection[];
}

function pricingLine(input: AuthoritativePricingLine): PricingQuoteLine {
  const quantity = checkedInteger(input.quantity);
  if (quantity < 1) throw new Error('A pricing line requires positive quantity.');
  const unitWeightGrams = checkedInteger(input.unitWeightGrams);
  if (unitWeightGrams < 1) throw new Error('A pricing line requires positive weight.');
  const sellingUnitPriceMinor = checkedMoneyFromBigInt(input.sellingUnitPriceMinor);
  const compareAt =
    input.compareAtUnitPriceMinor === null
      ? sellingUnitPriceMinor
      : checkedMoneyFromBigInt(input.compareAtUnitPriceMinor);
  const listUnitPriceMinor = Math.max(sellingUnitPriceMinor, compareAt);
  const listSubtotalMinor = checkedMultiply(listUnitPriceMinor, quantity);
  const merchandiseSubtotalMinor = checkedMultiply(sellingUnitPriceMinor, quantity);
  return {
    lineId: input.lineId,
    productId: input.productId,
    variantId: input.variantId,
    quantity,
    unitWeightGrams,
    shipmentWeightGrams: checkedMultiply(unitWeightGrams, quantity),
    listUnitPriceMinor,
    sellingUnitPriceMinor,
    listSubtotalMinor,
    productDiscountMinor: checkedSubtract(listSubtotalMinor, merchandiseSubtotalMinor),
    merchandiseSubtotalMinor,
    shopVoucherDiscountMinor: 0,
    platformVoucherDiscountMinor: 0,
    merchandiseVoucherDiscountMinor: 0,
    payableMerchandiseMinor: merchandiseSubtotalMinor,
  };
}

@Injectable()
export class CommercePricingCalculator {
  constructor(
    @Inject(MockShippingCalculator) private readonly shipping: MockShippingCalculator,
    @Optional()
    @Inject(DemoCarrierCalculator)
    private readonly demoShipping?: DemoCarrierCalculator,
  ) {}

  calculate(snapshot: AuthoritativePricingSnapshot): PricingQuoteResponse {
    checkedInteger(snapshot.cartVersion);
    const serviceByShop = new Map<string, ShippingServiceCode>();
    for (const selection of snapshot.services) {
      if (serviceByShop.has(selection.shopId)) throw new Error('Duplicate shop service choice.');
      serviceByShop.set(selection.shopId, selection.service);
    }

    const grouped = new Map<string, AuthoritativePricingLine[]>();
    for (const line of snapshot.lines) {
      const group = grouped.get(line.shop.id) ?? [];
      group.push(line);
      grouped.set(line.shop.id, group);
    }

    const shops: PricingQuoteShop[] = [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, authoritativeLines]) => {
        const ordered = [...authoritativeLines].sort((left, right) =>
          left.lineId.localeCompare(right.lineId),
        );
        const first = ordered[0]!;
        if (ordered.some((line) => line.shop.id !== first.shop.id)) {
          throw new Error('A pricing group cannot mix shops.');
        }
        const lines = ordered.map(pricingLine);
        const listSubtotalMinor = checkedAdd(...lines.map((line) => line.listSubtotalMinor));
        const productDiscountMinor = checkedAdd(...lines.map((line) => line.productDiscountMinor));
        const merchandiseSubtotalMinor = checkedAdd(
          ...lines.map((line) => line.merchandiseSubtotalMinor),
        );
        const shipmentWeightGrams = checkedAdd(...lines.map((line) => line.shipmentWeightGrams));
        const service = serviceByShop.get(first.shop.id) ?? 'STANDARD';
        const demoCarrierEnabled = process.env.DEMO_CARRIER_ENABLED === 'true';
        const shipping = !snapshot.address
          ? null
          : demoCarrierEnabled
            ? (() => {
                if (!this.demoShipping) throw new Error('Demo Carrier calculator unavailable.');
                const quote = this.demoShipping.calculate({
                  shipmentReference: first.shop.id,
                  originProvince: first.shop.pickupProvince ?? first.shop.location,
                  originDistrict: first.shop.pickupDistrict,
                  destinationProvince: snapshot.address.province,
                  destinationDistrict: snapshot.address.district,
                  shipmentWeightGrams,
                  service,
                  calculatedAt: snapshot.evaluatedAt,
                });
                return {
                  provider: 'DEMO_CARRIER' as const,
                  version: quote.version,
                  shopId: first.shop.id,
                  originProvinceCode: quote.pickup.provinceCode,
                  originDistrictCode: quote.pickup.districtCode,
                  originProvince: quote.pickup.provinceName,
                  originDistrict: quote.pickup.districtName,
                  destinationProvinceCode: quote.delivery.provinceCode,
                  destinationDistrictCode: quote.delivery.districtCode,
                  destinationProvince: quote.delivery.provinceName,
                  destinationDistrict: quote.delivery.districtName,
                  shipmentWeightGrams: quote.shipmentWeightGrams,
                  service: quote.service,
                  simulation: true as const,
                  straightLineDistanceKm: quote.straightLineDistanceKm,
                  estimatedDistanceKm: quote.estimatedDistanceKm,
                  billableDistanceKm: quote.billableDistanceKm,
                  estimatedDaysMin: quote.estimatedDaysMin,
                  estimatedDaysMax: quote.estimatedDaysMax,
                  baseFeeMinor: quote.baseFeeMinor,
                  nearDistanceFeeMinor: quote.nearDistanceFeeMinor,
                  longDistanceFeeMinor: quote.longDistanceFeeMinor,
                  weightFeeMinor: quote.weightFeeMinor,
                  shippingFeeMinor: quote.totalFeeMinor,
                  calculationVersion: quote.calculationVersion,
                  locationSnapshotVersion: quote.locationSnapshotVersion,
                } satisfies DemoCarrierShippingBreakdown;
              })()
            : this.shipping.calculate({
                shopId: first.shop.id,
                originProvince: first.shop.location,
                destinationProvince: snapshot.address.province,
                shipmentWeightGrams,
                service,
              });
        return {
          shop: {
            id: first.shop.id,
            ownerUserId: first.shop.ownerUserId,
            slug: first.shop.slug,
            name: first.shop.name,
          },
          lines,
          shipping,
          listSubtotalMinor,
          productDiscountMinor,
          merchandiseSubtotalMinor,
          shopVoucherDiscountMinor: 0,
          platformVoucherDiscountMinor: 0,
          merchandiseVoucherDiscountMinor: 0,
          shippingVoucherDiscountMinor: 0,
          voucherDiscountMinor: 0,
          shippingPayableMinor: shipping?.shippingFeeMinor ?? 0,
          payableTotalMinor: checkedAdd(merchandiseSubtotalMinor, shipping?.shippingFeeMinor ?? 0),
        };
      });

    const allLines = shops.flatMap((shop) => shop.lines);
    return {
      pricingVersion: PRICING_VERSION,
      voucherVersion: VOUCHER_VERSION,
      shippingVersion: snapshot.address
        ? shops.some((shop) => shop.shipping?.provider === 'DEMO_CARRIER')
          ? 'demo-distance-v1'
          : MOCK_SHIPPING_VERSION
        : null,
      currency: PRICING_CURRENCY,
      evaluatedAt: snapshot.evaluatedAt.toISOString(),
      cartVersion: snapshot.cartVersion,
      address: snapshot.address,
      shops,
      vouchers: [],
      exclusions: [...snapshot.exclusions].sort((left, right) =>
        left.lineId.localeCompare(right.lineId),
      ),
      summary: {
        selectedLineCount: allLines.length,
        selectedQuantity: checkedAdd(...allLines.map((line) => line.quantity)),
        listSubtotalMinor: checkedAdd(...shops.map((shop) => shop.listSubtotalMinor)),
        productDiscountMinor: checkedAdd(...shops.map((shop) => shop.productDiscountMinor)),
        merchandiseSubtotalMinor: checkedAdd(...shops.map((shop) => shop.merchandiseSubtotalMinor)),
        shippingTotalMinor: checkedAdd(
          ...shops.map((shop) => shop.shipping?.shippingFeeMinor ?? 0),
        ),
        shopVoucherDiscountMinor: 0,
        platformVoucherDiscountMinor: 0,
        merchandiseVoucherDiscountMinor: 0,
        shippingVoucherDiscountMinor: 0,
        voucherDiscountMinor: 0,
        shippingPayableMinor: checkedAdd(
          ...shops.map((shop) => shop.shipping?.shippingFeeMinor ?? 0),
        ),
        payableTotalMinor: checkedAdd(...shops.map((shop) => shop.payableTotalMinor)),
      },
    };
  }
}

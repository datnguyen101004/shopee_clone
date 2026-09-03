import {
  BUYER_BEST_PRICE_VERSION,
  PRICING_CURRENCY,
  type AppliedPreviewVoucher,
  type BuyerBestPricePreview,
  type PricingQuoteResponse,
  type VoucherCodeSelection,
  type VoucherSelectionResult,
} from '@shopee-clone/contracts';

import {
  VoucherPricingCalculator,
  type VoucherDefinitionSnapshot,
} from '../vouchers/voucher-pricing.calculator';

export interface ProductVoucherPreviewFacts {
  productId: string;
  variantId: string;
  shop: {
    id: string;
    ownerUserId: string;
    slug: string;
    name: string;
    location: string;
  };
  effectivePriceMinor: number;
  evaluatedAt: Date;
  standardShippingFeeMinor: number | null;
  voucherDefinitions: readonly VoucherDefinitionSnapshot[];
}

export interface BuyerBestPriceOptimizerLimits {
  maxCandidatesPerSlot: number;
  maxCombinations: number;
}

export const DEFAULT_BUYER_BEST_PRICE_LIMITS: BuyerBestPriceOptimizerLimits = {
  maxCandidatesPerSlot: 8,
  maxCombinations: 256,
};

interface CandidateResult {
  preview: BuyerBestPricePreview;
  tuple: string;
  totalSavingMinor: number;
}

const potentialBenefit = (
  definition: VoucherDefinitionSnapshot,
  merchandiseMinor: number,
  shippingMinor: number,
): number => {
  const base = definition.benefitType === 'FREE_SHIPPING' ? shippingMinor : merchandiseMinor;
  if (definition.benefitType === 'FIXED_AMOUNT') {
    return Math.min(base, definition.fixedAmountMinor ?? 0);
  }
  if (definition.benefitType === 'PERCENTAGE') {
    return Math.min(
      base,
      definition.maximumDiscountMinor ?? 0,
      Math.floor((base * (definition.percentageBasisPoints ?? 0)) / 10_000),
    );
  }
  return Math.min(base, definition.maximumDiscountMinor ?? 0);
};

function boundedCandidates(
  definitions: readonly VoucherDefinitionSnapshot[],
  facts: ProductVoucherPreviewFacts,
  predicate: (definition: VoucherDefinitionSnapshot) => boolean,
  limit: number,
): VoucherDefinitionSnapshot[] {
  return definitions
    .filter(predicate)
    .slice()
    .sort((left, right) => {
      const benefitDifference =
        potentialBenefit(right, facts.effectivePriceMinor, facts.standardShippingFeeMinor ?? 0) -
        potentialBenefit(left, facts.effectivePriceMinor, facts.standardShippingFeeMinor ?? 0);
      return benefitDifference || left.code.localeCompare(right.code);
    })
    .slice(0, limit);
}

function baseQuote(facts: ProductVoucherPreviewFacts): PricingQuoteResponse {
  const shippingFeeMinor = facts.standardShippingFeeMinor ?? 0;
  const hasShipping = facts.standardShippingFeeMinor !== null;
  return {
    pricingVersion: 'pricing-v2',
    voucherVersion: 'voucher-v1',
    shippingVersion: hasShipping ? 'mock-v1' : null,
    currency: PRICING_CURRENCY,
    evaluatedAt: facts.evaluatedAt.toISOString(),
    cartVersion: 0,
    address: hasShipping
      ? {
          id: '00000000-0000-4000-8000-000000000000',
          province: 'Preview',
          district: 'Preview',
        }
      : null,
    shops: [
      {
        shop: facts.shop,
        lines: [
          {
            lineId: facts.variantId,
            productId: facts.productId,
            variantId: facts.variantId,
            quantity: 1,
            unitWeightGrams: 1,
            shipmentWeightGrams: 1,
            listUnitPriceMinor: facts.effectivePriceMinor,
            sellingUnitPriceMinor: facts.effectivePriceMinor,
            listSubtotalMinor: facts.effectivePriceMinor,
            productDiscountMinor: 0,
            merchandiseSubtotalMinor: facts.effectivePriceMinor,
            shopVoucherDiscountMinor: 0,
            platformVoucherDiscountMinor: 0,
            merchandiseVoucherDiscountMinor: 0,
            payableMerchandiseMinor: facts.effectivePriceMinor,
          },
        ],
        shipping: hasShipping
          ? {
              provider: 'MOCK',
              version: 'mock-v1',
              shopId: facts.shop.id,
              originProvince: 'Preview',
              destinationProvince: 'Preview',
              zone: 'SAME_PROVINCE',
              shipmentWeightGrams: 1,
              service: 'STANDARD',
              estimatedDaysMin: 2,
              estimatedDaysMax: 4,
              baseFeeMinor: shippingFeeMinor,
              zoneSurchargeMinor: 0,
              weightSurchargeMinor: 0,
              shippingFeeMinor,
            }
          : null,
        listSubtotalMinor: facts.effectivePriceMinor,
        productDiscountMinor: 0,
        merchandiseSubtotalMinor: facts.effectivePriceMinor,
        shopVoucherDiscountMinor: 0,
        platformVoucherDiscountMinor: 0,
        merchandiseVoucherDiscountMinor: 0,
        shippingVoucherDiscountMinor: 0,
        voucherDiscountMinor: 0,
        shippingPayableMinor: shippingFeeMinor,
        payableTotalMinor: facts.effectivePriceMinor + shippingFeeMinor,
      },
    ],
    vouchers: [],
    exclusions: [],
    summary: {
      selectedLineCount: 1,
      selectedQuantity: 1,
      listSubtotalMinor: facts.effectivePriceMinor,
      productDiscountMinor: 0,
      merchandiseSubtotalMinor: facts.effectivePriceMinor,
      shippingTotalMinor: shippingFeeMinor,
      shopVoucherDiscountMinor: 0,
      platformVoucherDiscountMinor: 0,
      merchandiseVoucherDiscountMinor: 0,
      shippingVoucherDiscountMinor: 0,
      voucherDiscountMinor: 0,
      shippingPayableMinor: shippingFeeMinor,
      payableTotalMinor: facts.effectivePriceMinor + shippingFeeMinor,
    },
  };
}

function appliedVoucher(result: VoucherSelectionResult | undefined): AppliedPreviewVoucher | null {
  if (!result || result.status !== 'APPLIED' || result.discountMinor <= 0 || !result.name)
    return null;
  return {
    code: result.code,
    name: result.name,
    slot: result.slot,
    discountMinor: result.discountMinor,
  };
}

function compareCandidate(left: CandidateResult, right: CandidateResult): number {
  const merchandise = left.preview.merchandisePayableMinor - right.preview.merchandisePayableMinor;
  if (merchandise) return merchandise;
  const leftEstimated = left.preview.shipping?.estimatedPayableMinor ?? Number.MAX_SAFE_INTEGER;
  const rightEstimated = right.preview.shipping?.estimatedPayableMinor ?? Number.MAX_SAFE_INTEGER;
  const estimated = leftEstimated - rightEstimated;
  if (estimated) return estimated;
  const saving = right.totalSavingMinor - left.totalSavingMinor;
  return saving || left.tuple.localeCompare(right.tuple);
}

export class BuyerBestPriceOptimizer {
  constructor(private readonly calculator = new VoucherPricingCalculator()) {}

  optimize(
    facts: ProductVoucherPreviewFacts,
    limits: BuyerBestPriceOptimizerLimits = DEFAULT_BUYER_BEST_PRICE_LIMITS,
  ): BuyerBestPricePreview {
    if (
      !Number.isSafeInteger(facts.effectivePriceMinor) ||
      facts.effectivePriceMinor < 0 ||
      !Number.isFinite(facts.evaluatedAt.getTime()) ||
      !Number.isInteger(limits.maxCandidatesPerSlot) ||
      limits.maxCandidatesPerSlot < 1 ||
      !Number.isInteger(limits.maxCombinations) ||
      limits.maxCombinations < 1
    ) {
      throw new Error('Buyer best price facts or limits are invalid.');
    }

    const shop = boundedCandidates(
      facts.voucherDefinitions,
      facts,
      (definition) =>
        definition.issuer === 'SHOP' &&
        definition.shopId === facts.shop.id &&
        definition.benefitType !== 'FREE_SHIPPING',
      limits.maxCandidatesPerSlot,
    );
    const platform = boundedCandidates(
      facts.voucherDefinitions,
      facts,
      (definition) =>
        definition.issuer === 'PLATFORM' && definition.benefitType !== 'FREE_SHIPPING',
      limits.maxCandidatesPerSlot,
    );
    const shipping =
      facts.standardShippingFeeMinor === null
        ? []
        : boundedCandidates(
            facts.voucherDefinitions,
            facts,
            (definition) =>
              definition.issuer === 'PLATFORM' && definition.benefitType === 'FREE_SHIPPING',
            limits.maxCandidatesPerSlot,
          );
    const shopOptions = [null, ...shop] as const;
    const platformOptions = [null, ...platform] as const;
    const shippingOptions = [null, ...shipping] as const;
    const quote = baseQuote(facts);
    const candidates: CandidateResult[] = [];

    outer: for (const shopVoucher of shopOptions) {
      for (const platformVoucher of platformOptions) {
        for (const shippingVoucher of shippingOptions) {
          if (candidates.length >= limits.maxCombinations) break outer;
          const selection: VoucherCodeSelection = {
            ...(shopVoucher
              ? { shopCodes: [{ shopId: facts.shop.id, code: shopVoucher.code }] }
              : {}),
            ...(platformVoucher ? { platformCode: platformVoucher.code } : {}),
            ...(shippingVoucher ? { freeShippingCode: shippingVoucher.code } : {}),
          };
          const calculated = this.calculator.apply(
            quote,
            selection,
            facts.voucherDefinitions,
            facts.evaluatedAt,
          ).quote;
          if (calculated.vouchers.some((voucher) => voucher.status !== 'APPLIED')) continue;
          const shopResult = calculated.vouchers.find((voucher) => voucher.slot === 'SHOP');
          const platformResult = calculated.vouchers.find((voucher) => voucher.slot === 'PLATFORM');
          const shippingResult = calculated.vouchers.find(
            (voucher) => voucher.slot === 'FREE_SHIPPING',
          );
          const merchandisePayableMinor =
            calculated.summary.payableTotalMinor - calculated.summary.shippingPayableMinor;
          const shopVoucherDiscountMinor = shopResult?.merchandiseDiscountMinor ?? 0;
          const platformVoucherDiscountMinor = platformResult?.merchandiseDiscountMinor ?? 0;
          const shippingVoucherDiscountMinor = shippingResult?.shippingDiscountMinor ?? 0;
          const preview: BuyerBestPricePreview = {
            version: BUYER_BEST_PRICE_VERSION,
            quantity: 1,
            currency: PRICING_CURRENCY,
            evaluatedAt: facts.evaluatedAt.toISOString(),
            effectivePriceMinor: facts.effectivePriceMinor,
            shopVoucher: appliedVoucher(shopResult),
            platformVoucher: appliedVoucher(platformResult),
            shopVoucherDiscountMinor,
            platformVoucherDiscountMinor,
            merchandiseDiscountMinor: shopVoucherDiscountMinor + platformVoucherDiscountMinor,
            merchandisePayableMinor,
            shipping:
              facts.standardShippingFeeMinor === null
                ? null
                : {
                    service: 'STANDARD',
                    shippingFeeMinor: facts.standardShippingFeeMinor,
                    voucher: appliedVoucher(shippingResult),
                    shippingVoucherDiscountMinor,
                    shippingPayableMinor: calculated.summary.shippingPayableMinor,
                    estimatedPayableMinor: calculated.summary.payableTotalMinor,
                  },
          };
          candidates.push({
            preview,
            tuple: [
              shopVoucher?.code ?? '',
              platformVoucher?.code ?? '',
              shippingVoucher?.code ?? '',
            ].join('|'),
            totalSavingMinor: preview.merchandiseDiscountMinor + shippingVoucherDiscountMinor,
          });
        }
      }
    }
    const winner = candidates.sort(compareCandidate)[0];
    if (!winner) throw new Error('Buyer best price combinations are exhausted.');
    return winner.preview;
  }
}

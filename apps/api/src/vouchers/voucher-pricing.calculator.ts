import {
  type AvailablePlatformVoucher,
  type AvailableShippingVoucher,
  type AvailableShopVoucher,
  type PricingQuoteLine,
  type PricingQuoteRequest,
  type PricingQuoteResponse,
  type VoucherBenefitType,
  type VoucherCodeSelection,
  type VoucherDiscountAllocation,
  type VoucherIssuer,
  type VoucherRejectionReason,
  type VoucherSelectionResult,
  type VoucherSlot,
} from '@shopee-clone/contracts';
import { Injectable } from '@nestjs/common';

import { checkedAdd, checkedInteger, checkedSubtract } from '../pricing/money';

export interface VoucherDefinitionSnapshot {
  id: string;
  code: string;
  name: string;
  issuer: VoucherIssuer;
  shopId: string | null;
  benefitType: VoucherBenefitType;
  fixedAmountMinor: number | null;
  percentageBasisPoints: number | null;
  maximumDiscountMinor: number | null;
  minimumSpendMinor: number;
  startsAt: Date;
  endsAt: Date;
  isEnabled: boolean;
  usageLimit: number;
  usedCount: number;
  perBuyerLimit: number;
  buyerUsedCount: number;
  productIds: readonly string[];
}

export interface AppliedVoucherSnapshot {
  voucherId: string;
  code: string;
  merchandiseDiscountMinor: number;
  shippingDiscountMinor: number;
  discountMinor: number;
}

export interface VoucherPricingResult {
  quote: PricingQuoteResponse;
  applied: AppliedVoucherSnapshot[];
}

interface RequestedVoucher {
  code: string;
  slot: VoucherSlot;
  shopId: string | null;
}

interface MutableLine {
  shopId: string;
  line: PricingQuoteLine;
  residualMinor: number;
  shopDiscountMinor: number;
  platformDiscountMinor: number;
}

interface WeightedTarget {
  key: string;
  shopId: string;
  lineId: string | null;
  weightMinor: number;
}

function checkedBigIntToMoney(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Voucher arithmetic exceeds safe VND bounds.');
  }
  return Number(value);
}

export function allocateLargestRemainder(
  totalMinor: number,
  targets: readonly WeightedTarget[],
): VoucherDiscountAllocation[] {
  checkedInteger(totalMinor);
  const ordered = targets
    .filter(({ weightMinor }) => weightMinor > 0)
    .map((target) => ({ ...target, weightMinor: checkedInteger(target.weightMinor) }))
    .sort((left, right) => left.key.localeCompare(right.key));
  const totalWeight = checkedAdd(...ordered.map(({ weightMinor }) => weightMinor));
  if (totalMinor === 0) return [];
  if (totalWeight === 0 || totalMinor > totalWeight) {
    throw new Error('Voucher allocation exceeds eligible value.');
  }
  const denominator = BigInt(totalWeight);
  const provisional = ordered.map((target) => {
    const numerator = BigInt(totalMinor) * BigInt(target.weightMinor);
    return {
      ...target,
      amountMinor: checkedBigIntToMoney(numerator / denominator),
      remainder: numerator % denominator,
    };
  });
  const allocated = checkedAdd(...provisional.map(({ amountMinor }) => amountMinor));
  let remaining = checkedSubtract(totalMinor, allocated);
  const remainderOrder = [...provisional].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.key.localeCompare(right.key);
  });
  for (const target of remainderOrder) {
    if (remaining === 0) break;
    target.amountMinor += 1;
    remaining -= 1;
  }
  if (remaining !== 0) throw new Error('Voucher allocation remainder is inconsistent.');
  return provisional
    .filter(({ amountMinor }) => amountMinor > 0)
    .map(({ shopId, lineId, amountMinor }) => ({ shopId, lineId, amountMinor }));
}

function requestedSelections(vouchers?: VoucherCodeSelection): RequestedVoucher[] {
  if (!vouchers) return [];
  const shop = [...(vouchers.shopCodes ?? [])]
    .sort((left, right) => left.shopId.localeCompare(right.shopId))
    .map(({ shopId, code }) => ({ code, slot: 'SHOP' as const, shopId }));
  return [
    ...shop,
    ...(vouchers.platformCode
      ? [{ code: vouchers.platformCode, slot: 'PLATFORM' as const, shopId: null }]
      : []),
    ...(vouchers.freeShippingCode
      ? [{ code: vouchers.freeShippingCode, slot: 'FREE_SHIPPING' as const, shopId: null }]
      : []),
  ];
}

function rejected(
  request: RequestedVoucher,
  reason: VoucherRejectionReason,
  definition?: VoucherDefinitionSnapshot,
): VoucherSelectionResult {
  return {
    code: request.code,
    slot: request.slot,
    shopId: request.shopId,
    status: 'REJECTED',
    name: definition?.name ?? null,
    issuer: definition?.issuer ?? null,
    benefitType: definition?.benefitType ?? null,
    rejectionReason: reason,
    discountMinor: 0,
    merchandiseDiscountMinor: 0,
    shippingDiscountMinor: 0,
    allocations: [],
  };
}

function remainingUses(definition: VoucherDefinitionSnapshot): number {
  return Math.max(
    0,
    Math.min(definition.usageLimit - definition.usedCount, definition.perBuyerLimit - definition.buyerUsedCount),
  );
}

function percentageBenefit(baseMinor: number, basisPoints: number, maximumMinor: number): number {
  checkedInteger(baseMinor);
  checkedInteger(basisPoints);
  checkedInteger(maximumMinor);
  const calculated = checkedBigIntToMoney((BigInt(baseMinor) * BigInt(basisPoints)) / 10_000n);
  return Math.min(calculated, maximumMinor, baseMinor);
}

export function listAvailableShopVouchers(
  quote: PricingQuoteResponse,
  definitions: readonly VoucherDefinitionSnapshot[],
  evaluatedAt: Date,
): AvailableShopVoucher[] {
  const offers: AvailableShopVoucher[] = [];
  for (const shop of quote.shops) {
    const shopOffers: AvailableShopVoucher[] = [];
    for (const definition of definitions) {
      if (definition.issuer !== 'SHOP' || definition.shopId !== shop.shop.id) continue;
      if (definition.benefitType === 'FREE_SHIPPING') continue;
      if (
        (definition.benefitType === 'FIXED_AMOUNT' && definition.fixedAmountMinor === null) ||
        (definition.benefitType === 'PERCENTAGE' &&
          (definition.percentageBasisPoints === null || definition.maximumDiscountMinor === null))
      ) {
        continue;
      }
      const request = { code: definition.code, slot: 'SHOP' as const, shopId: shop.shop.id };
      if (baseRejection(request, definition, evaluatedAt)) continue;
      const remainingCount = remainingUses(definition);
      if (remainingCount < 1) continue;
      const productScope = new Set(definition.productIds);
      const eligibleLines = shop.lines.filter(
        (line) => productScope.size === 0 || productScope.has(line.productId),
      );
      if (eligibleLines.length === 0) continue;
      const spend = checkedAdd(...eligibleLines.map((line) => line.merchandiseSubtotalMinor));
      if (spend < definition.minimumSpendMinor) continue;
      const estimatedDiscountMinor = benefitFor(definition, spend);
      if (estimatedDiscountMinor <= 0) continue;
      shopOffers.push({
        shopId: shop.shop.id,
        code: definition.code,
        name: definition.name,
        benefitType: definition.benefitType,
        minimumSpendMinor: definition.minimumSpendMinor,
        estimatedDiscountMinor,
        remainingCount,
      });
    }
    shopOffers.sort((left, right) => {
      if (left.estimatedDiscountMinor !== right.estimatedDiscountMinor) {
        return right.estimatedDiscountMinor - left.estimatedDiscountMinor;
      }
      return left.code.localeCompare(right.code);
    });
    offers.push(...shopOffers.slice(0, 20));
  }
  return offers.sort((left, right) => {
    if (left.shopId !== right.shopId) return left.shopId.localeCompare(right.shopId);
    if (left.estimatedDiscountMinor !== right.estimatedDiscountMinor) {
      return right.estimatedDiscountMinor - left.estimatedDiscountMinor;
    }
    return left.code.localeCompare(right.code);
  });
}

export function listAvailablePlatformVouchers(
  quote: PricingQuoteResponse,
  definitions: readonly VoucherDefinitionSnapshot[],
  evaluatedAt: Date,
): AvailablePlatformVoucher[] {
  const lines = quote.shops.flatMap((shop) => shop.lines);
  const offers: AvailablePlatformVoucher[] = [];
  for (const definition of definitions) {
    if (definition.issuer !== 'PLATFORM' || definition.benefitType === 'FREE_SHIPPING') continue;
    if (
      (definition.benefitType === 'FIXED_AMOUNT' && definition.fixedAmountMinor === null) ||
      (definition.benefitType === 'PERCENTAGE' &&
        (definition.percentageBasisPoints === null || definition.maximumDiscountMinor === null))
    ) {
      continue;
    }
    const request = { code: definition.code, slot: 'PLATFORM' as const, shopId: null };
    if (baseRejection(request, definition, evaluatedAt)) continue;
    const remainingCount = remainingUses(definition);
    if (remainingCount < 1) continue;
    const productScope = new Set(definition.productIds);
    const eligibleLines = lines.filter(
      (line) => productScope.size === 0 || productScope.has(line.productId),
    );
    if (eligibleLines.length === 0) continue;
    const spend = checkedAdd(...eligibleLines.map((line) => line.merchandiseSubtotalMinor));
    if (spend < definition.minimumSpendMinor) continue;
    const estimatedDiscountMinor = benefitFor(definition, spend);
    if (estimatedDiscountMinor <= 0) continue;
    offers.push({
      code: definition.code,
      name: definition.name,
      benefitType: definition.benefitType,
      minimumSpendMinor: definition.minimumSpendMinor,
      estimatedDiscountMinor,
      remainingCount,
    });
  }
  return offers
    .sort((left, right) => {
      if (left.estimatedDiscountMinor !== right.estimatedDiscountMinor) {
        return right.estimatedDiscountMinor - left.estimatedDiscountMinor;
      }
      return left.code.localeCompare(right.code);
    })
    .slice(0, 20);
}

export function listAvailableShippingVouchers(
  quote: PricingQuoteResponse,
  definitions: readonly VoucherDefinitionSnapshot[],
  evaluatedAt: Date,
): AvailableShippingVoucher[] {
  const offers: AvailableShippingVoucher[] = [];
  for (const definition of definitions) {
    if (definition.issuer !== 'PLATFORM' || definition.benefitType !== 'FREE_SHIPPING') continue;
    if (definition.maximumDiscountMinor === null) continue;
    const request = { code: definition.code, slot: 'FREE_SHIPPING' as const, shopId: null };
    if (baseRejection(request, definition, evaluatedAt)) continue;
    const remainingCount = remainingUses(definition);
    if (remainingCount < 1) continue;
    const productScope = new Set(definition.productIds);
    const eligibleShops = quote.shops.filter((shop) =>
      shop.lines.some((line) => productScope.size === 0 || productScope.has(line.productId)),
    );
    if (eligibleShops.length === 0) continue;
    const spend = checkedAdd(
      ...eligibleShops.flatMap((shop) =>
        shop.lines
          .filter((line) => productScope.size === 0 || productScope.has(line.productId))
          .map((line) => line.merchandiseSubtotalMinor),
      ),
    );
    if (spend < definition.minimumSpendMinor) continue;
    const eligibleShipping = checkedAdd(
      ...eligibleShops.map((shop) => shop.shipping.shippingFeeMinor),
    );
    if (eligibleShipping === 0) continue;
    const estimatedDiscountMinor = benefitFor(definition, eligibleShipping);
    if (estimatedDiscountMinor <= 0) continue;
    offers.push({
      code: definition.code,
      name: definition.name,
      benefitType: 'FREE_SHIPPING',
      minimumSpendMinor: definition.minimumSpendMinor,
      estimatedDiscountMinor,
      remainingCount,
    });
  }
  return offers
    .sort((left, right) => {
      if (left.estimatedDiscountMinor !== right.estimatedDiscountMinor) {
        return right.estimatedDiscountMinor - left.estimatedDiscountMinor;
      }
      return left.code.localeCompare(right.code);
    })
    .slice(0, 20);
}

function benefitFor(definition: VoucherDefinitionSnapshot, baseMinor: number): number {
  if (definition.benefitType === 'FIXED_AMOUNT') {
    if (definition.fixedAmountMinor === null) throw new Error('Fixed voucher amount is missing.');
    return Math.min(definition.fixedAmountMinor, baseMinor);
  }
  if (definition.maximumDiscountMinor === null) {
    throw new Error('Voucher maximum discount is missing.');
  }
  if (definition.benefitType === 'PERCENTAGE') {
    if (definition.percentageBasisPoints === null) {
      throw new Error('Percentage voucher rate is missing.');
    }
    return percentageBenefit(
      baseMinor,
      definition.percentageBasisPoints,
      definition.maximumDiscountMinor,
    );
  }
  return Math.min(definition.maximumDiscountMinor, baseMinor);
}

function baseRejection(
  request: RequestedVoucher,
  definition: VoucherDefinitionSnapshot | undefined,
  evaluatedAt: Date,
): VoucherRejectionReason | null {
  if (!definition) return 'NOT_FOUND';
  if (!definition.isEnabled) return 'DISABLED';
  if (evaluatedAt < definition.startsAt) return 'NOT_STARTED';
  if (evaluatedAt >= definition.endsAt) return 'EXPIRED';
  if (definition.usedCount >= definition.usageLimit) return 'GLOBAL_LIMIT_REACHED';
  if (definition.buyerUsedCount >= definition.perBuyerLimit) return 'BUYER_LIMIT_REACHED';
  if (
    (request.slot === 'FREE_SHIPPING' &&
      (definition.issuer !== 'PLATFORM' || definition.benefitType !== 'FREE_SHIPPING')) ||
    (request.slot === 'PLATFORM' &&
      (definition.issuer !== 'PLATFORM' || definition.benefitType === 'FREE_SHIPPING')) ||
    (request.slot === 'SHOP' &&
      (definition.issuer !== 'SHOP' || definition.benefitType === 'FREE_SHIPPING'))
  ) {
    return 'TYPE_MISMATCH';
  }
  if (request.slot === 'SHOP' && definition.shopId !== request.shopId) return 'SCOPE_MISMATCH';
  return null;
}

@Injectable()
export class VoucherPricingCalculator {
  apply(
    baseQuote: PricingQuoteResponse,
    selection: PricingQuoteRequest['vouchers'],
    definitions: readonly VoucherDefinitionSnapshot[],
    evaluatedAt: Date,
  ): VoucherPricingResult {
    if (!Number.isFinite(evaluatedAt.getTime())) throw new Error('Evaluation time is invalid.');
    const definitionByCode = new Map(
      definitions.map((definition) => [definition.code, definition]),
    );
    const mutableLines: MutableLine[] = baseQuote.shops.flatMap((shop) =>
      shop.lines.map((line) => ({
        shopId: shop.shop.id,
        line,
        residualMinor: line.merchandiseSubtotalMinor,
        shopDiscountMinor: 0,
        platformDiscountMinor: 0,
      })),
    );
    const shippingDiscountByShop = new Map<string, number>();
    const voucherResults: VoucherSelectionResult[] = [];
    const applied: AppliedVoucherSnapshot[] = [];

    for (const request of requestedSelections(selection)) {
      const definition = definitionByCode.get(request.code);
      const initialRejection = baseRejection(request, definition, evaluatedAt);
      if (initialRejection || !definition) {
        voucherResults.push(rejected(request, initialRejection ?? 'NOT_FOUND', definition));
        continue;
      }

      const productScope = new Set(definition.productIds);
      const eligibleLines = mutableLines.filter(
        ({ shopId, line }) =>
          (request.slot !== 'SHOP' || shopId === request.shopId) &&
          (productScope.size === 0 || productScope.has(line.productId)),
      );
      if (eligibleLines.length === 0) {
        voucherResults.push(rejected(request, 'NO_ELIGIBLE_ITEMS', definition));
        continue;
      }
      const preVoucherSpend = checkedAdd(
        ...eligibleLines.map(({ line }) => line.merchandiseSubtotalMinor),
      );
      if (preVoucherSpend < definition.minimumSpendMinor) {
        voucherResults.push(rejected(request, 'MINIMUM_SPEND_NOT_MET', definition));
        continue;
      }

      let allocations: VoucherDiscountAllocation[];
      let merchandiseDiscountMinor = 0;
      let shippingDiscountMinor = 0;
      if (request.slot === 'FREE_SHIPPING') {
        const eligibleShopIds = new Set(eligibleLines.map(({ shopId }) => shopId));
        const targets = baseQuote.shops
          .filter(({ shop }) => eligibleShopIds.has(shop.id))
          .map(({ shop, shipping }) => ({
            key: shop.id,
            shopId: shop.id,
            lineId: null,
            weightMinor: shipping.shippingFeeMinor,
          }));
        const eligibleShipping = checkedAdd(...targets.map(({ weightMinor }) => weightMinor));
        if (eligibleShipping === 0) {
          voucherResults.push(rejected(request, 'NO_ELIGIBLE_ITEMS', definition));
          continue;
        }
        shippingDiscountMinor = benefitFor(definition, eligibleShipping);
        allocations = allocateLargestRemainder(shippingDiscountMinor, targets);
        for (const allocation of allocations) {
          shippingDiscountByShop.set(
            allocation.shopId,
            checkedAdd(shippingDiscountByShop.get(allocation.shopId) ?? 0, allocation.amountMinor),
          );
        }
      } else {
        const residual = checkedAdd(...eligibleLines.map(({ residualMinor }) => residualMinor));
        if (residual === 0) {
          voucherResults.push(rejected(request, 'NO_ELIGIBLE_ITEMS', definition));
          continue;
        }
        merchandiseDiscountMinor = benefitFor(definition, residual);
        allocations = allocateLargestRemainder(
          merchandiseDiscountMinor,
          eligibleLines.map(({ shopId, line, residualMinor }) => ({
            key: `${shopId}:${line.lineId}`,
            shopId,
            lineId: line.lineId,
            weightMinor: residualMinor,
          })),
        );
        const lineById = new Map(eligibleLines.map((line) => [line.line.lineId, line]));
        for (const allocation of allocations) {
          const mutable = lineById.get(allocation.lineId!);
          if (!mutable) throw new Error('Voucher allocation references an unknown line.');
          mutable.residualMinor = checkedSubtract(mutable.residualMinor, allocation.amountMinor);
          if (request.slot === 'SHOP') {
            mutable.shopDiscountMinor = checkedAdd(
              mutable.shopDiscountMinor,
              allocation.amountMinor,
            );
          } else {
            mutable.platformDiscountMinor = checkedAdd(
              mutable.platformDiscountMinor,
              allocation.amountMinor,
            );
          }
        }
      }

      const discountMinor = checkedAdd(merchandiseDiscountMinor, shippingDiscountMinor);
      const result: VoucherSelectionResult = {
        code: request.code,
        slot: request.slot,
        shopId: request.shopId,
        status: 'APPLIED',
        name: definition.name,
        issuer: definition.issuer,
        benefitType: definition.benefitType,
        rejectionReason: null,
        discountMinor,
        merchandiseDiscountMinor,
        shippingDiscountMinor,
        allocations,
      };
      voucherResults.push(result);
      applied.push({
        voucherId: definition.id,
        code: definition.code,
        merchandiseDiscountMinor,
        shippingDiscountMinor,
        discountMinor,
      });
    }

    const mutableByLineId = new Map(mutableLines.map((line) => [line.line.lineId, line]));
    const shops = [...baseQuote.shops]
      .sort((left, right) => left.shop.id.localeCompare(right.shop.id))
      .map((shop) => {
        const lines = [...shop.lines]
          .sort((left, right) => left.lineId.localeCompare(right.lineId))
          .map((line) => {
            const mutable = mutableByLineId.get(line.lineId)!;
            const merchandiseVoucherDiscountMinor = checkedAdd(
              mutable.shopDiscountMinor,
              mutable.platformDiscountMinor,
            );
            return {
              ...line,
              shopVoucherDiscountMinor: mutable.shopDiscountMinor,
              platformVoucherDiscountMinor: mutable.platformDiscountMinor,
              merchandiseVoucherDiscountMinor,
              payableMerchandiseMinor: checkedSubtract(
                line.merchandiseSubtotalMinor,
                merchandiseVoucherDiscountMinor,
              ),
            };
          });
        const shopVoucherDiscountMinor = checkedAdd(
          ...lines.map((line) => line.shopVoucherDiscountMinor),
        );
        const platformVoucherDiscountMinor = checkedAdd(
          ...lines.map((line) => line.platformVoucherDiscountMinor),
        );
        const merchandiseVoucherDiscountMinor = checkedAdd(
          shopVoucherDiscountMinor,
          platformVoucherDiscountMinor,
        );
        const shippingVoucherDiscountMinor = shippingDiscountByShop.get(shop.shop.id) ?? 0;
        const voucherDiscountMinor = checkedAdd(
          merchandiseVoucherDiscountMinor,
          shippingVoucherDiscountMinor,
        );
        const shippingPayableMinor = checkedSubtract(
          shop.shipping.shippingFeeMinor,
          shippingVoucherDiscountMinor,
        );
        return {
          ...shop,
          lines,
          shopVoucherDiscountMinor,
          platformVoucherDiscountMinor,
          merchandiseVoucherDiscountMinor,
          shippingVoucherDiscountMinor,
          voucherDiscountMinor,
          shippingPayableMinor,
          payableTotalMinor: checkedAdd(
            checkedSubtract(shop.merchandiseSubtotalMinor, merchandiseVoucherDiscountMinor),
            shippingPayableMinor,
          ),
        };
      });
    const shopVoucherDiscountMinor = checkedAdd(
      ...shops.map((shop) => shop.shopVoucherDiscountMinor),
    );
    const platformVoucherDiscountMinor = checkedAdd(
      ...shops.map((shop) => shop.platformVoucherDiscountMinor),
    );
    const merchandiseVoucherDiscountMinor = checkedAdd(
      shopVoucherDiscountMinor,
      platformVoucherDiscountMinor,
    );
    const shippingVoucherDiscountMinor = checkedAdd(
      ...shops.map((shop) => shop.shippingVoucherDiscountMinor),
    );
    const voucherDiscountMinor = checkedAdd(
      merchandiseVoucherDiscountMinor,
      shippingVoucherDiscountMinor,
    );
    return {
      quote: {
        ...baseQuote,
        evaluatedAt: evaluatedAt.toISOString(),
        shops,
        vouchers: voucherResults,
        summary: {
          ...baseQuote.summary,
          shopVoucherDiscountMinor,
          platformVoucherDiscountMinor,
          merchandiseVoucherDiscountMinor,
          shippingVoucherDiscountMinor,
          voucherDiscountMinor,
          shippingPayableMinor: checkedAdd(...shops.map((shop) => shop.shippingPayableMinor)),
          payableTotalMinor: checkedAdd(...shops.map((shop) => shop.payableTotalMinor)),
        },
      },
      applied,
    };
  }
}

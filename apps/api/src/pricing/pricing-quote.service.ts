import {
  CART_MAX_QUANTITY,
  type CheckoutAddressSnapshot,
  type PricingQuoteExclusion,
  type PricingQuoteResponse,
  type ShopShippingServiceSelection,
  type VoucherCodeSelection,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { VariantStatus } from '../generated/prisma/enums';
import { isSellableProduct } from '../catalog/sellable-product';
import { isSellableShop } from '../catalog/sellable-shop';
import { PrismaService } from '../prisma/prisma.service';
import { SystemUtcClock } from '../vouchers/utc-clock';
import {
  VoucherPricingCalculator,
  listAvailablePlatformVouchers,
  listAvailableShippingVouchers,
  listAvailableShopVouchers,
  type AppliedVoucherSnapshot,
  type VoucherDefinitionSnapshot,
} from '../vouchers/voucher-pricing.calculator';
import {
  CommercePricingCalculator,
  type AuthoritativePricingLine,
} from './commerce-pricing.calculator';
import { UnsafePricingArithmeticError, checkedMoneyFromBigInt } from './money';
import {
  PricingAddressNotFoundError,
  PricingConflictError,
  PricingUnavailableError,
  PricingValidationError,
} from './pricing.errors';
import { ScheduledDiscountService, type EffectivePriceBreakdown } from './scheduled-discount.service';

interface VoucherHoldCountRow {
  voucherId: string;
  heldCount: bigint | number;
  buyerHeldCount: bigint | number;
}

function safeVoucherHoldCount(value: bigint | number): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('Voucher hold count is outside safe numeric bounds.');
  }
  return count;
}

const quoteCartSelect = {
  id: true,
  version: true,
  lines: {
    where: { isSelected: true },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      quantity: true,
      variant: {
        select: {
          id: true,
          name: true,
          sku: true,
          status: true,
          deletedAt: true,
          priceMinor: true,
          compareAtPriceMinor: true,
          weightGrams: true,
          maxPurchaseQuantity: true,
          inventory: { select: { quantityOnHand: true, quantityReserved: true } },
          product: {
            select: {
              id: true,
              name: true,
              status: true,
              moderationStatus: true,
              deletedAt: true,
              category: { select: { isActive: true, deletedAt: true } },
              images: {
                orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
                take: 1,
                select: { url: true },
              },
              shop: {
                select: {
                  id: true,
                  ownerId: true,
                  slug: true,
                  name: true,
                  location: true,
                  pickupProvince: true,
                  pickupDistrict: true,
                  status: true,
                  onboardingStatus: true,
                  deletedAt: true,
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartSelect;

type QuoteCart = Prisma.CartGetPayload<{ select: typeof quoteCartSelect }>;

function campaignPriceSnapshot(
  discount: EffectivePriceBreakdown | undefined,
): AuthoritativePricingLine['campaignPrice'] {
  if (!discount || !discount.campaignId || discount.effectivePriceMinor >= discount.basePriceMinor) return undefined;
  return {
    sourceKind: discount.sourceKind ?? 'SHOP',
    campaignId: discount.campaignId,
    campaignTypeCode: discount.campaignTypeCode ?? null,
    policyVersion: discount.policyVersion ?? null,
    discountBasisPoints: discount.discountBasisPoints,
    evaluatedAt: discount.evaluatedAt.toISOString(),
  };
}

export interface PricingCheckoutLineFact {
  lineId: string;
  productName: string;
  productImageUrl: string | null;
  variantName: string;
  variantSku: string;
}

export interface PricingCheckoutFacts {
  address: CheckoutAddressSnapshot;
  lines: PricingCheckoutLineFact[];
}

export interface PricingCalculationResult {
  quote: PricingQuoteResponse;
  applied: AppliedVoucherSnapshot[];
  facts: PricingCheckoutFacts;
}

@Injectable()
export class PricingQuoteService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CommercePricingCalculator) private readonly calculator: CommercePricingCalculator,
    @Inject(VoucherPricingCalculator)
    private readonly voucherCalculator: VoucherPricingCalculator,
    @Inject(SystemUtcClock) private readonly clock: SystemUtcClock,
    @Inject(ScheduledDiscountService)
    private readonly scheduledDiscounts?: ScheduledDiscountService,
  ) {}

  async quote(
    userId: string,
    expectedVersion: number,
    shippingAddressId: string | undefined,
    services: readonly ShopShippingServiceSelection[],
    vouchers?: VoucherCodeSelection,
  ): Promise<PricingQuoteResponse> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const evaluatedAt = this.clock.now();
          if (!shippingAddressId) {
            return this.calculateWithoutAddressInTransaction(transaction, {
              userId,
              expectedVersion,
              vouchers,
              evaluatedAt,
            });
          }
          return (
            await this.calculateInTransaction(transaction, {
              userId,
              expectedVersion,
              shippingAddressId,
              services,
              vouchers,
              evaluatedAt,
            })
          ).quote;
        },
        { isolationLevel: 'RepeatableRead' },
      );
    } catch (error) {
      if (
        error instanceof PricingAddressNotFoundError ||
        error instanceof PricingConflictError ||
        error instanceof PricingValidationError
      ) {
        throw error;
      }
      if (error instanceof UnsafePricingArithmeticError) throw new PricingUnavailableError();
      throw new PricingUnavailableError();
    }
  }

  private async calculateWithoutAddressInTransaction(
    transaction: Prisma.TransactionClient,
    input: {
      userId: string;
      expectedVersion: number;
      vouchers?: VoucherCodeSelection;
      evaluatedAt: Date;
    },
  ): Promise<PricingQuoteResponse> {
    if (input.vouchers?.freeShippingCode) throw new PricingValidationError(['vouchers']);
    const cart = await transaction.cart.findUnique({
      where: { userId: input.userId },
      select: quoteCartSelect,
    });
    const version = cart?.version ?? 0;
    if (version !== input.expectedVersion) throw new PricingConflictError();

    const facts = this.currentFacts(cart, input.userId);
    const discounts = this.scheduledDiscounts
      ? await this.scheduledDiscounts.resolveVariants(
          transaction,
          facts.lines.map((line) => ({
            id: line.variantId,
            productId: line.productId,
            priceMinor: line.sellingUnitPriceMinor,
            compareAtPriceMinor: line.compareAtUnitPriceMinor,
          })),
          input.evaluatedAt,
        )
      : new Map();
    const lines = facts.lines.map((line) => {
      const discount = discounts.get(line.variantId);
      if (!discount || discount.effectivePriceMinor === discount.basePriceMinor) return line;
      const listPrice =
        line.compareAtUnitPriceMinor === null ||
        line.compareAtUnitPriceMinor < discount.basePriceMinor
          ? discount.basePriceMinor
          : line.compareAtUnitPriceMinor;
      return {
        ...line,
        sellingUnitPriceMinor: discount.effectivePriceMinor,
        compareAtUnitPriceMinor: listPrice,
        campaignPrice: campaignPriceSnapshot(discount),
      };
    });
    const selectedShopIds = new Set(lines.map((line) => line.shop.id));
    for (const selection of input.vouchers?.shopCodes ?? []) {
      if (!selectedShopIds.has(selection.shopId)) throw new PricingValidationError(['vouchers']);
    }

    const baseQuote = this.calculator.calculate({
      cartVersion: version,
      evaluatedAt: input.evaluatedAt,
      address: null,
      lines,
      exclusions: facts.exclusions,
      services: [],
    });
    const definitions = await this.loadVoucherDefinitions(
      transaction,
      input.userId,
      input.vouchers,
      [...selectedShopIds],
      input.evaluatedAt,
    );
    const selectedVouchers = this.bestVoucherSelection(
      baseQuote,
      definitions,
      input.evaluatedAt,
      input.vouchers,
    );
    const calculated = this.voucherCalculator.apply(
      baseQuote,
      selectedVouchers,
      definitions,
      input.evaluatedAt,
    );
    return {
      ...calculated.quote,
      availableShopVouchers: listAvailableShopVouchers(baseQuote, definitions, input.evaluatedAt),
      availablePlatformVouchers: listAvailablePlatformVouchers(
        baseQuote,
        definitions,
        input.evaluatedAt,
      ),
      availableShippingVouchers: [],
    };
  }

  async calculateInTransaction(
    transaction: Prisma.TransactionClient,
    input: {
      userId: string;
      expectedVersion: number;
      shippingAddressId: string;
      services: readonly ShopShippingServiceSelection[];
      vouchers?: VoucherCodeSelection;
      evaluatedAt: Date;
    },
  ): Promise<PricingCalculationResult> {
    const address = await transaction.shippingAddress.findFirst({
      where: { id: input.shippingAddressId, userId: input.userId, deletedAt: null },
      select: {
        id: true,
        recipientName: true,
        phoneNumber: true,
        province: true,
        district: true,
        ward: true,
        addressLine: true,
        label: true,
      },
    });
    if (!address) throw new PricingAddressNotFoundError();

    const cart = await transaction.cart.findUnique({
      where: { userId: input.userId },
      select: quoteCartSelect,
    });
    const version = cart?.version ?? 0;
    if (version !== input.expectedVersion) throw new PricingConflictError();

    const facts = this.currentFacts(cart, input.userId);
    const discounts = this.scheduledDiscounts
      ? await this.scheduledDiscounts.resolveVariants(
          transaction,
          facts.lines.map((line) => ({
            id: line.variantId,
            productId: line.productId,
            priceMinor: line.sellingUnitPriceMinor,
            compareAtPriceMinor: line.compareAtUnitPriceMinor,
          })),
          input.evaluatedAt,
        )
      : new Map();
    const lines = facts.lines.map((line) => {
      const discount = discounts.get(line.variantId);
      if (!discount || discount.effectivePriceMinor === discount.basePriceMinor) return line;
      const listPrice =
        line.compareAtUnitPriceMinor === null ||
        line.compareAtUnitPriceMinor < discount.basePriceMinor
          ? discount.basePriceMinor
          : line.compareAtUnitPriceMinor;
      return {
        ...line,
        sellingUnitPriceMinor: discount.effectivePriceMinor,
        compareAtUnitPriceMinor: listPrice,
        campaignPrice: campaignPriceSnapshot(discount),
      };
    });
    const { exclusions, snapshots } = facts;
    const selectedShopIds = new Set(lines.map((line) => line.shop.id));
    const seen = new Set<string>();
    for (const selection of input.services) {
      if (seen.has(selection.shopId) || !selectedShopIds.has(selection.shopId)) {
        throw new PricingValidationError(['services']);
      }
      seen.add(selection.shopId);
    }
    for (const selection of input.vouchers?.shopCodes ?? []) {
      if (!selectedShopIds.has(selection.shopId)) throw new PricingValidationError(['vouchers']);
    }

    let baseQuote: PricingQuoteResponse;
    try {
      baseQuote = this.calculator.calculate({
        cartVersion: version,
        evaluatedAt: input.evaluatedAt,
        address: {
          id: address.id,
          province: address.province,
          district: address.district,
        },
        lines,
        exclusions,
        services: input.services,
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (
        process.env.DEMO_CARRIER_ENABLED === 'true' &&
        /UNRESOLVED_(?:PROVINCE|DISTRICT)|MISSING_PICKUP_DISTRICT|DISTANCE_UNSUPPORTED/.test(code)
      ) {
        const fields =
          code === 'MISSING_PICKUP_DISTRICT' ? ['shopPickupAddress'] : ['shippingAddressId'];
        throw new PricingValidationError(fields);
      }
      throw error;
    }
    const definitions = await this.loadVoucherDefinitions(
      transaction,
      input.userId,
      input.vouchers,
      [...selectedShopIds],
      input.evaluatedAt,
    );
    const selectedVouchers = this.bestVoucherSelection(
      baseQuote,
      definitions,
      input.evaluatedAt,
      input.vouchers,
    );
    const calculated = this.voucherCalculator.apply(
      baseQuote,
      selectedVouchers,
      definitions,
      input.evaluatedAt,
    );
    return {
      ...calculated,
      quote: {
        ...calculated.quote,
        availableShopVouchers: listAvailableShopVouchers(baseQuote, definitions, input.evaluatedAt),
        availablePlatformVouchers: listAvailablePlatformVouchers(
          baseQuote,
          definitions,
          input.evaluatedAt,
        ),
        availableShippingVouchers: listAvailableShippingVouchers(
          baseQuote,
          definitions,
          input.evaluatedAt,
        ),
      },
      facts: {
        address: {
          id: address.id,
          recipientName: address.recipientName,
          phoneNumber: address.phoneNumber,
          province: address.province,
          district: address.district,
          ward: address.ward,
          addressLine: address.addressLine,
          label: address.label,
        },
        lines: snapshots,
      },
    };
  }

  private bestVoucherSelection(
    baseQuote: PricingQuoteResponse,
    definitions: readonly VoucherDefinitionSnapshot[],
    evaluatedAt: Date,
    explicit: VoucherCodeSelection | undefined,
  ): VoucherCodeSelection | undefined {
    const maximumCandidates = 4;
    const maximumCombinations = 512;
    const availableShop = listAvailableShopVouchers(baseQuote, definitions, evaluatedAt);
    const explicitShop = new Map(
      (explicit?.shopCodes ?? []).map((selection) => [selection.shopId, selection.code]),
    );
    let partials: Array<NonNullable<VoucherCodeSelection['shopCodes']>> = [[]];
    for (const { shop } of baseQuote.shops) {
      const constrained = explicitShop.get(shop.id);
      const options: Array<string | null> = constrained
        ? [constrained]
        : [
            ...availableShop
              .filter((voucher) => voucher.shopId === shop.id)
              .slice(0, maximumCandidates)
              .map((voucher) => voucher.code),
            null,
          ];
      const next: typeof partials = [];
      for (const partial of partials) {
        for (const code of options) {
          if (next.length >= maximumCombinations) break;
          next.push(code ? [...partial, { shopId: shop.id, code }] : partial);
        }
        if (next.length >= maximumCombinations) break;
      }
      partials = next;
    }

    const platformOptions: Array<string | null> = explicit?.platformCode
      ? [explicit.platformCode]
      : [
          ...listAvailablePlatformVouchers(baseQuote, definitions, evaluatedAt)
            .slice(0, maximumCandidates)
            .map((voucher) => voucher.code),
          null,
        ];
    const shippingOptions: Array<string | null> = explicit?.freeShippingCode
      ? [explicit.freeShippingCode]
      : [
          ...listAvailableShippingVouchers(baseQuote, definitions, evaluatedAt)
            .slice(0, maximumCandidates)
            .map((voucher) => voucher.code),
          null,
        ];
    const selections: VoucherCodeSelection[] = [];
    outer: for (const shopCodes of partials) {
      for (const platformCode of platformOptions) {
        for (const freeShippingCode of shippingOptions) {
          if (selections.length >= maximumCombinations) break outer;
          selections.push({
            ...(shopCodes.length ? { shopCodes } : {}),
            ...(platformCode ? { platformCode } : {}),
            ...(freeShippingCode ? { freeShippingCode } : {}),
          });
        }
      }
    }
    selections.push(explicit ?? {});

    let winner:
      { selection: VoucherCodeSelection; quote: PricingQuoteResponse; tuple: string } | undefined;
    for (const selection of selections) {
      const quote = this.voucherCalculator.apply(
        baseQuote,
        selection,
        definitions,
        evaluatedAt,
      ).quote;
      const tuple = [
        ...(selection.shopCodes ?? [])
          .slice()
          .sort((left, right) => left.shopId.localeCompare(right.shopId))
          .map(({ shopId, code }) => `${shopId}:${code}`),
        selection.platformCode ?? '',
        selection.freeShippingCode ?? '',
      ].join('|');
      if (
        !winner ||
        quote.summary.payableTotalMinor < winner.quote.summary.payableTotalMinor ||
        (quote.summary.payableTotalMinor === winner.quote.summary.payableTotalMinor &&
          (quote.summary.voucherDiscountMinor > winner.quote.summary.voucherDiscountMinor ||
            (quote.summary.voucherDiscountMinor === winner.quote.summary.voucherDiscountMinor &&
              tuple.localeCompare(winner.tuple) < 0)))
      ) {
        winner = { selection, quote, tuple };
      }
    }
    return winner?.selection;
  }

  private async loadVoucherDefinitions(
    transaction: Prisma.TransactionClient,
    userId: string,
    selection: VoucherCodeSelection | undefined,
    shopIds: string[],
    evaluatedAt: Date,
  ): Promise<VoucherDefinitionSnapshot[]> {
    const codes = [
      selection?.platformCode,
      ...(selection?.shopCodes ?? []).map(({ code }) => code),
      selection?.freeShippingCode,
    ].filter((code): code is string => Boolean(code));
    const filters: Prisma.VoucherWhereInput[] = [];
    if (codes.length) filters.push({ code: { in: codes } });
    if (shopIds.length) {
      filters.push({
        issuer: 'SHOP',
        shopId: { in: shopIds },
        isEnabled: true,
        archivedAt: null,
        startsAt: { lte: evaluatedAt },
        endsAt: { gt: evaluatedAt },
      });
    }
    filters.push({
      issuer: 'PLATFORM',
      isEnabled: true,
      archivedAt: null,
      startsAt: { lte: evaluatedAt },
      endsAt: { gt: evaluatedAt },
    });
    if (filters.length === 0) return [];
    const definitions = await transaction.voucher.findMany({
      where: { OR: filters },
      include: {
        productScopes: { select: { productId: true } },
        userUsages: { where: { userId }, select: { usedCount: true } },
      },
    });

    // A quote can be generated while another pending online payment is still
    // holding a voucher. Include those holds in the snapshot so automatic
    // selection never chooses a voucher that the checkout transaction cannot
    // acquire moments later. Unit-test transaction doubles may not expose
    // $queryRaw, so they retain the legacy zero-hold behavior.
    const holdRows: VoucherHoldCountRow[] =
      definitions.length > 0 && typeof transaction.$queryRaw === 'function'
        ? await transaction.$queryRaw<VoucherHoldCountRow[]>(Prisma.sql`
            SELECT
              held_voucher."voucher_id" AS "voucherId",
              COUNT(*)::bigint AS "heldCount",
              COUNT(*) FILTER (
                WHERE held_purchase."buyer_id" = ${userId}::uuid
              )::bigint AS "buyerHeldCount"
            FROM "purchase_vouchers" held_voucher
            INNER JOIN "purchases" held_purchase
              ON held_purchase."id" = held_voucher."purchase_id"
            INNER JOIN "payment_attempts" attempt
              ON attempt."purchase_id" = held_purchase."id"
            WHERE held_voucher."voucher_id" IN (${Prisma.join(
              definitions.map(({ id }) => Prisma.sql`${id}::uuid`),
            )})
              AND attempt."status" IN (
                'pending'::"purchase_payment_status",
                'unknown'::"purchase_payment_status",
                'pending_reconciliation'::"purchase_payment_status"
              )
              AND attempt."expires_at" > ${evaluatedAt}
            GROUP BY held_voucher."voucher_id"
          `)
        : [];
    const holdsByVoucherId = new Map(
      holdRows.map((row) => [
        row.voucherId,
        {
          heldCount: safeVoucherHoldCount(row.heldCount),
          buyerHeldCount: safeVoucherHoldCount(row.buyerHeldCount),
        },
      ]),
    );
    const mapped = definitions.map((definition) => ({
      id: definition.id,
      code: definition.code,
      name: definition.name,
      issuer: definition.issuer,
      shopId: definition.shopId,
      benefitType: definition.benefitType,
      fixedAmountMinor:
        definition.fixedAmountMinor === null
          ? null
          : checkedMoneyFromBigInt(definition.fixedAmountMinor),
      percentageBasisPoints: definition.percentageBasisPoints,
      maximumDiscountMinor:
        definition.maximumDiscountMinor === null
          ? null
          : checkedMoneyFromBigInt(definition.maximumDiscountMinor),
      minimumSpendMinor: checkedMoneyFromBigInt(definition.minimumSpendMinor),
      startsAt: definition.startsAt,
      endsAt: definition.endsAt,
      isEnabled: definition.isEnabled,
      usageLimit: definition.usageLimit,
      usedCount: definition.usedCount,
      heldCount: holdsByVoucherId.get(definition.id)?.heldCount ?? 0,
      perBuyerLimit: definition.perBuyerLimit,
      buyerUsedCount: definition.userUsages[0]?.usedCount ?? 0,
      buyerHeldCount: holdsByVoucherId.get(definition.id)?.buyerHeldCount ?? 0,
      productIds: definition.productScopes.map(({ productId }) => productId),
    }));
    return [...new Map(mapped.map((definition) => [definition.id, definition])).values()];
  }

  private currentFacts(
    cart: QuoteCart | null,
    userId: string,
  ): {
    lines: AuthoritativePricingLine[];
    exclusions: PricingQuoteExclusion[];
    snapshots: PricingCheckoutLineFact[];
  } {
    const lines: AuthoritativePricingLine[] = [];
    const exclusions: PricingQuoteExclusion[] = [];
    const snapshots: PricingCheckoutLineFact[] = [];
    for (const row of cart?.lines ?? []) {
      const { variant } = row;
      const { product } = variant;
      const { shop } = product;
      if (shop.ownerId === userId) {
        exclusions.push({
          lineId: row.id,
          code: 'unavailable',
          message: 'Bạn không thể mua sản phẩm từ cửa hàng của chính mình.',
        });
        continue;
      }
      const availableQuantity = Math.max(
        0,
        (variant.inventory?.quantityOnHand ?? 0) - (variant.inventory?.quantityReserved ?? 0),
      );
      const contentAvailable =
        variant.status === VariantStatus.ACTIVE &&
        variant.deletedAt === null &&
        isSellableProduct(product) &&
        product.category.isActive &&
        product.category.deletedAt === null &&
        isSellableShop(shop);
      const maxPurchaseQuantity = Math.min(
        CART_MAX_QUANTITY,
        availableQuantity,
        variant.maxPurchaseQuantity ?? CART_MAX_QUANTITY,
      );
      if (!contentAvailable || availableQuantity < 1) {
        exclusions.push({
          lineId: row.id,
          code: 'unavailable',
          message: 'Sản phẩm hiện không còn khả dụng.',
        });
        continue;
      }
      if (row.quantity > maxPurchaseQuantity) {
        exclusions.push({
          lineId: row.id,
          code: 'insufficient-stock',
          message: 'Số lượng tồn kho hiện không đủ cho sản phẩm đã chọn.',
        });
        continue;
      }
      lines.push({
        lineId: row.id,
        productId: product.id,
        variantId: variant.id,
        quantity: row.quantity,
        unitWeightGrams: variant.weightGrams,
        sellingUnitPriceMinor: variant.priceMinor,
        compareAtUnitPriceMinor: variant.compareAtPriceMinor,
        shop: {
          id: shop.id,
          ownerUserId: shop.ownerId,
          slug: shop.slug,
          name: shop.name,
          location: shop.location,
          pickupProvince: shop.pickupProvince,
          pickupDistrict: shop.pickupDistrict,
        },
      });
      snapshots.push({
        lineId: row.id,
        productName: product.name,
        productImageUrl: product.images[0]?.url ?? null,
        variantName: variant.name,
        variantSku: variant.sku,
      });
    }
    return { lines, exclusions, snapshots };
  }
}

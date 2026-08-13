import {
  CART_MAX_QUANTITY,
  type PricingQuoteExclusion,
  type PricingQuoteResponse,
  type ShopShippingServiceSelection,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { ProductStatus, ShopStatus, VariantStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  CommercePricingCalculator,
  type AuthoritativePricingLine,
} from './commerce-pricing.calculator';
import { UnsafePricingArithmeticError } from './money';
import {
  PricingAddressNotFoundError,
  PricingConflictError,
  PricingUnavailableError,
  PricingValidationError,
} from './pricing.errors';

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
              status: true,
              deletedAt: true,
              category: { select: { isActive: true, deletedAt: true } },
              shop: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  location: true,
                  status: true,
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

@Injectable()
export class PricingQuoteService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CommercePricingCalculator) private readonly calculator: CommercePricingCalculator,
  ) {}

  async quote(
    userId: string,
    expectedVersion: number,
    shippingAddressId: string,
    services: readonly ShopShippingServiceSelection[],
  ): Promise<PricingQuoteResponse> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const address = await transaction.shippingAddress.findFirst({
            where: { id: shippingAddressId, userId, deletedAt: null },
            select: { id: true, province: true, district: true },
          });
          if (!address) throw new PricingAddressNotFoundError();

          const cart = await transaction.cart.findUnique({
            where: { userId },
            select: quoteCartSelect,
          });
          const version = cart?.version ?? 0;
          if (version !== expectedVersion) throw new PricingConflictError();

          const { lines, exclusions } = this.currentFacts(cart);
          const selectedShopIds = new Set(lines.map((line) => line.shop.id));
          const seen = new Set<string>();
          for (const selection of services) {
            if (seen.has(selection.shopId) || !selectedShopIds.has(selection.shopId)) {
              throw new PricingValidationError(['services']);
            }
            seen.add(selection.shopId);
          }

          return this.calculator.calculate({
            cartVersion: version,
            address,
            lines,
            exclusions,
            services,
          });
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

  private currentFacts(cart: QuoteCart | null): {
    lines: AuthoritativePricingLine[];
    exclusions: PricingQuoteExclusion[];
  } {
    const lines: AuthoritativePricingLine[] = [];
    const exclusions: PricingQuoteExclusion[] = [];
    for (const row of cart?.lines ?? []) {
      const { variant } = row;
      const { product } = variant;
      const { shop } = product;
      const availableQuantity = Math.max(
        0,
        (variant.inventory?.quantityOnHand ?? 0) - (variant.inventory?.quantityReserved ?? 0),
      );
      const contentAvailable =
        variant.status === VariantStatus.ACTIVE &&
        variant.deletedAt === null &&
        product.status === ProductStatus.ACTIVE &&
        product.deletedAt === null &&
        product.category.isActive &&
        product.category.deletedAt === null &&
        shop.status === ShopStatus.ACTIVE &&
        shop.deletedAt === null;
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
        shop: { id: shop.id, slug: shop.slug, name: shop.name, location: shop.location },
      });
    }
    return { lines, exclusions };
  }
}

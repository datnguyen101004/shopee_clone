import { Inject, Injectable } from '@nestjs/common';

import { isSellableProduct } from '../catalog/sellable-product';
import { isSellableShop } from '../catalog/sellable-shop';
import {
  applyScheduledPrice,
  promotionFor,
  representativeOffer,
} from '../catalog/catalog-presentation';
import {
  ScheduledDiscountService,
  type EffectivePriceBreakdown,
} from '../pricing/scheduled-discount.service';
import {
  PRODUCT_SEARCH_INDEX_METADATA,
  normalizeProductSearchText,
  type ProductSearchProjection,
} from './product-search-document';
import type { ProductSearchProjectionRecord } from './product-search-projection.repository';

type CategoryNode = {
  id: string;
  slug: string;
  name: string;
  parent?: CategoryNode | null;
};

function categoryPath(category: ProductSearchProjectionRecord['category']): CategoryNode[] {
  const path: CategoryNode[] = [];
  let current: CategoryNode | null = category as unknown as CategoryNode;
  while (current) {
    path.unshift(current);
    current = current.parent ?? null;
  }
  return path;
}

function validInteger(value: number, minimum = 0): number | null {
  return Number.isSafeInteger(value) && value >= minimum ? value : null;
}

function completionWeight(soldCount: number): number {
  // Completion weights must be positive integers; zero-sale products remain
  // eligible but are ranked below products with sales.
  const bounded = validInteger(soldCount) ?? 0;
  return Math.min(Math.max(bounded, 1), 2_147_483_647);
}

function staticDiscountBasisPoints(priceMinor: number, compareAtPriceMinor: number | null): number {
  if (compareAtPriceMinor === null || compareAtPriceMinor <= priceMinor) return 0;
  const basisPoints = Number(
    (BigInt(compareAtPriceMinor - priceMinor) * 10_000n) / BigInt(compareAtPriceMinor),
  );
  return Number.isSafeInteger(basisPoints) && basisPoints > 0 ? Math.min(basisPoints, 10_000) : 0;
}

export function buildProductSearchProjection(
  product: ProductSearchProjectionRecord,
  evaluatedAt: Date,
  discounts: ReadonlyMap<string, EffectivePriceBreakdown>,
): ProductSearchProjection {
  if (!isSellableProduct(product)) {
    return { kind: 'delete', decision: { product_id: product.id, reason: 'product-not-sellable' } };
  }
  if (!isSellableShop(product.shop)) {
    return { kind: 'delete', decision: { product_id: product.id, reason: 'shop-not-sellable' } };
  }
  if (!product.category.isActive || product.category.deletedAt !== null) {
    return {
      kind: 'delete',
      decision: { product_id: product.id, reason: 'category-not-sellable' },
    };
  }

  const variants = product.variants.map((variant) =>
    applyScheduledPrice(variant, discounts.get(variant.id)),
  );
  const representative = representativeOffer(variants);
  if (!representative) {
    return { kind: 'delete', decision: { product_id: product.id, reason: 'no-available-variant' } };
  }

  const effectivePriceMinor = validInteger(representative.priceMinor, 1);
  if (effectivePriceMinor === null) {
    return {
      kind: 'delete',
      decision: { product_id: product.id, reason: 'invalid-effective-price' },
    };
  }
  const compareAtPriceMinor =
    promotionFor(effectivePriceMinor, representative.offer.compareAtPriceMinor)
      ?.compareAtPriceMinor ?? null;
  const promotionActive = compareAtPriceMinor !== null;
  const scheduledPrice = representative.offer.scheduledPrice;
  const discountBasisPoints =
    scheduledPrice?.discountBasisPoints ??
    staticDiscountBasisPoints(effectivePriceMinor, compareAtPriceMinor);
  const path = categoryPath(product.category);
  const attributes = product.attributes.map(
    (attribute) => `${attribute.definition.code}:${attribute.value}`,
  );

  return {
    kind: 'index',
    document: {
      projection_version: PRODUCT_SEARCH_INDEX_METADATA.projectionVersion,
      analyzer_version: PRODUCT_SEARCH_INDEX_METADATA.analyzerVersion,
      product_id: product.id,
      slug: product.slug,
      name: product.name,
      name_normalized: normalizeProductSearchText(product.name),
      name_suggest: { input: product.name, weight: completionWeight(product.soldCount) },
      description: product.description,
      category_id: product.categoryId,
      category_slug: product.category.slug,
      category_name: product.category.name,
      category_name_normalized: normalizeProductSearchText(product.category.name),
      category_path_ids: path.map((entry) => entry.id),
      category_path_slugs: path.map((entry) => entry.slug),
      category_path_names: path.map((entry) => entry.name),
      shop_id: product.shop.id,
      shop_slug: product.shop.slug,
      shop_name: product.shop.name,
      shop_name_normalized: normalizeProductSearchText(product.shop.name),
      shop_location: product.shop.location,
      shop_location_exact: product.shop.location,
      shop_location_normalized: normalizeProductSearchText(product.shop.location),
      attribute_codes: product.attributes.map((attribute) => attribute.definition.code),
      attributes,
      primary_image_url: product.images[0]?.url ?? null,
      primary_image_alt: product.images[0]?.altText ?? null,
      effective_price_minor: effectivePriceMinor,
      compare_at_price_minor: compareAtPriceMinor,
      discount_basis_points: discountBasisPoints,
      promotion_active: promotionActive,
      rating_average_basis_points: validInteger(product.ratingAverageBasisPoints) ?? 0,
      rating_count: validInteger(product.ratingCount) ?? 0,
      sold_count: validInteger(product.soldCount) ?? 0,
      inventory_available: representative.availableQuantity,
      variant_count: variants.length,
      displayable: true,
      product_created_at: product.createdAt.toISOString(),
      product_updated_at: product.updatedAt.toISOString(),
      indexed_at: evaluatedAt.toISOString(),
      buyer_profile_feature_schema_version:
        PRODUCT_SEARCH_INDEX_METADATA.buyerProfileFeatureSchemaVersion,
    },
  };
}

@Injectable()
export class ProductSearchProjectionBuilder {
  constructor(
    @Inject(ScheduledDiscountService)
    private readonly scheduledDiscounts: ScheduledDiscountService,
  ) {}

  async buildMany(
    products: readonly ProductSearchProjectionRecord[],
    evaluatedAt = new Date(),
  ): Promise<ProductSearchProjection[]> {
    if (products.length === 0) return [];
    const variants = products.flatMap((product) =>
      product.variants.map((variant) => ({
        id: variant.id,
        productId: product.id,
        priceMinor: variant.priceMinor,
        compareAtPriceMinor: variant.compareAtPriceMinor,
      })),
    );
    const discounts = await this.scheduledDiscounts.resolveVariants(
      undefined,
      variants,
      evaluatedAt,
    );
    return products.map((product) => buildProductSearchProjection(product, evaluatedAt, discounts));
  }
}

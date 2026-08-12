import { Inject, Injectable } from '@nestjs/common';
import type { CatalogProductCard, CatalogProductsResponse } from '@shopee-clone/contracts';

import { CatalogRepository } from './catalog.repository';
import type { NormalizedCatalogQuery } from './catalog-query';

function safeMinor(value: bigint): number | null {
  const converted = Number(value);
  return Number.isSafeInteger(converted) && converted >= 0 ? converted : null;
}

@Injectable()
export class CatalogService {
  constructor(@Inject(CatalogRepository) private readonly repository: CatalogRepository) {}

  async getProducts(query: NormalizedCatalogQuery): Promise<CatalogProductsResponse> {
    let categoryIds: string[] | undefined;
    if (query.category) {
      const categories = await this.repository.findActiveCategories();
      const selected = categories.find((category) => category.slug === query.category);
      if (!selected) return this.empty(query);

      const descendants = new Set([selected.id]);
      let added = true;
      while (added) {
        added = false;
        for (const category of categories) {
          if (
            category.parentId &&
            descendants.has(category.parentId) &&
            !descendants.has(category.id)
          ) {
            descendants.add(category.id);
            added = true;
          }
        }
      }
      categoryIds = [...descendants];
    }

    const candidates = await this.repository.findCandidates(categoryIds);
    const displayable: CatalogProductCard[] = [];
    for (const product of candidates) {
      const variant = product.variants.find(
        (item) =>
          item.inventory !== null &&
          item.inventory.quantityOnHand - item.inventory.quantityReserved > 0,
      );
      if (!variant) continue;
      const priceMinor = safeMinor(variant.priceMinor);
      if (priceMinor === null) continue;
      const compareAt =
        variant.compareAtPriceMinor === null ? null : safeMinor(variant.compareAtPriceMinor);
      const discountPercent =
        compareAt !== null && compareAt > priceMinor
          ? Math.max(1, Number((BigInt(compareAt - priceMinor) * 100n) / BigInt(compareAt)))
          : null;
      const image = product.images[0];
      displayable.push({
        id: product.id,
        name: product.name,
        href: `/products/${encodeURIComponent(product.id)}`,
        imageUrl: image?.url ?? null,
        imageAlt: image?.altText ?? product.name,
        priceMinor,
        ...(compareAt !== null && discountPercent !== null
          ? {
              compareAtPriceMinor: compareAt,
              discountPercent,
            }
          : {}),
        ratingAverageBasisPoints: product.ratingAverageBasisPoints,
        ratingCount: product.ratingCount,
        soldCount: product.soldCount,
        shop: { name: product.shop.name, location: product.shop.location },
        category: { slug: product.category.slug, name: product.category.name },
      });
    }

    const totalItems = displayable.length;
    const totalPages = Math.ceil(totalItems / query.pageSize);
    const start = (query.page - 1) * query.pageSize;
    return {
      query: { category: query.category },
      pagination: { page: query.page, pageSize: query.pageSize, totalItems, totalPages },
      items: displayable.slice(start, start + query.pageSize),
    };
  }

  private empty(query: NormalizedCatalogQuery): CatalogProductsResponse {
    return {
      query: { category: query.category },
      pagination: { page: query.page, pageSize: query.pageSize, totalItems: 0, totalPages: 0 },
      items: [],
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type {
  CatalogCategoryFacet,
  CatalogFacets,
  CatalogProductCard,
  CatalogProductsResponse,
} from '@shopee-clone/contracts';

import { relevanceScore, normalizeDiscoveryText } from './catalog-discovery';
import type { NormalizedCatalogQuery } from './catalog-query';
import { CatalogRepository } from './catalog.repository';

type CatalogCandidate = Awaited<ReturnType<CatalogRepository['findCandidates']>>[number];
type ActiveCategory = Awaited<ReturnType<CatalogRepository['findActiveCategories']>>[number];

interface DisplayableCatalogCandidate {
  card: CatalogProductCard;
  categoryId: string;
  createdAt: Date;
  description: string;
  relevance: number;
}

function safeMinor(value: bigint): number | null {
  const converted = Number(value);
  return Number.isSafeInteger(converted) && converted >= 0 ? converted : null;
}

function mapDisplayableCandidate(product: CatalogCandidate): DisplayableCatalogCandidate | null {
  const variant = product.variants.find(
    (item) =>
      item.inventory !== null &&
      item.inventory.quantityOnHand - item.inventory.quantityReserved > 0,
  );
  if (!variant) return null;

  const priceMinor = safeMinor(variant.priceMinor);
  if (priceMinor === null) return null;
  const compareAt =
    variant.compareAtPriceMinor === null ? null : safeMinor(variant.compareAtPriceMinor);
  const discountPercent =
    compareAt !== null && compareAt > priceMinor
      ? Math.max(1, Number((BigInt(compareAt - priceMinor) * 100n) / BigInt(compareAt)))
      : null;
  const image = product.images[0];

  return {
    categoryId: product.categoryId,
    createdAt: product.createdAt,
    description: product.description,
    relevance: 0,
    card: {
      id: product.id,
      name: product.name,
      href: `/products/${encodeURIComponent(product.id)}`,
      imageUrl: image?.url ?? null,
      imageAlt: image?.altText ?? product.name,
      priceMinor,
      ...(compareAt !== null && discountPercent !== null
        ? { compareAtPriceMinor: compareAt, discountPercent }
        : {}),
      ratingAverageBasisPoints: product.ratingAverageBasisPoints,
      ratingCount: product.ratingCount,
      soldCount: product.soldCount,
      shop: { name: product.shop.name, location: product.shop.location },
      category: { slug: product.category.slug, name: product.category.name },
    },
  };
}

function descendantIds(categories: ActiveCategory[], slug: string | null): Set<string> | null {
  if (!slug) return null;
  const selected = categories.find((category) => category.slug === slug);
  if (!selected) return new Set();

  const result = new Set([selected.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentId && result.has(category.parentId) && !result.has(category.id)) {
        result.add(category.id);
        changed = true;
      }
    }
  }
  return result;
}

function buildFacets(
  candidates: DisplayableCatalogCandidate[],
  categories: ActiveCategory[],
): CatalogFacets {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const includedCategoryIds = new Set<string>();
  for (const candidate of candidates) {
    let category = categoryById.get(candidate.categoryId);
    while (category && !includedCategoryIds.has(category.id)) {
      includedCategoryIds.add(category.id);
      category = category.parentId ? categoryById.get(category.parentId) : undefined;
    }
  }

  const categoryFacets: CatalogCategoryFacet[] = categories
    .filter((category) => includedCategoryIds.has(category.id))
    .map((category) => ({
      slug: category.slug,
      name: category.name,
      parentSlug: category.parentId ? (categoryById.get(category.parentId)?.slug ?? null) : null,
    }));
  const locations = [...new Set(candidates.map((candidate) => candidate.card.shop.location))].sort(
    (left, right) => left.localeCompare(right, 'vi'),
  );
  const prices = candidates.map((candidate) => candidate.card.priceMinor);

  return {
    categories: categoryFacets,
    locations,
    priceRange: {
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
    },
  };
}

function compareCandidates(
  left: DisplayableCatalogCandidate,
  right: DisplayableCatalogCandidate,
  query: NormalizedCatalogQuery,
): number {
  let primary = 0;
  if (query.sort === 'relevance' && query.q) primary = right.relevance - left.relevance;
  else if (query.sort === 'best-selling') primary = right.card.soldCount - left.card.soldCount;
  else if (query.sort === 'price-asc') primary = left.card.priceMinor - right.card.priceMinor;
  else if (query.sort === 'price-desc') primary = right.card.priceMinor - left.card.priceMinor;
  else primary = right.createdAt.getTime() - left.createdAt.getTime();
  if (primary !== 0) return primary;

  const newest = right.createdAt.getTime() - left.createdAt.getTime();
  return newest !== 0 ? newest : left.card.id.localeCompare(right.card.id);
}

@Injectable()
export class CatalogService {
  constructor(@Inject(CatalogRepository) private readonly repository: CatalogRepository) {}

  async getProducts(query: NormalizedCatalogQuery): Promise<CatalogProductsResponse> {
    const [categories, rawCandidates] = await Promise.all([
      this.repository.findActiveCategories(),
      this.repository.findCandidates(),
    ]);
    const displayable = rawCandidates
      .map(mapDisplayableCandidate)
      .filter((candidate): candidate is DisplayableCatalogCandidate => candidate !== null);
    const facets = buildFacets(displayable, categories);
    const categoryIds = descendantIds(categories, query.category);
    const canonicalLocation = query.location
      ? (facets.locations.find(
          (location) =>
            normalizeDiscoveryText(location) === normalizeDiscoveryText(query.location!),
        ) ?? query.location)
      : null;
    const requestedLocation = canonicalLocation ? normalizeDiscoveryText(canonicalLocation) : null;

    const filtered = displayable.filter((candidate) => {
      if (query.q) {
        const score = relevanceScore(
          {
            name: candidate.card.name,
            description: candidate.description,
            shopName: candidate.card.shop.name,
            categoryName: candidate.card.category.name,
          },
          query.q,
        );
        if (score === null) return false;
        candidate.relevance = score;
      }
      return (
        (categoryIds === null || categoryIds.has(candidate.categoryId)) &&
        (query.minPrice === null || candidate.card.priceMinor >= query.minPrice) &&
        (query.maxPrice === null || candidate.card.priceMinor <= query.maxPrice) &&
        (query.rating === null || candidate.card.ratingAverageBasisPoints >= query.rating * 100) &&
        (requestedLocation === null ||
          normalizeDiscoveryText(candidate.card.shop.location) === requestedLocation) &&
        (query.promotion === null || candidate.card.compareAtPriceMinor !== undefined)
      );
    });
    filtered.sort((left, right) => compareCandidates(left, right, query));

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / query.pageSize);
    const start = (query.page - 1) * query.pageSize;
    return {
      query: {
        q: query.q,
        category: query.category,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        rating: query.rating,
        location: canonicalLocation,
        availability: query.availability,
        promotion: query.promotion,
        sort: query.sort,
      },
      pagination: { page: query.page, pageSize: query.pageSize, totalItems, totalPages },
      facets,
      items: filtered.slice(start, start + query.pageSize).map((candidate) => candidate.card),
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type {
  CatalogCategoryFacet,
  CatalogFacets,
  CatalogProductCard,
  CatalogProductsResponse,
  PublicShopCatalogPage,
  PublicShopCategoryFacet,
  ShopCatalogQuery,
} from '@shopee-clone/contracts';

import { relevanceScore, normalizeDiscoveryText } from './catalog-discovery';
import { CatalogPublicFacade, type PublicShopCatalogSummary } from './catalog-public.facade';
import type { NormalizedCatalogQuery } from './catalog-query';
import { CatalogRepository } from './catalog.repository';
import { mapCatalogProductCard } from './catalog-presentation';

type CatalogCandidate = Awaited<ReturnType<CatalogRepository['findCandidates']>>[number];
type ActiveCategory = Awaited<ReturnType<CatalogRepository['findActiveCategories']>>[number];

interface DisplayableCatalogCandidate {
  card: CatalogProductCard;
  categoryId: string;
  createdAt: Date;
  description: string;
  relevance: number;
}

function mapDisplayableCandidate(product: CatalogCandidate): DisplayableCatalogCandidate | null {
  const card = mapCatalogProductCard(product);
  if (!card) return null;

  return {
    categoryId: product.categoryId,
    createdAt: product.createdAt,
    description: product.description,
    relevance: 0,
    card,
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
  query: Pick<NormalizedCatalogQuery, 'q' | 'sort'>,
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
export class CatalogService extends CatalogPublicFacade {
  constructor(@Inject(CatalogRepository) private readonly repository: CatalogRepository) {
    super();
  }

  private async shopSnapshot(shopId: string): Promise<{
    categories: ActiveCategory[];
    displayable: DisplayableCatalogCandidate[];
  }> {
    const [categories, rawCandidates] = await Promise.all([
      this.repository.findActiveCategories(),
      this.repository.findCandidatesForShop(shopId),
    ]);
    return {
      categories,
      displayable: rawCandidates
        .map(mapDisplayableCandidate)
        .filter((candidate): candidate is DisplayableCatalogCandidate => candidate !== null),
    };
  }

  private shopCategoryFacets(
    candidates: DisplayableCatalogCandidate[],
    categories: ActiveCategory[],
  ): PublicShopCategoryFacet[] {
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const counts = new Map<string, number>();
    for (const candidate of candidates) {
      let category = categoryById.get(candidate.categoryId);
      const counted = new Set<string>();
      while (category && !counted.has(category.id)) {
        counted.add(category.id);
        counts.set(category.id, (counts.get(category.id) ?? 0) + 1);
        category = category.parentId ? categoryById.get(category.parentId) : undefined;
      }
    }
    return categories.flatMap((category) => {
      const productCount = counts.get(category.id) ?? 0;
      return productCount > 0
        ? [
            {
              slug: category.slug,
              name: category.name,
              parentSlug: category.parentId
                ? (categoryById.get(category.parentId)?.slug ?? null)
                : null,
              productCount,
            },
          ]
        : [];
    });
  }

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

  async getShopSummary(shopId: string): Promise<PublicShopCatalogSummary> {
    const { categories, displayable } = await this.shopSnapshot(shopId);
    return {
      products: displayable.map((candidate) => candidate.card),
      categories: this.shopCategoryFacets(displayable, categories),
    };
  }

  async getShopProducts(shopId: string, query: ShopCatalogQuery): Promise<PublicShopCatalogPage> {
    const { categories, displayable } = await this.shopSnapshot(shopId);
    const facets = this.shopCategoryFacets(displayable, categories);
    const categoryIds = descendantIds(categories, query.category);
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
      return categoryIds === null || categoryIds.has(candidate.categoryId);
    });
    filtered.sort((left, right) => compareCandidates(left, right, query));
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / query.pageSize);
    const start = (query.page - 1) * query.pageSize;
    return {
      shopId,
      query: { q: query.q, category: query.category, sort: query.sort },
      pagination: { page: query.page, pageSize: query.pageSize, totalItems, totalPages },
      categories: facets,
      items: filtered.slice(start, start + query.pageSize).map((candidate) => candidate.card),
    };
  }
}

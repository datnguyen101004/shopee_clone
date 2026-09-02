import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type {
  CatalogCategoryFacet,
  CatalogFacets,
  CatalogProductCard,
  CatalogProductsResponse,
  CatalogSearchSuggestionsResponse,
  PublicShopCatalogPage,
  PublicShopCategoryFacet,
  ShopCatalogQuery,
} from '@shopee-clone/contracts';
import { buyerDisplayProductPriceMinor } from '@shopee-clone/contracts';

import {
  relevanceScore,
  normalizeDiscoveryText,
  rankSearchSuggestions,
} from './catalog-discovery';
import { CatalogPublicFacade, type PublicShopCatalogSummary } from './catalog-public.facade';
import type { NormalizedCatalogQuery } from './catalog-query';
import { CatalogRepository } from './catalog.repository';
import {
  applyScheduledPrice,
  mapCatalogProductCard,
  representativeOffer,
} from './catalog-presentation';
import { ScheduledDiscountService } from '../pricing/scheduled-discount.service';
import { BuyerBestPriceService } from '../pricing/buyer-best-price.service';
import {
  ProductSearchQueryService,
  type ProductSearchFacetSnapshot,
  ProductSearchQueryUnavailableError,
} from '../search/product-search-query.service';

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
  const prices = candidates.map((candidate) => buyerDisplayProductPriceMinor(candidate.card));

  return {
    categories: categoryFacets,
    locations,
    priceRange: {
      min: prices.length ? Math.min(...prices) : null,
      max: prices.length ? Math.max(...prices) : null,
    },
  };
}

function buildFacetsFromSearch(
  snapshot: ProductSearchFacetSnapshot,
  categories: ActiveCategory[],
): CatalogFacets {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryFacets: CatalogCategoryFacet[] = categories
    .filter((category) => snapshot.categorySlugs.includes(category.slug))
    .map((category) => ({
      slug: category.slug,
      name: category.name,
      parentSlug: category.parentId ? (categoryById.get(category.parentId)?.slug ?? null) : null,
    }));
  const locations = [...new Set(snapshot.locations)].sort((left, right) =>
    left.localeCompare(right, 'vi'),
  );
  const min = snapshot.priceRange.min;
  const max = snapshot.priceRange.max;
  return {
    categories: categoryFacets,
    locations,
    priceRange: {
      min: min !== null && Number.isSafeInteger(min) ? min : null,
      max: max !== null && Number.isSafeInteger(max) ? max : null,
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
  else if (query.sort === 'price-asc')
    primary = buyerDisplayProductPriceMinor(left.card) - buyerDisplayProductPriceMinor(right.card);
  else if (query.sort === 'price-desc')
    primary = buyerDisplayProductPriceMinor(right.card) - buyerDisplayProductPriceMinor(left.card);
  else primary = right.createdAt.getTime() - left.createdAt.getTime();
  if (primary !== 0) return primary;

  const newest = right.createdAt.getTime() - left.createdAt.getTime();
  return newest !== 0 ? newest : left.card.id.localeCompare(right.card.id);
}

@Injectable()
export class CatalogService extends CatalogPublicFacade {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @Inject(CatalogRepository) private readonly repository: CatalogRepository,
    @Inject(ScheduledDiscountService)
    private readonly scheduledDiscounts?: ScheduledDiscountService,
    @Inject(BuyerBestPriceService)
    private readonly buyerPrices?: BuyerBestPriceService,
    @Optional()
    @Inject(ProductSearchQueryService)
    private readonly productSearch?: ProductSearchQueryService,
  ) {
    super();
  }

  private async applyBuyerPrices(
    products: CatalogCandidate[],
    buyerId: string | null,
    evaluatedAt: Date,
  ): Promise<CatalogCandidate[]> {
    if (!this.buyerPrices || !buyerId || products.length === 0) return products;
    const representatives = products.flatMap((product) => {
      const representative = representativeOffer(product.variants);
      return representative ? [{ product, representative }] : [];
    });
    const previews = await this.buyerPrices.previews(
      buyerId,
      representatives.map(({ product, representative }) => ({
        productId: product.id,
        variantId: representative.offer.id,
        effectivePriceMinor: representative.priceMinor,
        weightGrams: representative.offer.weightGrams ?? 0,
        shop: {
          id: product.shop.id,
          ownerUserId: product.shop.ownerId,
          slug: product.shop.slug,
          name: product.shop.name,
          location: product.shop.location,
          pickupProvince: product.shop.pickupProvince,
        },
      })),
      evaluatedAt,
    );
    return products.map((product) => ({
      ...product,
      variants: product.variants.map((variant) => {
        const buyerBestPrice = previews.get(variant.id);
        return buyerBestPrice ? { ...variant, buyerBestPrice } : variant;
      }),
    }));
  }

  private async applyScheduledDiscounts(
    products: CatalogCandidate[],
    evaluatedAt: Date,
  ): Promise<CatalogCandidate[]> {
    if (!this.scheduledDiscounts || products.length === 0) return products;
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
    return products.map((product) => ({
      ...product,
      variants: product.variants.map((variant) =>
        applyScheduledPrice(variant, discounts.get(variant.id)),
      ),
    }));
  }

  private async shopSnapshot(
    shopId: string,
    buyerId: string | null,
  ): Promise<{
    categories: ActiveCategory[];
    displayable: DisplayableCatalogCandidate[];
  }> {
    const [categories, foundCandidates] = await Promise.all([
      this.repository.findActiveCategories(),
      this.repository.findCandidatesForShop(shopId),
    ]);
    const evaluatedAt = new Date();
    const scheduledCandidates = await this.applyScheduledDiscounts(foundCandidates, evaluatedAt);
    const rawCandidates = await this.applyBuyerPrices(scheduledCandidates, buyerId, evaluatedAt);
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

  private async getProductsFromPostgres(
    query: NormalizedCatalogQuery,
    buyerId: string | null = null,
  ): Promise<CatalogProductsResponse> {
    const [categories, foundCandidates] = await Promise.all([
      this.repository.findActiveCategories(),
      this.repository.findCandidates(),
    ]);
    const evaluatedAt = new Date();
    const scheduledCandidates = await this.applyScheduledDiscounts(foundCandidates, evaluatedAt);
    const rawCandidates = await this.applyBuyerPrices(scheduledCandidates, buyerId, evaluatedAt);
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
        (query.minPrice === null ||
          buyerDisplayProductPriceMinor(candidate.card) >= query.minPrice) &&
        (query.maxPrice === null ||
          buyerDisplayProductPriceMinor(candidate.card) <= query.maxPrice) &&
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

  private async getProductsFromElasticsearch(
    query: NormalizedCatalogQuery,
    buyerId: string | null,
  ): Promise<CatalogProductsResponse> {
    if (!this.productSearch) {
      throw new ProductSearchQueryUnavailableError('not-configured');
    }

    const categories = await this.repository.findActiveCategories();
    const start = (query.page - 1) * query.pageSize;
    const fetchSize = Math.min(Math.max(query.pageSize * 2, query.pageSize), 96);
    const candidateIds: string[] = [];
    const seenIds = new Set<string>();
    let nextFrom = start;
    let totalItems = 0;
    let facetSnapshot: ProductSearchFacetSnapshot = {
      categorySlugs: [],
      locations: [],
      priceRange: { min: null, max: null },
    };
    let attempts = 0;

    while (attempts < 3) {
      const result = await this.productSearch.search(query, nextFrom, fetchSize);
      totalItems = result.totalItems;
      facetSnapshot = result.facets;
      for (const id of result.ids) {
        if (!seenIds.has(id)) {
          seenIds.add(id);
          candidateIds.push(id);
        }
      }
      attempts += 1;
      if (candidateIds.length >= query.pageSize || nextFrom + fetchSize >= totalItems) break;
      nextFrom += fetchSize;
    }

    const hydrated = await this.repository.findCandidatesByIds(candidateIds);
    const evaluatedAt = new Date();
    const scheduledCandidates = await this.applyScheduledDiscounts(hydrated, evaluatedAt);
    const rawCandidates = await this.applyBuyerPrices(scheduledCandidates, buyerId, evaluatedAt);
    const displayable = rawCandidates
      .map(mapDisplayableCandidate)
      .filter((candidate): candidate is DisplayableCatalogCandidate => candidate !== null);
    if (displayable.length === 0 && candidateIds.length > 0 && totalItems > 0) {
      throw new ProductSearchQueryUnavailableError('stale-hits');
    }
    const byId = new Map(displayable.map((candidate) => [candidate.card.id, candidate]));
    const staleHits = candidateIds.filter((id) => !byId.has(id)).length;

    const categoryIds = descendantIds(categories, query.category);
    const facets = buildFacetsFromSearch(facetSnapshot, categories);
    const canonicalLocation = query.location
      ? (facets.locations.find(
          (location) =>
            normalizeDiscoveryText(location) === normalizeDiscoveryText(query.location!),
        ) ?? query.location)
      : null;
    const requestedLocation = canonicalLocation ? normalizeDiscoveryText(canonicalLocation) : null;
    const filtered = candidateIds
      .map((id) => byId.get(id))
      .filter((candidate): candidate is DisplayableCatalogCandidate => candidate !== undefined)
      .filter((candidate) => {
        const price = buyerDisplayProductPriceMinor(candidate.card);
        return (
          (categoryIds === null || categoryIds.has(candidate.categoryId)) &&
          (query.minPrice === null || price >= query.minPrice) &&
          (query.maxPrice === null || price <= query.maxPrice) &&
          (query.rating === null || candidate.card.ratingAverageBasisPoints >= query.rating * 100) &&
          (requestedLocation === null ||
            normalizeDiscoveryText(candidate.card.shop.location) === requestedLocation) &&
          (query.availability === null || query.availability === 'in-stock') &&
          (query.promotion === null || candidate.card.compareAtPriceMinor !== undefined)
        );
      });

    const safeTotalItems = Math.max(0, totalItems - staleHits);
    const totalPages = Math.ceil(safeTotalItems / query.pageSize);
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
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: safeTotalItems,
        totalPages,
      },
      facets,
      items: filtered.slice(0, query.pageSize).map((candidate) => candidate.card),
    };
  }

  async getProducts(
    query: NormalizedCatalogQuery,
    buyerId: string | null = null,
  ): Promise<CatalogProductsResponse> {
    if (this.productSearch?.isEnabled()) {
      try {
        return await this.getProductsFromElasticsearch(query, buyerId);
      } catch (error) {
        const reason =
          error instanceof ProductSearchQueryUnavailableError
            ? error.reason
            : 'connection-failure';
        this.logger.warn(`Catalogue search fallback reason=${reason}`);
      }
    }
    return this.getProductsFromPostgres(query, buyerId);
  }

  async getSearchSuggestions(
    query: string,
    limit: number,
  ): Promise<CatalogSearchSuggestionsResponse> {
    if (this.productSearch?.isEnabled()) {
      try {
        return { suggestions: await this.productSearch.suggest(query, limit) };
      } catch (error) {
        const reason =
          error instanceof ProductSearchQueryUnavailableError
            ? error.reason
            : 'connection-failure';
        this.logger.warn(`Catalogue suggestions fallback reason=${reason}`);
      }
    }

    const candidates = await this.repository.findSearchSuggestionCandidates();
    return {
      suggestions: rankSearchSuggestions(candidates, query, limit).map((text) => ({ text })),
    };
  }

  async getShopSummary(
    shopId: string,
    buyerId: string | null = null,
  ): Promise<PublicShopCatalogSummary> {
    const { categories, displayable } = await this.shopSnapshot(shopId, buyerId);
    return {
      products: displayable.map((candidate) => candidate.card),
      categories: this.shopCategoryFacets(displayable, categories),
    };
  }

  async getShopProducts(
    shopId: string,
    query: ShopCatalogQuery,
    buyerId: string | null = null,
  ): Promise<PublicShopCatalogPage> {
    const { categories, displayable } = await this.shopSnapshot(shopId, buyerId);
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

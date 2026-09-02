import { Inject, Injectable, Logger } from '@nestjs/common';

import type { CatalogSearchSuggestion } from '@shopee-clone/contracts';

import type { NormalizedCatalogQuery } from '../catalog/catalog-query';
import {
  SearchElasticsearchAdapter,
} from './search-elasticsearch.adapter';
import { SEARCH_CONFIG, type SearchConfig } from './search.config';
import { normalizeProductSearchText } from './product-search-document';

export type ProductSearchFallbackReason =
  | 'not-configured'
  | 'disabled'
  | 'timeout'
  | 'connection-failure'
  | 'malformed-response'
  | 'stale-hits';

export interface ProductSearchFacetSnapshot {
  categorySlugs: string[];
  locations: string[];
  priceRange: { min: number | null; max: number | null };
}

export interface ProductSearchQueryResult {
  ids: string[];
  totalItems: number;
  facets: ProductSearchFacetSnapshot;
  indexVersion: string | null;
  tookMs: number;
}

export class ProductSearchQueryUnavailableError extends Error {
  constructor(readonly reason: ProductSearchFallbackReason) {
    super(`Elasticsearch catalogue search is unavailable: ${reason}.`);
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bodyOf(response: unknown): UnknownRecord | null {
  if (!isRecord(response)) return null;
  if (isRecord(response.body)) return response.body;
  return response;
}

function filtersFor(query: NormalizedCatalogQuery): unknown[] {
  const filters: unknown[] = [{ term: { displayable: true } }];
  if (query.category) {
    filters.push({ terms: { category_path_slugs: [query.category] } });
  }
  if (query.minPrice !== null || query.maxPrice !== null) {
    filters.push({
      range: {
        effective_price_minor: {
          ...(query.minPrice !== null ? { gte: query.minPrice } : {}),
          ...(query.maxPrice !== null ? { lte: query.maxPrice } : {}),
        },
      },
    });
  }
  if (query.rating !== null) {
    filters.push({ range: { rating_average_basis_points: { gte: query.rating * 100 } } });
  }
  if (query.location) {
    filters.push({
      term: { shop_location_normalized: normalizeProductSearchText(query.location) },
    });
  }
  if (query.availability === 'in-stock') {
    filters.push({ range: { inventory_available: { gt: 0 } } });
  }
  if (query.promotion === 'discounted') {
    filters.push({ term: { promotion_active: true } });
  }
  return filters;
}

const fuzzySearchFields = [
  'name^120',
  'category_path_names^60',
  'shop_name^45',
  'attributes^30',
  'description^15',
] as const;

function fuzzyLexicalClauses(query: string): unknown[] {
  const fields = fuzzySearchFields.map((field) => field.split('^')[0]!);
  const tokens = normalizeProductSearchText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];
  const tokenAwareCrossField = {
    bool: {
      must: tokens.map((token) => ({
        bool: {
          should: fields.flatMap((field) => [
            {
              match: {
                [field]: {
                  query: token,
                  operator: 'and',
                  fuzziness: 'AUTO',
                  prefix_length: 1,
                  max_expansions: 50,
                },
              },
            },
            { match_bool_prefix: { [field]: { query: token, operator: 'and' } } },
          ]),
          minimum_should_match: 1,
        },
      })),
      boost: 70,
    },
  };

  return [
    tokenAwareCrossField,
    {
      multi_match: {
        query,
        type: 'best_fields',
        fields: fuzzySearchFields,
        operator: 'and',
        fuzziness: 'AUTO',
        prefix_length: 1,
        max_expansions: 50,
        boost: 80,
      },
    },
    ...fuzzySearchFields.map((field, index) => ({
      match_bool_prefix: {
        [field.split('^')[0]!]: {
          query,
          operator: 'and',
          boost: Math.max(12, 40 - index * 6),
        },
      },
    })),
  ];
}

function lexicalQuery(query: NormalizedCatalogQuery): unknown {
  const filters = filtersFor(query);
  if (!query.q) return { bool: { filter: filters } };

  const normalized = normalizeProductSearchText(query.q);
  return {
    function_score: {
      query: {
        bool: {
          filter: filters,
          should: [
            { term: { 'name.normalized': { value: normalized, boost: 1_000 } } },
            { term: { 'name.exact': { value: query.q, boost: 800 } } },
            {
              multi_match: {
                query: query.q,
                type: 'cross_fields',
                fields: fuzzySearchFields,
                operator: 'and',
                boost: 100,
              },
            },
            { match_phrase: { name: { query: query.q, boost: 240 } } },
            { match: { name: { query: query.q, operator: 'and', boost: 120 } } },
            { match: { category_path_names: { query: query.q, operator: 'and', boost: 60 } } },
            { match: { shop_name: { query: query.q, operator: 'and', boost: 45 } } },
            { match: { attributes: { query: query.q, operator: 'and', boost: 30 } } },
            { match: { description: { query: query.q, operator: 'and', boost: 15 } } },
            ...fuzzyLexicalClauses(query.q),
          ],
          minimum_should_match: 1,
        },
      },
      functions: [
        { field_value_factor: { field: 'sold_count', modifier: 'log1p', factor: 0.1, missing: 0 } },
        {
          field_value_factor: {
            field: 'rating_count',
            modifier: 'log1p',
            factor: 0.05,
            missing: 0,
          },
        },
        {
          field_value_factor: {
            field: 'rating_average_basis_points',
            factor: 0.001,
            missing: 0,
          },
        },
        { filter: { term: { promotion_active: true } }, weight: 2 },
        {
          gauss: {
            product_created_at: {
              origin: 'now',
              scale: '30d',
              offset: '1d',
              decay: 0.5,
            },
          },
          weight: 1,
        },
      ],
      score_mode: 'sum',
      boost_mode: 'sum',
    },
  };
}

function sortFor(query: NormalizedCatalogQuery): unknown[] {
  const scoreTieBreakers = [
    { _score: { order: 'desc' } },
    { sold_count: { order: 'desc', missing: '_last' } },
    { rating_average_basis_points: { order: 'desc', missing: '_last' } },
    { product_created_at: { order: 'desc', missing: '_last' } },
    { product_id: { order: 'asc' } },
  ];

  switch (query.sort) {
    case 'price-asc':
      return [{ effective_price_minor: { order: 'asc' } }, ...scoreTieBreakers];
    case 'price-desc':
      return [{ effective_price_minor: { order: 'desc' } }, ...scoreTieBreakers];
    case 'best-selling':
      return [{ sold_count: { order: 'desc' } }, ...scoreTieBreakers.slice(0, 1), { rating_average_basis_points: { order: 'desc' } }, { product_created_at: { order: 'desc' } }, { product_id: { order: 'asc' } }];
    case 'newest':
      return [{ product_created_at: { order: 'desc' } }, ...scoreTieBreakers.slice(0, 1), { sold_count: { order: 'desc' } }, { product_id: { order: 'asc' } }];
    default:
      return scoreTieBreakers;
  }
}

function buckets(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.buckets)) return [];
  return value.buckets.flatMap((bucket) => {
    if (!isRecord(bucket) || typeof bucket.key !== 'string') return [];
    return [bucket.key];
  });
}

function numberValue(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

function parseFacets(root: UnknownRecord): ProductSearchFacetSnapshot {
  const aggregations = isRecord(root.aggregations) ? root.aggregations : {};
  const global = isRecord(aggregations.global_catalogue)
    ? aggregations.global_catalogue
    : aggregations;
  const displayable = isRecord(global.displayable) ? global.displayable : global;
  const stats = isRecord(displayable.price_range) ? displayable.price_range : null;
  return {
    categorySlugs: buckets(displayable.categories),
    locations: buckets(displayable.locations),
    priceRange: {
      min: numberValue(stats?.min),
      max: numberValue(stats?.max),
    },
  };
}

function parseSearchResponse(response: unknown): {
  ids: string[];
  totalItems: number;
  facets: ProductSearchFacetSnapshot;
  indexVersion: string | null;
  timedOut: boolean;
} {
  const root = bodyOf(response);
  const hits = root && isRecord(root.hits) ? root.hits : null;
  if (!hits || !Array.isArray(hits.hits)) throw new ProductSearchQueryUnavailableError('malformed-response');

  const total = hits.total;
  const totalItems =
    typeof total === 'number'
      ? total
      : isRecord(total) && typeof total.value === 'number'
        ? total.value
        : null;
  if (totalItems === null || !Number.isSafeInteger(totalItems) || totalItems < 0) {
    throw new ProductSearchQueryUnavailableError('malformed-response');
  }

  const ids: string[] = [];
  let indexVersion: string | null = null;
  for (const hit of hits.hits) {
    if (!isRecord(hit)) throw new ProductSearchQueryUnavailableError('malformed-response');
    const source = isRecord(hit._source) ? hit._source : null;
    const id = typeof hit._id === 'string' ? hit._id : source && typeof source.product_id === 'string' ? source.product_id : null;
    if (!id) throw new ProductSearchQueryUnavailableError('malformed-response');
    if (typeof hit._index === 'string' && indexVersion === null) indexVersion = hit._index;
    if (!ids.includes(id)) ids.push(id);
  }
  if (!root) throw new ProductSearchQueryUnavailableError('malformed-response');
  return {
    ids,
    totalItems,
    facets: parseFacets(root),
    indexVersion,
    timedOut: root.timed_out === true,
  };
}

function correctedQueryFromSuggestion(root: UnknownRecord, query: string): string | null {
  const suggest = isRecord(root.suggest) ? root.suggest : null;
  const entries = suggest && Array.isArray(suggest.corrected_query) ? suggest.corrected_query : [];
  if (!entries.length) return null;
  const originalTokens = query.split(/\s+/).filter(Boolean);
  const correctedTokens = originalTokens.map((token, index) => {
    const entry = entries[index];
    if (!isRecord(entry) || !Array.isArray(entry.options)) return token;
    const option = entry.options.find(
      (candidate) => isRecord(candidate) && typeof candidate.text === 'string',
    );
    return option && isRecord(option) && typeof option.text === 'string' ? option.text : token;
  });
  const corrected = correctedTokens.join(' ');
  return normalizeProductSearchText(corrected) === normalizeProductSearchText(query)
    ? null
    : corrected;
}

function parseSuggestionResponse(
  response: unknown,
  query: string,
  limit: number,
): CatalogSearchSuggestion[] {
  const root = bodyOf(response);
  const hits = root && isRecord(root.hits) ? root.hits : null;
  if (!hits || !Array.isArray(hits.hits)) {
    throw new ProductSearchQueryUnavailableError('malformed-response');
  }
  const suggestions: CatalogSearchSuggestion[] = [];
  const seen = new Set<string>();
  const corrected = root ? correctedQueryFromSuggestion(root, query) : null;
  if (corrected) {
    seen.add(normalizeProductSearchText(corrected));
    suggestions.push({ text: corrected });
  }
  for (const hit of hits.hits) {
    if (!isRecord(hit)) continue;
    const source = isRecord(hit._source) ? hit._source : null;
    const text = typeof source?.name === 'string' ? source.name.trim() : '';
    if (!text) continue;
    const normalized = normalizeProductSearchText(text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    suggestions.push({ text });
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}

function classifyFailure(error: unknown): ProductSearchFallbackReason {
  if (error instanceof ProductSearchQueryUnavailableError) return error.reason;
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { name?: unknown; statusCode?: unknown; message?: unknown };
    const text = `${String(candidate.name ?? '')} ${String(candidate.message ?? '')}`.toLowerCase();
    if (text.includes('timeout') || text.includes('timed out')) return 'timeout';
    if (candidate.statusCode === 408 || candidate.statusCode === 429) return 'timeout';
  }
  return 'connection-failure';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeout = new Error('Elasticsearch catalogue search timed out.');
      timeout.name = 'TimeoutError';
      reject(timeout);
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

@Injectable()
export class ProductSearchQueryService {
  private readonly logger = new Logger(ProductSearchQueryService.name);

  constructor(
    @Inject(SEARCH_CONFIG) private readonly config: SearchConfig,
    @Inject(SearchElasticsearchAdapter) private readonly adapter: SearchElasticsearchAdapter,
  ) {}

  isEnabled(): boolean {
    return this.config.features.baselineSearch;
  }

  async search(
    query: NormalizedCatalogQuery,
    from: number,
    size: number,
  ): Promise<ProductSearchQueryResult> {
    if (!this.config.features.baselineSearch) {
      throw new ProductSearchQueryUnavailableError('disabled');
    }
    if (!this.config.elasticsearch.url) {
      throw new ProductSearchQueryUnavailableError('not-configured');
    }

    const startedAt = Date.now();
    try {
      const response = await withTimeout(
        this.adapter.search({
          from,
          size,
          track_total_hits: true,
          query: lexicalQuery(query),
          sort: sortFor(query),
          aggs: {
            global_catalogue: {
              global: {},
              aggs: {
                displayable: {
                  filter: { term: { displayable: true } },
                  aggs: {
                    categories: { terms: { field: 'category_path_slugs', size: 1_000 } },
                    locations: { terms: { field: 'shop_location_exact', size: 1_000 } },
                    price_range: { stats: { field: 'effective_price_minor' } },
                  },
                },
              },
            },
          },
          _source: false,
        }),
        this.config.elasticsearch.requestTimeoutMs,
      );
      const parsed = parseSearchResponse(response);
      if (parsed.timedOut) throw new ProductSearchQueryUnavailableError('timeout');
      const tookMs = Date.now() - startedAt;
      const indexVersion = parsed.indexVersion ?? this.config.elasticsearch.productIndexAlias;
      this.logger.debug(
        `Catalogue search outcome=elasticsearch latencyMs=${tookMs} index=${indexVersion}`,
      );
      return { ...parsed, indexVersion, tookMs };
    } catch (error) {
      const reason = classifyFailure(error);
      const tookMs = Date.now() - startedAt;
      this.logger.warn(
        `Catalogue search outcome=fallback reason=${reason} latencyMs=${tookMs} index=${this.config.elasticsearch.productIndexAlias}`,
      );
      throw new ProductSearchQueryUnavailableError(reason);
    }
  }

  async suggest(query: string, limit: number): Promise<CatalogSearchSuggestion[]> {
    if (!this.config.features.baselineSearch) {
      throw new ProductSearchQueryUnavailableError('disabled');
    }
    if (!this.config.elasticsearch.url) {
      throw new ProductSearchQueryUnavailableError('not-configured');
    }

    const startedAt = Date.now();
    try {
      const response = await withTimeout(
        this.adapter.search({
          size: Math.min(Math.max(limit * 4, limit), 32),
          track_total_hits: false,
          query: {
            bool: {
              filter: [{ term: { displayable: true } }],
              should: [
                { match_phrase: { name: { query, boost: 240 } } },
                { match_bool_prefix: { name: { query, operator: 'and', boost: 140 } } },
                ...fuzzyLexicalClauses(query),
              ],
              minimum_should_match: 1,
            },
          },
          sort: [
            { _score: { order: 'desc' } },
            { sold_count: { order: 'desc', missing: '_last' } },
            { product_created_at: { order: 'desc', missing: '_last' } },
            { product_id: { order: 'asc' } },
          ],
          suggest: {
            corrected_query: {
              text: query,
              term: { field: 'name', suggest_mode: 'popular', size: 3, min_word_length: 3 },
            },
          },
          _source: ['name'],
        }),
        this.config.elasticsearch.requestTimeoutMs,
      );
      const suggestions = parseSuggestionResponse(response, query, limit);
      const tookMs = Date.now() - startedAt;
      this.logger.debug(
        `Catalogue suggestions outcome=elasticsearch latencyMs=${tookMs} index=${this.config.elasticsearch.productIndexAlias}`,
      );
      return suggestions;
    } catch (error) {
      const reason = classifyFailure(error);
      const tookMs = Date.now() - startedAt;
      this.logger.warn(
        `Catalogue suggestions outcome=fallback reason=${reason} latencyMs=${tookMs} index=${this.config.elasticsearch.productIndexAlias}`,
      );
      throw new ProductSearchQueryUnavailableError(reason);
    }
  }
}

export {
  filtersFor,
  lexicalQuery,
  sortFor,
  parseSearchResponse,
  parseSuggestionResponse,
  fuzzyLexicalClauses,
};

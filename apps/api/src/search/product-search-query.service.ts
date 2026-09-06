import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import type { CatalogSearchSuggestion } from '@shopee-clone/contracts';

import type { NormalizedCatalogQuery } from '../catalog/catalog-query';
import { CAMPAIGN_RANKING_BOOST_MAX } from '../marketplace-campaigns/campaign-policy';
import { BuyerProfileService } from '../recommendations/buyer-profile.service';
import {
  isCompatibleRankingModel,
  RecommendationModelRepository,
} from '../recommendations/recommendation-model.repository';
import {
  BUYER_PAIR_FEATURE_NAMES,
  type BuyerSearchProfileSnapshot,
} from '../recommendations/recommendation.types';
import { PERSONALIZED_RANKING_SCRIPT_ID } from './personalized-ranking-script';
import { SearchElasticsearchAdapter } from './search-elasticsearch.adapter';
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
  'name',
  'category_path_names',
  'shop_name',
  'attributes',
  'description',
] as const;

const strictSearchFields = ['name', 'category_path_names', 'shop_name', 'attributes'] as const;

type LexicalSearchMode = 'strict' | 'combined';

// Keep the ranking hierarchy explicit: exact phrase > exact term > fuzzy fallback.
const EXACT_PHRASE_BOOST = 10;
const EXACT_TERM_BOOST = 5;
const FUZZY_BOOST = 1;
const MINIMUM_SEARCH_RESULTS = 24;
// Personalization is a tie-breaker only. The stored script returns a bounded
// score around 0..1,001,000, so this weight keeps its contribution below a
// practical lexical-score precision while preserving deterministic ties.
const PERSONALIZATION_TIE_BREAK_WEIGHT = 1e-9;
const PRODUCT_NAME_COMPLETION_SUGGESTER = 'product_name_completion';
const PRODUCT_NAME_TERM_SUGGESTER = 'product_name_term';
const PRODUCT_NAME_PHRASE_SUGGESTER = 'product_name_phrase';

function completionSuggestionRequest(prefix: string, limit: number): Record<string, unknown> {
  return {
    size: 0,
    track_total_hits: false,
    suggest: {
      [PRODUCT_NAME_COMPLETION_SUGGESTER]: {
        prefix,
        completion: {
          field: 'name_suggest',
          size: limit,
          skip_duplicates: true,
        },
      },
    },
    _source: false,
  };
}

function correctionSuggestionRequest(query: string, limit: number): Record<string, unknown> {
  const correctionSize = Math.min(Math.max(limit, 3), 5);
  return {
    size: 0,
    track_total_hits: false,
    suggest: {
      [PRODUCT_NAME_TERM_SUGGESTER]: {
        text: query,
        term: {
          field: 'name',
          suggest_mode: 'popular',
          size: correctionSize,
          min_word_length: 3,
        },
      },
      [PRODUCT_NAME_PHRASE_SUGGESTER]: {
        text: query,
        phrase: {
          field: 'name',
          size: correctionSize,
          gram_size: 2,
          confidence: 0,
          max_errors: 1,
          direct_generator: [
            {
              field: 'name',
              suggest_mode: 'popular',
              min_word_length: 3,
              prefix_length: 1,
              max_edits: 2,
            },
          ],
        },
      },
    },
    _source: false,
  };
}

function fuzzyLexicalClauses(query: string, operator: 'and' | 'or' = 'and'): unknown[] {
  const fields = fuzzySearchFields.map((field) => field.split('^')[0]!);
  const tokens = normalizeProductSearchText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];
  const tokenClauses = tokens.map((token) => ({
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
  }));
  const tokenAwareCrossField = {
    bool: {
      ...(operator === 'and'
        ? { must: tokenClauses }
        : { should: tokenClauses, minimum_should_match: 1 }),
      boost: FUZZY_BOOST,
    },
  };

  return [
    tokenAwareCrossField,
    {
      multi_match: {
        query,
        type: 'best_fields',
        fields: fuzzySearchFields,
        operator,
        fuzziness: 'AUTO',
        prefix_length: 1,
        max_expansions: 50,
        boost: FUZZY_BOOST,
      },
    },
    ...fuzzySearchFields.map((field) => ({
      match_bool_prefix: {
        [field.split('^')[0]!]: {
          query,
          operator,
          boost: FUZZY_BOOST,
        },
      },
    })),
  ];
}

function strictLexicalClauses(query: string): unknown[] {
  const normalized = normalizeProductSearchText(query);
  const tokens = normalized.split(' ').filter(Boolean);
  const includeCategory = !(tokens.length === 1 && tokens[0]!.length <= 2);
  const fields = includeCategory
    ? strictSearchFields
    : strictSearchFields.filter((field) => field !== 'category_path_names');
  return [
    { term: { 'name.normalized': { value: normalized, boost: EXACT_TERM_BOOST } } },
    { term: { 'name.exact': { value: query, boost: EXACT_TERM_BOOST } } },
    {
      constant_score: {
        filter: { term: { shop_name_normalized: normalized } },
        boost: EXACT_TERM_BOOST,
      },
    },
    {
      constant_score: {
        filter: { term: { 'shop_name.exact': query } },
        boost: EXACT_TERM_BOOST,
      },
    },
    {
      multi_match: {
        query,
        type: 'cross_fields',
        fields,
        operator: 'and',
        boost: EXACT_TERM_BOOST,
      },
    },
    { match_phrase: { name: { query, boost: EXACT_PHRASE_BOOST } } },
    { match_phrase: { shop_name: { query, boost: EXACT_PHRASE_BOOST } } },
    { match: { name: { query, operator: 'and', boost: EXACT_TERM_BOOST } } },
    ...(includeCategory
      ? [
          {
            match: {
              category_path_names: { query, operator: 'and', boost: EXACT_TERM_BOOST },
            },
          },
        ]
      : []),
    { match: { shop_name: { query, operator: 'and', boost: EXACT_TERM_BOOST } } },
    { match: { attributes: { query, operator: 'and', boost: EXACT_TERM_BOOST } } },
  ];
}

function lexicalQuery(
  query: NormalizedCatalogQuery,
  mode: LexicalSearchMode = 'combined',
): unknown {
  const filters = filtersFor(query);
  if (!query.q) return { bool: { filter: filters } };

  const strictClauses = strictLexicalClauses(query.q);
  const clauses =
    mode === 'strict'
      ? strictClauses
      : [
          ...strictClauses.slice(0, 4),
          {
            multi_match: {
              query: query.q,
              type: 'cross_fields',
              fields: strictSearchFields,
              operator: 'or',
              minimum_should_match: 1,
              boost: EXACT_TERM_BOOST,
            },
          },
          ...strictClauses.slice(5),
          {
            match: { description: { query: query.q, operator: 'or', boost: FUZZY_BOOST } },
          },
          ...fuzzyLexicalClauses(query.q, 'or'),
        ];
  return {
    function_score: {
      query: {
        bool: {
          filter: filters,
          should: clauses,
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
          filter: {
            bool: {
              must: [
                { term: { campaign_eligible: true } },
                { range: { campaign_active_from: { lte: 'now' } } },
                { range: { campaign_active_until: { gt: 'now' } } },
              ],
            },
          },
          // campaign_rank is server projected as 0, 1 or 2. Scaling by half
          // keeps NORMAL below FEATURED and caps every profile at the same
          // global contribution used by personalized ranking.
          field_value_factor: { field: 'campaign_rank', factor: CAMPAIGN_RANKING_BOOST_MAX / 2, modifier: 'none', missing: 0 },
        },
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
    { rating_count: { order: 'desc', missing: '_last' } },
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
      return [
        { sold_count: { order: 'desc' } },
        ...scoreTieBreakers.slice(0, 1),
        { rating_count: { order: 'desc' } },
        { rating_average_basis_points: { order: 'desc' } },
        { product_created_at: { order: 'desc' } },
        { product_id: { order: 'asc' } },
      ];
    case 'newest':
      return [
        { product_created_at: { order: 'desc' } },
        ...scoreTieBreakers.slice(0, 1),
        { sold_count: { order: 'desc' } },
        { product_id: { order: 'asc' } },
      ];
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
  if (!hits || !Array.isArray(hits.hits))
    throw new ProductSearchQueryUnavailableError('malformed-response');

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
    const id =
      typeof hit._id === 'string'
        ? hit._id
        : source && typeof source.product_id === 'string'
          ? source.product_id
          : null;
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

function correctedQueryFromTokenSuggestion(
  root: UnknownRecord,
  query: string,
  suggesterName: string,
): string | null {
  const suggest = isRecord(root.suggest) ? root.suggest : null;
  const entries = suggest && Array.isArray(suggest[suggesterName]) ? suggest[suggesterName] : [];
  if (!entries.length) return null;
  const originalTokens = query.split(/\s+/).filter(Boolean);
  const correctedTokens = originalTokens.map((token, index) => {
    const entry = entries[index];
    if (!isRecord(entry) || !Array.isArray(entry.options)) return token;
    const option = entry.options.find(
      (candidate) =>
        isRecord(candidate) &&
        typeof candidate.text === 'string' &&
        normalizeProductSearchText(candidate.text) !== normalizeProductSearchText(token),
    );
    return option && isRecord(option) && typeof option.text === 'string' ? option.text : token;
  });
  const corrected = correctedTokens.join(' ');
  return normalizeProductSearchText(corrected) === normalizeProductSearchText(query)
    ? null
    : corrected;
}

function correctedQueryFromPhraseSuggestion(root: UnknownRecord, query: string): string | null {
  const suggest = isRecord(root.suggest) ? root.suggest : null;
  const entries =
    suggest && Array.isArray(suggest[PRODUCT_NAME_PHRASE_SUGGESTER])
      ? suggest[PRODUCT_NAME_PHRASE_SUGGESTER]
      : [];
  const normalizedQuery = normalizeProductSearchText(query);
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.options)) continue;
    const option = entry.options.find(
      (candidate) =>
        isRecord(candidate) &&
        typeof candidate.text === 'string' &&
        normalizeProductSearchText(candidate.text) !== normalizedQuery,
    );
    if (option && isRecord(option) && typeof option.text === 'string') {
      return option.text.trim();
    }
  }
  return null;
}

function correctedQueryFromSuggestion(root: UnknownRecord, query: string): string | null {
  // Term suggestions preserve correctly-spelled tokens (including accents)
  // and only replace the misspelled token. Keep the legacy key for parser
  // compatibility with existing callers/tests.
  for (const suggesterName of ['corrected_query', PRODUCT_NAME_TERM_SUGGESTER]) {
    const corrected = correctedQueryFromTokenSuggestion(root, query, suggesterName);
    if (corrected) return corrected;
  }
  return correctedQueryFromPhraseSuggestion(root, query);
}

function parseCorrectionResponse(response: unknown, query: string): string | null {
  const root = bodyOf(response);
  if (!root || !isRecord(root.suggest)) {
    throw new ProductSearchQueryUnavailableError('malformed-response');
  }
  return correctedQueryFromSuggestion(root, query);
}

function parseSuggestionResponse(
  response: unknown,
  query: string,
  limit: number,
): CatalogSearchSuggestion[] {
  const root = bodyOf(response);
  const hits = root && isRecord(root.hits) ? root.hits : null;
  const suggest = root && isRecord(root.suggest) ? root.suggest : null;
  const completionEntries =
    suggest && Array.isArray(suggest[PRODUCT_NAME_COMPLETION_SUGGESTER])
      ? suggest[PRODUCT_NAME_COMPLETION_SUGGESTER]
      : null;
  if ((!hits || !Array.isArray(hits.hits)) && completionEntries === null) {
    throw new ProductSearchQueryUnavailableError('malformed-response');
  }
  const suggestions: CatalogSearchSuggestion[] = [];
  const seen = new Set<string>();
  const corrected = root ? correctedQueryFromSuggestion(root, query) : null;
  if (corrected) {
    seen.add(normalizeProductSearchText(corrected));
    suggestions.push({ text: corrected });
  }
  if (completionEntries) {
    for (const entry of completionEntries) {
      if (!isRecord(entry) || !Array.isArray(entry.options)) continue;
      for (const option of entry.options) {
        if (!isRecord(option) || typeof option.text !== 'string') continue;
        const text = option.text.trim();
        const normalized = normalizeProductSearchText(text);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        suggestions.push({ text });
        if (suggestions.length >= limit) break;
      }
      if (suggestions.length >= limit) break;
    }
  }
  if (suggestions.length < limit && hits && Array.isArray(hits.hits)) {
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

interface ActiveRankingModel {
  modelVersion: number;
  productProjectionVersion: number;
  featureSchemaVersion: number;
  storedScriptVersion: number;
  intercept: number;
  featureWeights: readonly number[];
}

interface PersonalizedSearchContext {
  model: ActiveRankingModel;
  profile: Record<string, unknown>;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boundedInteger(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return 0;
  return Math.min(value as number, maximum);
}

function boundedAffinityMap(
  values: readonly { id: string; weight: number }[],
  maximum: number,
): Record<string, number> {
  return Object.fromEntries(
    values.slice(0, maximum).flatMap((entry) => {
      if (!entry.id || !Number.isFinite(entry.weight) || entry.weight <= 0) return [];
      return [[entry.id, Math.min(1, entry.weight / 100)]];
    }),
  );
}

function boundedProfile(profile: BuyerSearchProfileSnapshot): Record<string, unknown> {
  return {
    userId: profile.userId,
    featureSchemaVersion: profile.featureSchemaVersion,
    eligibilityScore: boundedInteger(profile.eligibilityScore, 100),
    viewCount30d: boundedInteger(profile.viewCount30d, 500),
    favoriteCount90d: boundedInteger(profile.favoriteCount90d, 500),
    followedShopCount: boundedInteger(profile.followedShopCount, 100),
    orderCount90d: boundedInteger(profile.orderCount90d, 100),
    categoryAffinities: boundedAffinityMap(profile.categoryAffinities, 20),
    shopAffinities: boundedAffinityMap(profile.shopAffinities, 20),
    preferredPriceMinMinor: boundedInteger(profile.preferredPriceMinMinor, Number.MAX_SAFE_INTEGER),
    preferredPriceMaxMinor: boundedInteger(profile.preferredPriceMaxMinor, Number.MAX_SAFE_INTEGER),
    preferredPriceMeanMinor: boundedInteger(
      profile.preferredPriceMeanMinor,
      Number.MAX_SAFE_INTEGER,
    ),
    recentProductIds: profile.recentProductIds.slice(0, 50),
  };
}

function activeRankingModel(value: unknown): ActiveRankingModel | null {
  if (!isRecord(value)) return null;
  if ('activationStatus' in value && value.activationStatus !== 'ACTIVE') return null;
  const versions = {
    productProjectionVersion: value.productProjectionVersion,
    featureSchemaVersion: value.featureSchemaVersion,
    storedScriptVersion: value.storedScriptVersion,
  };
  if (
    !Number.isSafeInteger(versions.productProjectionVersion) ||
    !Number.isSafeInteger(versions.featureSchemaVersion) ||
    !Number.isSafeInteger(versions.storedScriptVersion) ||
    !isCompatibleRankingModel({
      productProjectionVersion: versions.productProjectionVersion as number,
      featureSchemaVersion: versions.featureSchemaVersion as number,
      storedScriptVersion: versions.storedScriptVersion as number,
    })
  ) {
    return null;
  }
  const rawWeights = Array.isArray(value.featureWeights) ? value.featureWeights : [];
  if (rawWeights.length === 0) return null;
  const byName = new Map<string, number>();
  for (const entry of rawWeights) {
    if (!isRecord(entry) || typeof entry.name !== 'string') return null;
    if (
      !BUYER_PAIR_FEATURE_NAMES.includes(entry.name as (typeof BUYER_PAIR_FEATURE_NAMES)[number])
    ) {
      return null;
    }
    if (byName.has(entry.name)) return null;
    const weight = finiteNumber(entry.weight, Number.NaN);
    if (!Number.isFinite(weight) || Math.abs(weight) > 100) return null;
    byName.set(entry.name, weight);
  }
  const intercept = finiteNumber(value.intercept, Number.NaN);
  const modelVersion = value.modelVersion;
  if (
    !Number.isSafeInteger(modelVersion) ||
    !Number.isFinite(intercept) ||
    Math.abs(intercept) > 100
  ) {
    return null;
  }
  return {
    modelVersion: modelVersion as number,
    productProjectionVersion: versions.productProjectionVersion as number,
    featureSchemaVersion: versions.featureSchemaVersion as number,
    storedScriptVersion: versions.storedScriptVersion as number,
    intercept,
    featureWeights: BUYER_PAIR_FEATURE_NAMES.map((name) => byName.get(name) ?? 0),
  };
}

function personalizedLexicalQuery(
  query: NormalizedCatalogQuery,
  context: PersonalizedSearchContext,
  mode: LexicalSearchMode = 'combined',
): unknown {
  return {
    function_score: {
      query: lexicalQuery(query, mode),
      functions: [
        {
          script_score: {
            script: {
              id: PERSONALIZED_RANKING_SCRIPT_ID,
              params: {
                intercept: context.model.intercept,
                weights: context.model.featureWeights,
                profile: context.profile,
                nowMillis: Date.now(),
              },
            },
          },
          weight: PERSONALIZATION_TIE_BREAK_WEIGHT,
        },
      ],
      score_mode: 'sum',
      boost_mode: 'sum',
    },
  };
}

@Injectable()
export class ProductSearchQueryService {
  private readonly logger = new Logger(ProductSearchQueryService.name);

  constructor(
    @Inject(SEARCH_CONFIG) private readonly config: SearchConfig,
    @Inject(SearchElasticsearchAdapter) private readonly adapter: SearchElasticsearchAdapter,
    @Optional()
    @Inject(BuyerProfileService)
    private readonly profiles?: BuyerProfileService,
    @Optional()
    @Inject(RecommendationModelRepository)
    private readonly models?: RecommendationModelRepository,
  ) {}

  isEnabled(): boolean {
    return this.config.features.baselineSearch;
  }

  async search(
    query: NormalizedCatalogQuery,
    from: number,
    size: number,
    buyerId: string | null = null,
  ): Promise<ProductSearchQueryResult> {
    if (!this.config.features.baselineSearch) {
      throw new ProductSearchQueryUnavailableError('disabled');
    }
    if (!this.config.elasticsearch.url) {
      throw new ProductSearchQueryUnavailableError('not-configured');
    }

    let context: PersonalizedSearchContext | null = null;
    let personalizationTimedOut = false;
    if (this.config.features.personalization && query.sort === 'relevance' && buyerId) {
      try {
        context = await this.resolvePersonalizedContext(buyerId);
      } catch {
        // A profile/model timeout already consumed the latency budget. Keep
        // the baseline fallback to one strict request instead of issuing the
        // optional combined lexical pass as well.
        personalizationTimedOut = true;
        this.logger.warn(
          `Catalogue search personalization fallback reason=profile-timeout index=${this.config.elasticsearch.productIndexAlias}`,
        );
      }
    }

    if (context) {
      try {
        return await this.executeSearchWithLexicalFallback(query, from, size, context);
      } catch (error) {
        this.logger.warn(
          `Catalogue search personalization fallback reason=script-failure model=${context.model.modelVersion} index=${this.config.elasticsearch.productIndexAlias}`,
        );
        // Re-issue the same filtered candidate query without script scoring.
        void error;
      }
    }
    return personalizationTimedOut
      ? this.executeSearch(query, from, Math.max(size, MINIMUM_SEARCH_RESULTS), undefined, 'strict')
      : this.executeSearchWithLexicalFallback(query, from, size);
  }

  private async executeSearchWithLexicalFallback(
    query: NormalizedCatalogQuery,
    from: number,
    size: number,
    context?: PersonalizedSearchContext,
  ): Promise<ProductSearchQueryResult> {
    const effectiveSize = Math.max(size, MINIMUM_SEARCH_RESULTS);
    const strictResult = await this.executeSearch(query, from, effectiveSize, context, 'strict');
    if (!query.q || strictResult.totalItems >= MINIMUM_SEARCH_RESULTS) return strictResult;
    return this.executeSearch(query, from, effectiveSize, context, 'combined');
  }

  private async resolvePersonalizedContext(
    buyerId: string,
  ): Promise<PersonalizedSearchContext | null> {
    if (!this.profiles || !this.models) return null;
    const timeoutMs = this.config.elasticsearch.personalizationProfileTimeoutMs ?? 100;
    const profile = await withTimeout(
      this.profiles.resolveEligibleProfile(buyerId, new Date()),
      timeoutMs,
    );
    if (!profile) {
      this.logger.debug(
        `Catalogue search personalization fallback reason=profile-miss index=${this.config.elasticsearch.productIndexAlias}`,
      );
      return null;
    }
    const model = activeRankingModel(
      await withTimeout(this.models.findActiveCompatible(), timeoutMs),
    );
    if (!model) {
      this.logger.debug(
        `Catalogue search personalization fallback reason=model-missing index=${this.config.elasticsearch.productIndexAlias}`,
      );
      return null;
    }
    return { model, profile: boundedProfile(profile) };
  }

  private async executeSearch(
    query: NormalizedCatalogQuery,
    from: number,
    size: number,
    context?: PersonalizedSearchContext,
    mode: LexicalSearchMode = 'combined',
  ): Promise<ProductSearchQueryResult> {
    const startedAt = Date.now();
    try {
      const response = await withTimeout(
        this.adapter.search({
          from,
          size,
          track_total_hits: true,
          query: context
            ? personalizedLexicalQuery(query, context, mode)
            : lexicalQuery(query, mode),
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
        `Catalogue search outcome=elasticsearch${context ? '-personalized' : ''} mode=${mode} latencyMs=${tookMs} index=${indexVersion}`,
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
      // Phase 1: exact product-name prefix completion. This is the only
      // request made when enough exact suggestions are available.
      const exactResponse = await withTimeout(
        this.adapter.search(completionSuggestionRequest(query, limit)),
        this.config.elasticsearch.requestTimeoutMs,
      );
      let suggestions = parseSuggestionResponse(exactResponse, query, limit);

      // Phase 2: typo correction is strictly a fallback. Correct the query
      // with term/phrase suggesters only when the exact prefix did not fill
      // the requested number of suggestions, then append corrected-prefix
      // completions after the exact results.
      if (suggestions.length < limit) {
        try {
          const correctionResponse = await withTimeout(
            this.adapter.search(correctionSuggestionRequest(query, limit)),
            this.config.elasticsearch.requestTimeoutMs,
          );
          const correctedQuery = parseCorrectionResponse(correctionResponse, query);
          if (correctedQuery) {
            const correctedResponse = await withTimeout(
              this.adapter.search(completionSuggestionRequest(correctedQuery, limit)),
              this.config.elasticsearch.requestTimeoutMs,
            );
            const correctedSuggestions = parseSuggestionResponse(
              correctedResponse,
              correctedQuery,
              limit,
            );
            const seen = new Set(suggestions.map(({ text }) => normalizeProductSearchText(text)));
            const merged = [...suggestions];
            const normalizedCorrection = normalizeProductSearchText(correctedQuery);
            if (!seen.has(normalizedCorrection) && merged.length < limit) {
              seen.add(normalizedCorrection);
              merged.push({ text: correctedQuery });
            }
            for (const suggestion of correctedSuggestions) {
              if (merged.length >= limit) break;
              const normalized = normalizeProductSearchText(suggestion.text);
              if (!normalized || seen.has(normalized)) continue;
              seen.add(normalized);
              merged.push(suggestion);
            }
            suggestions = merged;
          }
        } catch (error) {
          // Correction is best-effort. Preserve exact prefix results if the
          // optional fallback suggester is unavailable or times out.
          this.logger.debug(
            `Catalogue suggestions correction fallback skipped reason=${classifyFailure(error)} index=${this.config.elasticsearch.productIndexAlias}`,
          );
        }
      }
      const tookMs = Date.now() - startedAt;
      this.logger.debug(
        `Catalogue suggestions outcome=elasticsearch latencyMs=${tookMs} exactCount=${suggestions.length} index=${this.config.elasticsearch.productIndexAlias}`,
      );
      return suggestions.slice(0, limit);
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
  personalizedLexicalQuery,
};

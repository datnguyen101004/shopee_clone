import {
  BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION,
  PRODUCT_SEARCH_ANALYZER_VERSION,
  PRODUCT_SEARCH_PROJECTION_VERSION,
} from './search.versions';

export const PRODUCT_SEARCH_DOCUMENT_VERSION = PRODUCT_SEARCH_PROJECTION_VERSION;

export interface ProductSearchDocument {
  projection_version: number;
  analyzer_version: number;
  product_id: string;
  slug: string;
  name: string;
  name_normalized: string;
  name_suggest: { input: string; weight: number };
  description: string;
  category_id: string;
  category_slug: string;
  category_name: string;
  category_name_normalized: string;
  category_path_ids: string[];
  category_path_slugs: string[];
  category_path_names: string[];
  shop_id: string;
  shop_slug: string;
  shop_name: string;
  shop_name_normalized: string;
  shop_location: string;
  shop_location_exact: string;
  shop_location_normalized: string;
  attribute_codes: string[];
  attributes: string[];
  primary_image_url: string | null;
  primary_image_alt: string | null;
  effective_price_minor: number;
  compare_at_price_minor: number | null;
  discount_basis_points: number;
  promotion_active: boolean;
  rating_average_basis_points: number;
  rating_count: number;
  sold_count: number;
  inventory_available: number;
  variant_count: number;
  displayable: true;
  product_created_at: string;
  product_updated_at: string;
  indexed_at: string;
  buyer_profile_feature_schema_version: number;
}

export interface ProductSearchDeleteDecision {
  product_id: string;
  reason:
    | 'missing'
    | 'product-not-sellable'
    | 'shop-not-sellable'
    | 'category-not-sellable'
    | 'no-available-variant'
    | 'invalid-effective-price';
}

export type ProductSearchProjection =
  | { kind: 'index'; document: ProductSearchDocument }
  | { kind: 'delete'; decision: ProductSearchDeleteDecision };

export function normalizeProductSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/đ/gi, (character) => (character === 'Đ' ? 'D' : 'd'))
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function productSearchMapping() {
  return {
    dynamic: 'strict',
    properties: {
      projection_version: { type: 'integer' },
      analyzer_version: { type: 'integer' },
      product_id: { type: 'keyword' },
      slug: { type: 'keyword' },
      name: {
        type: 'text',
        analyzer: 'vietnamese_index',
        search_analyzer: 'vietnamese_search',
        fields: {
          exact: { type: 'keyword' },
          normalized: { type: 'keyword' },
        },
      },
      name_normalized: { type: 'keyword' },
      name_suggest: {
        type: 'completion',
        analyzer: 'vietnamese_index',
        search_analyzer: 'vietnamese_search',
        preserve_separators: true,
        preserve_position_increments: true,
        max_input_length: 100,
      },
      description: {
        type: 'text',
        analyzer: 'vietnamese_index',
        search_analyzer: 'vietnamese_search',
      },
      category_id: { type: 'keyword' },
      category_slug: { type: 'keyword' },
      category_name: {
        type: 'text',
        analyzer: 'vietnamese_index',
        search_analyzer: 'vietnamese_search',
        fields: { exact: { type: 'keyword' }, normalized: { type: 'keyword' } },
      },
      category_name_normalized: { type: 'keyword' },
      category_path_ids: { type: 'keyword' },
      category_path_slugs: { type: 'keyword' },
      category_path_names: {
        type: 'text',
        analyzer: 'vietnamese_index',
        search_analyzer: 'vietnamese_search',
      },
      shop_id: { type: 'keyword' },
      shop_slug: { type: 'keyword' },
      shop_name: {
        type: 'text',
        analyzer: 'vietnamese_index',
        search_analyzer: 'vietnamese_search',
        fields: { exact: { type: 'keyword' }, normalized: { type: 'keyword' } },
      },
      shop_name_normalized: { type: 'keyword' },
      shop_location: {
        type: 'text',
        analyzer: 'vietnamese_index',
        search_analyzer: 'vietnamese_search',
        fields: { exact: { type: 'keyword' } },
      },
      shop_location_exact: { type: 'keyword' },
      shop_location_normalized: { type: 'keyword' },
      attribute_codes: { type: 'keyword' },
      attributes: {
        type: 'text',
        analyzer: 'vietnamese_index',
        search_analyzer: 'vietnamese_search',
      },
      primary_image_url: { type: 'keyword', index: false, doc_values: false },
      primary_image_alt: { type: 'text', index: false },
      effective_price_minor: { type: 'long' },
      compare_at_price_minor: { type: 'long' },
      discount_basis_points: { type: 'integer' },
      promotion_active: { type: 'boolean' },
      rating_average_basis_points: { type: 'integer' },
      rating_count: { type: 'integer' },
      sold_count: { type: 'integer' },
      inventory_available: { type: 'integer' },
      variant_count: { type: 'integer' },
      displayable: { type: 'boolean' },
      product_created_at: { type: 'date' },
      product_updated_at: { type: 'date' },
      indexed_at: { type: 'date' },
      buyer_profile_feature_schema_version: { type: 'integer' },
    },
  } as const;
}

export function productSearchIndexSettings() {
  return {
    number_of_shards: 1,
    number_of_replicas: 0,
    analysis: {
      char_filter: {
        vietnamese_d: {
          type: 'mapping',
          mappings: ['đ => d', 'Đ => D'],
        },
      },
      filter: {
        vietnamese_folding: { type: 'asciifolding', preserve_original: false },
      },
      analyzer: {
        vietnamese_index: {
          type: 'custom',
          char_filter: ['vietnamese_d'],
          tokenizer: 'standard',
          filter: ['lowercase', 'vietnamese_folding'],
        },
        vietnamese_search: {
          type: 'custom',
          char_filter: ['vietnamese_d'],
          tokenizer: 'standard',
          filter: ['lowercase', 'vietnamese_folding'],
        },
      },
    },
  } as const;
}

export const PRODUCT_SEARCH_INDEX_METADATA = {
  projectionVersion: PRODUCT_SEARCH_DOCUMENT_VERSION,
  analyzerVersion: PRODUCT_SEARCH_ANALYZER_VERSION,
  buyerProfileFeatureSchemaVersion: BUYER_SEARCH_PROFILE_FEATURE_SCHEMA_VERSION,
} as const;

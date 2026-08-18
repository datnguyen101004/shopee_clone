export const SELLER_PRODUCT_DEFAULT_PAGE_SIZE = 20;
export const SELLER_PRODUCT_MAX_PAGE_SIZE = 50;
export const SELLER_PRODUCT_TITLE_MAX_LENGTH = 240;
export const SELLER_PRODUCT_DESCRIPTION_MAX_LENGTH = 8000;
export const SELLER_PRODUCT_MAX_MEDIA = 9;
export const SELLER_PRODUCT_MAX_OPTION_GROUPS = 2;
export const SELLER_PRODUCT_MAX_OPTION_VALUES = 20;
export const SELLER_PRODUCT_MAX_VARIANTS = 100;

export const sellerProductLifecycleValues = ['draft', 'published', 'hidden', 'archived'] as const;
export const sellerProductModerationValues = ['active', 'suspended'] as const;
export type SellerProductLifecycle = (typeof sellerProductLifecycleValues)[number];
export type SellerProductModerationStatus = (typeof sellerProductModerationValues)[number];

export interface SellerProductCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isLeaf: boolean;
  attributes: SellerProductAttributeDefinition[];
}

export interface SellerProductAttributeDefinition {
  id: string;
  code: string;
  label: string;
  required: boolean;
  allowedValues: string[] | null;
}

export interface SellerProductAttributeInput {
  definitionId: string;
  value: string;
}

export interface SellerProductMediaInput {
  url?: string;
  assetId?: string;
  imageId?: string;
  altText: string | null;
  sortOrder: number;
}

export interface SellerProductMedia extends SellerProductMediaInput {
  id: string;
  variantId: string | null;
}

export interface SellerProductMediaStageResponse {
  id: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
  width: number;
  height: number;
  previewUrl: string;
  expiresAt: string;
}

export interface SellerProductOptionInput {
  name: string;
  values: string[];
}

export interface SellerProductOptionValueMediaInput {
  groupIndex: number;
  value: string;
  mediaRef: { assetId?: string; imageId?: string } | null;
}

export interface SellerProductVariantInput {
  combination: string[];
  priceMinor: number;
  compareAtPriceMinor: number | null;
  stock: number;
  weightGrams: number;
  maxPurchaseQuantity: number | null;
  active: boolean;
  imageUrl?: string | null;
}

export interface SellerProductUpsertRequest {
  name: string;
  description: string;
  categoryId: string;
  attributes: SellerProductAttributeInput[];
  media: SellerProductMediaInput[];
  optionValueMedia?: SellerProductOptionValueMediaInput[];
  packageLengthMm: number | null;
  packageWidthMm: number | null;
  packageHeightMm: number | null;
  optionGroups: SellerProductOptionInput[];
  variants: SellerProductVariantInput[];
}

export interface SellerProductVariant extends SellerProductVariantInput {
  id: string;
  sku: string;
  imageUrl?: string | null;
  inventoryVersion?: number;
}

export interface SellerProductDetail extends SellerProductUpsertRequest {
  id: string;
  slug: string;
  lifecycle: SellerProductLifecycle;
  moderationStatus: SellerProductModerationStatus;
  moderationReason: string | null;
  media: SellerProductMedia[];
  optionValueMedia?: SellerProductOptionValueMediaInput[];
  variants: SellerProductVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface SellerProductSummary {
  id: string;
  slug: string;
  name: string;
  categoryName: string;
  lifecycle: SellerProductLifecycle;
  moderationStatus: SellerProductModerationStatus;
  primaryMediaUrl: string | null;
  variantCount: number;
  stockQuantity: number;
  updatedAt: string;
}

export interface SellerProductPage {
  items: SellerProductSummary[];
  nextCursor: string | null;
}

export interface SellerProductPageQuery {
  cursor: string | null;
  limit: number;
  lifecycle: SellerProductLifecycle | null;
}

export interface SellerProductLifecycleRequest {
  lifecycle: Extract<SellerProductLifecycle, 'published' | 'hidden' | 'archived'>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function isCanonicalSellerProductId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeSellerProductSlug(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) && normalized.length >= 3 && normalized.length <= 160
    ? normalized
    : null;
}

export function normalizeSellerProductText(value: string, max: number): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ');
  const hasControlCharacter = Array.from(normalized).some((character) => {
    const code = character.charCodeAt(0);
    return (code >= 0 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);
  });
  return normalized.length > 0 && normalized.length <= max && !hasControlCharacter
    ? normalized
    : null;
}

export function normalizeSellerProductMediaUrl(value: string): string | null {
  const normalized = value.trim();
  return normalized.length <= 1000 && /^https:\/\/[^@\s/]+(?:\/\S*)?$/i.test(normalized)
    ? normalized
    : null;
}

function positiveInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= maximum;
}

function nonNegativeInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

export function generateSellerProductCombinations(groups: SellerProductOptionInput[]): string[][] {
  if (groups.length === 0) return [[]];
  return groups.reduce<string[][]>(
    (combinations, group) => combinations.flatMap((current) => group.values.map((value) => [...current, value])),
    [[]],
  );
}

export function isSellerProductUpsertRequest(value: unknown): value is SellerProductUpsertRequest {
  const allowedKeys = ['name', 'description', 'categoryId', 'attributes', 'media', 'packageLengthMm', 'packageWidthMm', 'packageHeightMm', 'optionGroups', 'variants', 'optionValueMedia'];
  if (!isRecord(value) || Object.keys(value).some((key) => !allowedKeys.includes(key)) || !['name', 'description', 'categoryId', 'attributes', 'media', 'packageLengthMm', 'packageWidthMm', 'packageHeightMm', 'optionGroups', 'variants'].every((key) => Object.hasOwn(value, key))) return false;
  if (typeof value.name !== 'string' || normalizeSellerProductText(value.name, SELLER_PRODUCT_TITLE_MAX_LENGTH) === null || typeof value.description !== 'string' || value.description.trim().length > SELLER_PRODUCT_DESCRIPTION_MAX_LENGTH || !isCanonicalSellerProductId(value.categoryId)) return false;
  if (![value.packageLengthMm, value.packageWidthMm, value.packageHeightMm].every((dimension) => dimension === null || positiveInteger(dimension, 100000))) return false;
  if (!Array.isArray(value.attributes) || !Array.isArray(value.media) || !Array.isArray(value.optionGroups) || !Array.isArray(value.variants) || value.media.length > SELLER_PRODUCT_MAX_MEDIA || value.optionGroups.length > SELLER_PRODUCT_MAX_OPTION_GROUPS || value.variants.length < 1 || value.variants.length > SELLER_PRODUCT_MAX_VARIANTS) return false;
  if (!value.attributes.every((attribute) => isRecord(attribute) && exactKeys(attribute, ['definitionId', 'value']) && isCanonicalSellerProductId(attribute.definitionId) && typeof attribute.value === 'string' && normalizeSellerProductText(attribute.value, 240) !== null)) return false;
  if (!value.media.every((media) => {
    if (!isRecord(media) || !Object.hasOwn(media, 'altText') || !Object.hasOwn(media, 'sortOrder') || (media.altText !== null && (typeof media.altText !== 'string' || media.altText.length > 240)) || !nonNegativeInteger(media.sortOrder, SELLER_PRODUCT_MAX_MEDIA)) return false;
    const hasUrl = Object.hasOwn(media, 'url') && media.url !== undefined;
    const hasAssetId = Object.hasOwn(media, 'assetId') && media.assetId !== undefined;
    const hasImageId = Object.hasOwn(media, 'imageId') && media.imageId !== undefined;
    if (Number(hasUrl) + Number(hasAssetId) + Number(hasImageId) !== 1) return false;
    return hasUrl ? typeof media.url === 'string' && normalizeSellerProductMediaUrl(media.url) !== null : hasAssetId ? isCanonicalSellerProductId(media.assetId) : isCanonicalSellerProductId(media.imageId);
  })) return false;
  const mediaKeys = value.media.map((media) => typeof media.url === 'string' ? media.url : typeof media.assetId === 'string' ? `asset:${media.assetId}` : `image:${media.imageId}`);
  if (new Set(mediaKeys).size !== value.media.length || new Set(value.media.map((media) => media.sortOrder)).size !== value.media.length) return false;
  if (value.optionValueMedia !== undefined) {
    if (!Array.isArray(value.optionValueMedia) || !value.optionValueMedia.every((entry) => {
      if (!isRecord(entry) || !exactKeys(entry, ['groupIndex', 'value', 'mediaRef']) || !nonNegativeInteger(entry.groupIndex, SELLER_PRODUCT_MAX_OPTION_GROUPS - 1) || typeof entry.value !== 'string' || normalizeSellerProductText(entry.value, 120) === null) return false;
      if (entry.mediaRef === null) return true;
      if (!isRecord(entry.mediaRef)) return false;
      const hasAssetId = Object.hasOwn(entry.mediaRef, 'assetId') && entry.mediaRef.assetId !== undefined;
      const hasImageId = Object.hasOwn(entry.mediaRef, 'imageId') && entry.mediaRef.imageId !== undefined;
      if (Number(hasAssetId) + Number(hasImageId) !== 1) return false;
      return hasAssetId ? isCanonicalSellerProductId(entry.mediaRef.assetId) : isCanonicalSellerProductId(entry.mediaRef.imageId);
    })) return false;
  }
  if (!value.optionGroups.every((group) => isRecord(group) && exactKeys(group, ['name', 'values']) && typeof group.name === 'string' && normalizeSellerProductText(group.name, 80) !== null && Array.isArray(group.values) && group.values.length > 0 && group.values.length <= SELLER_PRODUCT_MAX_OPTION_VALUES && group.values.every((item) => typeof item === 'string' && normalizeSellerProductText(item, 120) !== null) && new Set(group.values.map((item) => item.trim().toLowerCase())).size === group.values.length)) return false;
  const expected = generateSellerProductCombinations(value.optionGroups as SellerProductOptionInput[]);
  if (expected.length !== value.variants.length) return false;
  const expectedKeys = new Set(expected.map((combination) => combination.join('\u001f')));
  return value.variants.every((variant) => isRecord(variant) && exactKeys(variant, ['combination', 'priceMinor', 'compareAtPriceMinor', 'stock', 'weightGrams', 'maxPurchaseQuantity', 'active']) && Array.isArray(variant.combination) && variant.combination.every((item) => typeof item === 'string') && expectedKeys.has(variant.combination.join('\u001f')) && nonNegativeInteger(variant.priceMinor) && (variant.compareAtPriceMinor === null || (nonNegativeInteger(variant.compareAtPriceMinor) && variant.compareAtPriceMinor >= variant.priceMinor)) && nonNegativeInteger(variant.stock) && positiveInteger(variant.weightGrams, 100000) && (variant.maxPurchaseQuantity === null || positiveInteger(variant.maxPurchaseQuantity, 100000)) && typeof variant.active === 'boolean') && new Set(value.variants.map((variant) => variant.combination.join('\u001f'))).size === value.variants.length;
}

export function isSellerProductLifecycleRequest(value: unknown): value is SellerProductLifecycleRequest {
  return isRecord(value) && exactKeys(value, ['lifecycle']) && typeof value.lifecycle === 'string' && ['published', 'hidden', 'archived'].includes(value.lifecycle);
}

function canonicalDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function isSellerProductPage(value: unknown): value is SellerProductPage {
  return isRecord(value) && exactKeys(value, ['items', 'nextCursor']) && Array.isArray(value.items) && (value.nextCursor === null || isCanonicalSellerProductId(value.nextCursor)) && value.items.every((item) => isRecord(item) && exactKeys(item, ['id', 'slug', 'name', 'categoryName', 'lifecycle', 'moderationStatus', 'primaryMediaUrl', 'variantCount', 'stockQuantity', 'updatedAt']) && isCanonicalSellerProductId(item.id) && typeof item.slug === 'string' && typeof item.name === 'string' && typeof item.categoryName === 'string' && sellerProductLifecycleValues.includes(item.lifecycle as SellerProductLifecycle) && sellerProductModerationValues.includes(item.moderationStatus as SellerProductModerationStatus) && (item.primaryMediaUrl === null || typeof item.primaryMediaUrl === 'string') && nonNegativeInteger(item.variantCount) && nonNegativeInteger(item.stockQuantity) && canonicalDate(item.updatedAt));
}

export function isSellerProductCategories(value: unknown): value is SellerProductCategory[] {
  return Array.isArray(value) && value.every((category) => isRecord(category) && exactKeys(category, ['id', 'name', 'slug', 'parentId', 'isLeaf', 'attributes']) && isCanonicalSellerProductId(category.id) && typeof category.name === 'string' && typeof category.slug === 'string' && (category.parentId === null || isCanonicalSellerProductId(category.parentId)) && typeof category.isLeaf === 'boolean' && Array.isArray(category.attributes) && category.attributes.every((attribute) => isRecord(attribute) && exactKeys(attribute, ['id', 'code', 'label', 'required', 'allowedValues']) && isCanonicalSellerProductId(attribute.id) && typeof attribute.code === 'string' && typeof attribute.label === 'string' && typeof attribute.required === 'boolean' && (attribute.allowedValues === null || (Array.isArray(attribute.allowedValues) && attribute.allowedValues.every((item) => typeof item === 'string')))));
}

export function isSellerProductDetail(value: unknown): value is SellerProductDetail {
  if (!isRecord(value) || typeof value.slug !== 'string' || normalizeSellerProductSlug(value.slug) === null) return false;
  const media = Array.isArray(value.media)
    ? value.media.map((item) => isRecord(item) && typeof item.id === 'string'
      ? { imageId: item.id, altText: item.altText, sortOrder: item.sortOrder }
      : item)
    : value.media;
  const variants = Array.isArray(value.variants)
    ? value.variants.map((item) => {
      if (!isRecord(item)) return item;
      const input = { ...item };
      delete input.id;
      delete input.sku;
      delete input.imageUrl;
      delete input.inventoryVersion;
      return input;
    })
    : value.variants;
  return isSellerProductUpsertRequest({
    name: value.name,
    description: value.description,
    categoryId: value.categoryId,
    attributes: value.attributes,
    media,
    optionValueMedia: value.optionValueMedia,
    packageLengthMm: value.packageLengthMm,
    packageWidthMm: value.packageWidthMm,
    packageHeightMm: value.packageHeightMm,
    optionGroups: value.optionGroups,
    variants,
  }) && Array.isArray(value.variants) && value.variants.every((variant) => isRecord(variant) && typeof variant.sku === 'string' && variant.sku.trim().length > 0 && variant.sku.length <= 80) && isCanonicalSellerProductId(value.id) && sellerProductLifecycleValues.includes(value.lifecycle as SellerProductLifecycle) && sellerProductModerationValues.includes(value.moderationStatus as SellerProductModerationStatus) && (value.moderationReason === null || typeof value.moderationReason === 'string') && canonicalDate(value.createdAt) && canonicalDate(value.updatedAt);
}

export function parseSellerProductPageQuery(value: { cursor?: string | string[]; limit?: string | string[]; lifecycle?: string | string[] }): SellerProductPageQuery | null {
  const one = (item: string | string[] | undefined) => typeof item === 'string' ? item : undefined;
  const cursor = one(value.cursor) ?? null;
  const limitText = one(value.limit);
  const lifecycle = one(value.lifecycle) ?? null;
  const limit = limitText === undefined ? SELLER_PRODUCT_DEFAULT_PAGE_SIZE : Number(limitText);
  if ((cursor !== null && !isCanonicalSellerProductId(cursor)) || !Number.isSafeInteger(limit) || limit < 1 || limit > SELLER_PRODUCT_MAX_PAGE_SIZE || (lifecycle !== null && !sellerProductLifecycleValues.includes(lifecycle as SellerProductLifecycle))) return null;
  return { cursor, limit, lifecycle: lifecycle as SellerProductLifecycle | null };
}

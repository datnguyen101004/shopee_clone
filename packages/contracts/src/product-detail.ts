import type { CatalogProductCard } from './catalog';

export type ProductAvailability = 'in-stock' | 'unavailable';

export interface ProductDetailCategory {
  slug: string;
  name: string;
}

export interface ProductGalleryMedia {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
  variantId: string | null;
  isPrimary: boolean;
}

export interface ProductDetailVariant {
  id: string;
  name: string;
  sku: string;
  priceMinor: number;
  compareAtPriceMinor?: number;
  discountPercent?: number;
  availableQuantity: number;
  availability: ProductAvailability;
  preferredImageId: string | null;
}

export interface ProductDetailShop {
  id: string;
  slug: string;
  name: string;
  location: string;
  activeProductCount: number;
  ratingAverageBasisPoints?: number;
  ratingCount?: number;
}

export interface ProductShippingPreview {
  origin: string;
  destinationLabel: string;
  feeMinor: null;
  deliveryTimeLabel: null;
  message: string;
}

export interface ProductDetailResponse {
  id: string;
  name: string;
  description: string;
  category: ProductDetailCategory;
  ratingAverageBasisPoints: number;
  ratingCount: number;
  soldCount: number;
  gallery: ProductGalleryMedia[];
  variants: ProductDetailVariant[];
  purchasable: boolean;
  initialVariantId: string | null;
  shop: ProductDetailShop;
  shippingPreview: ProductShippingPreview;
  relatedProducts: CatalogProductCard[];
}

export interface ProductDeletedProblemDetails {
  type: 'https://shopee-clone.local/problems/product-deleted';
  title: 'Product deleted';
  status: 410;
  detail: string;
  code: 'PRODUCT_DELETED';
}

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isUuid = (value: unknown): value is string => isString(value) && canonicalUuid.test(value);
const isSafeNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function isSafeMediaUrl(value: unknown): value is string {
  if (!isString(value)) return false;
  if (value.startsWith('/')) return true;
  return value.startsWith('https://') && !/\s/.test(value);
}

function isCategory(value: unknown): value is ProductDetailCategory {
  return isRecord(value) && isString(value.slug) && isString(value.name);
}

function isGalleryMedia(
  value: unknown,
  productVariantIds: Set<string>,
): value is ProductGalleryMedia {
  return (
    isRecord(value) &&
    isUuid(value.id) &&
    isSafeMediaUrl(value.url) &&
    isString(value.altText) &&
    isSafeNonNegativeInteger(value.sortOrder) &&
    (value.variantId === null ||
      (isUuid(value.variantId) && productVariantIds.has(value.variantId))) &&
    typeof value.isPrimary === 'boolean'
  );
}

function isVariant(value: unknown, galleryIds: Set<string>): value is ProductDetailVariant {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isString(value.name) ||
    !isString(value.sku) ||
    !isSafeNonNegativeInteger(value.priceMinor) ||
    !isSafeNonNegativeInteger(value.availableQuantity) ||
    !['in-stock', 'unavailable'].includes(String(value.availability)) ||
    !(
      value.preferredImageId === null ||
      (isUuid(value.preferredImageId) && galleryIds.has(value.preferredImageId))
    )
  ) {
    return false;
  }
  if (value.availableQuantity > 0 !== (value.availability === 'in-stock')) return false;
  const hasCompare = value.compareAtPriceMinor !== undefined;
  const hasDiscount = value.discountPercent !== undefined;
  return (
    hasCompare === hasDiscount &&
    (!hasCompare ||
      (isSafeNonNegativeInteger(value.compareAtPriceMinor) &&
        value.compareAtPriceMinor > value.priceMinor &&
        isPositiveInteger(value.discountPercent) &&
        value.discountPercent <= 100))
  );
}

function isRelatedCard(value: unknown): value is CatalogProductCard {
  if (!isRecord(value) || !isUuid(value.id) || !isString(value.href)) return false;
  const href = `/products/${value.id}`;
  if (value.href !== href) return false;
  return (
    isString(value.name) &&
    (value.imageUrl === null || isString(value.imageUrl)) &&
    isString(value.imageAlt) &&
    isSafeNonNegativeInteger(value.priceMinor) &&
    isSafeNonNegativeInteger(value.ratingAverageBasisPoints) &&
    value.ratingAverageBasisPoints <= 500 &&
    isSafeNonNegativeInteger(value.ratingCount) &&
    isSafeNonNegativeInteger(value.soldCount) &&
    isRecord(value.shop) &&
    isString(value.shop.name) &&
    isString(value.shop.location) &&
    isRecord(value.category) &&
    isString(value.category.slug) &&
    isString(value.category.name) &&
    ((value.compareAtPriceMinor === undefined && value.discountPercent === undefined) ||
      (isSafeNonNegativeInteger(value.compareAtPriceMinor) &&
        value.compareAtPriceMinor > value.priceMinor &&
        isPositiveInteger(value.discountPercent) &&
        value.discountPercent <= 100))
  );
}

export function isProductDeletedProblemDetails(value: unknown): value is ProductDeletedProblemDetails {
  return isRecord(value) &&
    Object.keys(value).sort().join(',') === 'code,detail,status,title,type' &&
    value.type === 'https://shopee-clone.local/problems/product-deleted' &&
    value.title === 'Product deleted' &&
    value.status === 410 &&
    typeof value.detail === 'string' &&
    value.code === 'PRODUCT_DELETED';
}

export function isProductDetailResponse(value: unknown): value is ProductDetailResponse {
  if (
    !isRecord(value) ||
    !isUuid(value.id) ||
    !isString(value.name) ||
    typeof value.description !== 'string' ||
    !isCategory(value.category) ||
    !isSafeNonNegativeInteger(value.ratingAverageBasisPoints) ||
    value.ratingAverageBasisPoints > 500 ||
    !isSafeNonNegativeInteger(value.ratingCount) ||
    !isSafeNonNegativeInteger(value.soldCount) ||
    !Array.isArray(value.variants) ||
    !Array.isArray(value.gallery) ||
    typeof value.purchasable !== 'boolean' ||
    !(value.initialVariantId === null || isUuid(value.initialVariantId)) ||
    !isRecord(value.shop) ||
    !isUuid(value.shop.id) ||
    !isString(value.shop.slug) ||
    !isString(value.shop.name) ||
    !isString(value.shop.location) ||
    !isSafeNonNegativeInteger(value.shop.activeProductCount) ||
    !(value.shop.ratingAverageBasisPoints === undefined || (isSafeNonNegativeInteger(value.shop.ratingAverageBasisPoints) && value.shop.ratingAverageBasisPoints <= 500)) ||
    !(value.shop.ratingCount === undefined || isSafeNonNegativeInteger(value.shop.ratingCount)) ||
    !isRecord(value.shippingPreview) ||
    !isString(value.shippingPreview.origin) ||
    !isString(value.shippingPreview.destinationLabel) ||
    value.shippingPreview.feeMinor !== null ||
    value.shippingPreview.deliveryTimeLabel !== null ||
    !isString(value.shippingPreview.message) ||
    !Array.isArray(value.relatedProducts)
  ) {
    return false;
  }

  const variants = value.variants as unknown[];
  const gallery = value.gallery as unknown[];
  const relatedProducts = value.relatedProducts as unknown[];
  const variantIds = new Set<string>();
  if (
    !variants.every(
      (variant) =>
        isRecord(variant) &&
        isUuid(variant.id) &&
        !variantIds.has(variant.id) &&
        (variantIds.add(variant.id), true),
    )
  )
    return false;
  const galleryIds = new Set<string>();
  if (
    !gallery.every(
      (media) =>
        isRecord(media) &&
        isUuid(media.id) &&
        !galleryIds.has(media.id) &&
        (galleryIds.add(media.id), true),
    )
  )
    return false;
  if (!gallery.every((media) => isGalleryMedia(media, variantIds))) return false;
  if (!variants.every((variant) => isVariant(variant, galleryIds))) return false;
  const typedGallery = gallery as ProductGalleryMedia[];
  const typedVariants = variants as ProductDetailVariant[];
  if (typedGallery.filter((media) => media.isPrimary).length > 1) return false;
  if (typedGallery.length > 0 && !typedGallery[0]?.isPrimary) return false;
  if (
    !typedGallery.every(
      (media, index) => index === 0 || typedGallery[index - 1]!.sortOrder <= media.sortOrder,
    )
  )
    return false;

  const purchasableVariants = typedVariants.filter(
    (variant) => variant.availability === 'in-stock',
  );
  if (value.purchasable !== purchasableVariants.length > 0) return false;
  if (value.initialVariantId !== null && !variantIds.has(value.initialVariantId)) return false;
  if (value.purchasable && value.initialVariantId === null) return false;
  if (value.initialVariantId !== null && value.purchasable) {
    const initial = typedVariants.find((variant) => variant.id === value.initialVariantId);
    if (initial?.availability !== 'in-stock') return false;
  }
  return (
    relatedProducts.length <= 6 &&
    relatedProducts.every(
      (card) => isRecord(card) && card.id !== value.id && isRelatedCard(card),
    ) &&
    new Set(relatedProducts.map((card) => (card as CatalogProductCard).id)).size ===
      relatedProducts.length
  );
}

export function parseProductDetailResponse(value: unknown): ProductDetailResponse | null {
  return isProductDetailResponse(value) ? value : null;
}

export function isCanonicalProductId(value: string): boolean {
  return canonicalUuid.test(value);
}

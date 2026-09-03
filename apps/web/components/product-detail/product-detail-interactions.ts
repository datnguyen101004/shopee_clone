import type {
  ProductDetailResponse,
  ProductDetailVariant,
  ProductGalleryMedia,
} from '@shopee-clone/contracts';

export interface ProductDetailSelection {
  variantId: string | null;
  activeImageId: string | null;
  quantity: string;
}

export function getVariant(
  product: ProductDetailResponse,
  variantId: string | null,
): ProductDetailVariant | null {
  return product.variants.find((variant) => variant.id === variantId) ?? null;
}

export function preferredImageId(
  product: ProductDetailResponse,
  variant: ProductDetailVariant | null,
): string | null {
  return variant?.preferredImageId ?? product.gallery[0]?.id ?? null;
}

export function initialProductDetailSelection(
  product: ProductDetailResponse,
): ProductDetailSelection {
  const variant = getVariant(product, product.initialVariantId);
  return {
    variantId: variant?.id ?? null,
    activeImageId: preferredImageId(product, variant),
    quantity: '1',
  };
}

export function selectProductVariant(
  product: ProductDetailResponse,
  current: ProductDetailSelection,
  variantId: string,
): ProductDetailSelection {
  const variant = getVariant(product, variantId);
  if (!variant) return current;
  const currentQuantity = Number(current.quantity);
  const quantity =
    Number.isSafeInteger(currentQuantity) &&
    currentQuantity >= 1 &&
    currentQuantity <= variant.availableQuantity
      ? String(currentQuantity)
      : '1';
  return { variantId, activeImageId: preferredImageId(product, variant), quantity };
}

export function activeProductImage(
  product: ProductDetailResponse,
  imageId: string | null,
): ProductGalleryMedia | null {
  return product.gallery.find((image) => image.id === imageId) ?? product.gallery[0] ?? null;
}

export function quantityError(value: string, variant: ProductDetailVariant | null): string | null {
  if (!variant || variant.availability !== 'in-stock')
    return 'Biến thể đã chọn hiện không còn hàng.';
  if (!/^[1-9]\d*$/.test(value)) return 'Số lượng phải là số nguyên dương.';
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity > variant.availableQuantity) {
    return `Số lượng tối đa là ${variant.availableQuantity}.`;
  }
  return null;
}

export function canPurchase(value: string, variant: ProductDetailVariant | null): boolean {
  return quantityError(value, variant) === null;
}

export function productLoginHandoff(
  product: ProductDetailResponse,
  variantId: string,
  quantity: string,
  intent: 'add-to-cart' | 'buy-now',
): string {
  const params = new URLSearchParams({
    intent,
    returnTo: `/products/${product.slug || product.id}`,
    productId: product.id,

    variantId,
    quantity,
  });
  return `/login?${params.toString()}`;
}

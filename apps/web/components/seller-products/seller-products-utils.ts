import {
  type SellerProductCategory,
  type SellerProductDetail,
  type SellerProductLifecycle,
  type SellerProductOptionInput,
  type SellerProductUpsertRequest,
  type SellerProductVariantInput,
  generateSellerProductCombinations,
} from '@shopee-clone/contracts';
import { RoleApiError } from '../../lib/role-api';
import { marketplaceMediaUrl } from '../../lib/marketplace-media-url';

export function sellerProductMediaUrl(value: string | null | undefined): string {
  return marketplaceMediaUrl(value);
}

export function formatMoney(amountMinor: number | null | undefined): string {
  if (amountMinor === null || amountMinor === undefined) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.max(0, amountMinor)) + ' đ';
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(
    Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0)),
  );
}

export function parseFormattedInteger(value: string): number {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

export function mmToCmString(mm: number | null | undefined): string {
  if (mm === null || mm === undefined || Number.isNaN(mm)) return '';
  return (mm / 10).toString();
}

export function cmStringToMm(cmStr: string): number | null {
  const trimmed = cmStr.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 10);
}

export const emptyVariant = (): SellerProductVariantInput => ({
  combination: [],
  priceMinor: 1,
  compareAtPriceMinor: null,
  stock: 1,
  weightGrams: 500,
  maxPurchaseQuantity: null,
  active: true,
});

export const initialUpsertRequest = (categoryId = ''): SellerProductUpsertRequest => ({
  name: '',
  description: '',
  categoryId,
  attributes: [],
  media: [],
  packageLengthMm: null,
  packageWidthMm: null,
  packageHeightMm: null,
  optionGroups: [],
  optionValueMedia: [],
  variants: [emptyVariant()],
});

export function configuredGroups(groups: SellerProductOptionInput[]): SellerProductOptionInput[] {
  return groups
    .map((group) => ({
      name: group.name.trim(),
      values: group.values.map((value) => value.trim()).filter(Boolean),
    }))
    .filter((group) => group.name.length > 0 && group.values.length > 0);
}

export function variantsFor(
  groups: SellerProductOptionInput[],
  current: SellerProductVariantInput[],
): SellerProductVariantInput[] {
  const combinations = generateSellerProductCombinations(configuredGroups(groups));
  const expected = combinations.length > 0 ? combinations : [[]];
  const retained = new Map(current.map((variant) => [variant.combination.join('\u001f'), variant]));
  return expected.map(
    (combination) => retained.get(combination.join('\u001f')) ?? { ...emptyVariant(), combination },
  );
}

export function toInput(product: SellerProductDetail): SellerProductUpsertRequest {
  return {
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    attributes: product.attributes,
    media: product.media.map(({ id, altText, sortOrder }) => ({ imageId: id, altText, sortOrder })),
    packageLengthMm: product.packageLengthMm,
    packageWidthMm: product.packageWidthMm,
    packageHeightMm: product.packageHeightMm,
    optionGroups: product.optionGroups,
    optionValueMedia: product.optionValueMedia ?? [],
    variants: product.variants.map((variant) => ({
      combination: variant.combination,
      priceMinor: variant.priceMinor,
      compareAtPriceMinor: variant.compareAtPriceMinor,
      stock: variant.stock,
      weightGrams: variant.weightGrams,
      maxPurchaseQuantity: variant.maxPurchaseQuantity,
      active: variant.active,
    })),
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof RoleApiError) {
    if (error.status === 404) return 'Không tìm thấy sản phẩm.';
    if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Đã có lỗi xảy ra. Hãy thử lại.';
}

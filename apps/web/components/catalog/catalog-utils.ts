import type { CatalogQueryContext } from '@shopee-clone/contracts';
import {
  catalogSearchHref,
  type CatalogQueryKey,
  type CatalogUrlQuery,
} from '../../lib/catalog-query';

export type CatalogRouteContext = CatalogQueryContext & { pageSize: number };

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

export function formatPriceDisplay(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('vi-VN').format(Number(digits));
}

export const PRICE_RANGE_PRESETS = [
  { label: 'Chọn khoảng giá', min: null, max: null, key: '' },
  { label: '0 – 100.000₫ (Dưới 100k)', min: 0, max: 100000, key: '0-100000' },
  { label: '100.000₫ – 500.000₫ (100k – 500k)', min: 100000, max: 500000, key: '100000-500000' },
  { label: '500.000₫ – 1.000.000₫ (500k – 1 triệu)', min: 500000, max: 1000000, key: '500000-1000000' },
  { label: '1.000.000₫ – 3.000.000₫ (1 triệu – 3 triệu)', min: 1000000, max: 3000000, key: '1000000-3000000' },
  { label: '3.000.000₫ – 10.000.000₫ (3 triệu – 10 triệu)', min: 3000000, max: 10000000, key: '3000000-10000000' },
  { label: 'Trên 10.000.000₫ (Trên 10 triệu)', min: 10000000, max: null, key: '10000000-' },
];

export const filterLabels: Partial<Record<CatalogQueryKey, string>> = {
  q: 'Từ khóa',
  category: 'Danh mục',
  minPrice: 'Giá từ',
  maxPrice: 'Giá đến',
  rating: 'Đánh giá',
  location: 'Nơi bán',
  availability: 'Còn hàng',
  promotion: 'Đang giảm giá',
};

export function contextQuery(context: CatalogRouteContext): CatalogUrlQuery {
  return {
    q: context.q,
    category: context.category,
    minPrice: context.minPrice,
    maxPrice: context.maxPrice,
    rating: context.rating,
    location: context.location,
    availability: context.availability,
    promotion: context.promotion,
    sort: context.sort,
    pageSize: context.pageSize,
  };
}

export function catalogPageHref(context: CatalogRouteContext, page: number): string {
  return catalogSearchHref({ ...contextQuery(context), page });
}

export function pageNumbers(current: number, total: number): number[] {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

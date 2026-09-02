import { ORDER_LIST_FILTERS, type BuyerOrderListFilter } from '@shopee-clone/contracts';

export function pickBuyerOrderFilter(
  searchParams: Record<string, string | string[] | undefined>,
): BuyerOrderListFilter | null {
  if (Object.keys(searchParams).some((key) => key !== 'filter')) return null;
  const raw = searchParams.filter ?? 'ALL';
  if (raw === 'AWAITING_PICKUP') return 'SHIPPING';
  if (Array.isArray(raw) || !ORDER_LIST_FILTERS.includes(raw as BuyerOrderListFilter)) return null;
  return raw as BuyerOrderListFilter;
}

export function buyerOrdersHref(filter: BuyerOrderListFilter): string {
  return filter === 'ALL'
    ? '/account/orders'
    : `/account/orders?filter=${encodeURIComponent(filter)}`;
}

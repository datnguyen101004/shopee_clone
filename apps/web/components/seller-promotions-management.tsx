'use client';

import type {
  SellerPromotionAction,
  SellerVoucherCreateRequest,
  SellerVoucherSummary,
} from '@shopee-clone/contracts';
import { AlertTriangle, CalendarDays, Check, ChevronDown, Eye, Plus, Search, SquarePen, Trash2, useToast } from '@shopee-clone/ui';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { DateTimeLocalPicker } from './datetime-local-picker';
import { useAuthSession } from './auth-session-provider';
import { RoleApiError } from '../lib/role-api';
import type { AuthenticatedFetcher } from '../lib/role-api';
import {
  actionSellerVoucher,
  createSellerVoucher,
  deleteSellerVoucher,
  fetchSellerVouchers,
  updateSellerVoucher,
} from '../lib/seller-promotions-api';
import type { SellerProductSummary } from '@shopee-clone/contracts';
import { fetchSellerProducts } from '../lib/seller-products-api';
import { formatMoney, sellerProductMediaUrl } from './seller-products/seller-products-utils';

const iso = (value: string, boundary: 'start' | 'end' = 'start') => {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${boundary === 'end' ? '23:59:59.999' : '00:00:00'}`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};
const dateInput = (days: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const dateInputValue = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const money = (value: number | null) =>
  value === null ? '—' : `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
const formatIntegerInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};
const integerInputValue = (value: string) => Number(value.replace(/\D/g, '') || 0);
const promotionStateLabel: Record<SellerVoucherSummary['state'], string> = {
  SCHEDULED: 'Đã lên lịch',
  ACTIVE: 'Đang chạy',
  PAUSED: 'Tạm dừng',
  EXHAUSTED: 'Đã hết lượt',
  EXPIRED: 'Hết hạn',
};
type PromotionSort = 'newest' | 'oldest' | 'highest-value' | 'lowest-value';

function promotionValue(item: SellerVoucherSummary): number {
  return item.benefitType === 'FIXED_AMOUNT'
    ? item.fixedAmountMinor ?? 0
    : item.percentageBasisPoints ?? 0;
}
const FIELD_ERROR_VI: Record<string, string> = {
  name: 'Tên khuyến mãi không hợp lệ (bắt buộc, tối đa 160 ký tự).',
  benefitType: 'Loại ưu đãi không hợp lệ.',
  fixedAmountMinor: 'Mức giảm số tiền không hợp lệ.',
  percentageBasisPoints: 'Mức giảm phần trăm phải từ 1% đến 90%.',
  maximumDiscountMinor: 'Mức giảm tối đa không hợp lệ.',
  minimumSpendMinor: 'Đơn tối thiểu không hợp lệ.',
  startsAt: 'Thời gian bắt đầu không hợp lệ.',
  endsAt: 'Thời gian kết thúc phải sau thời gian bắt đầu.',
  usageLimit: 'Giới hạn lượt dùng phải từ 1 trở lên và không nhỏ hơn số đã dùng.',
  perBuyerLimit: 'Giới hạn mỗi người mua phải từ 1 trở lên.',
  productIds: 'Danh sách product ID không hợp lệ.',
  products: 'Danh sách sản phẩm giảm giá không hợp lệ.',
  idempotencyKey: 'Thiếu hoặc sai Idempotency-Key.',
  ifMatch: 'Thiếu hoặc sai phiên bản khuyến mãi (If-Match).',
  request: 'Dữ liệu gửi lên không hợp lệ.',
  query: 'Bộ lọc danh sách không hợp lệ.',
  cursor: 'Con trỏ phân trang không hợp lệ.',
};
const DETAIL_ERROR_VI: Array<[string, string]> = [
  ['Voucher code is already in use.', 'Mã voucher đã được sử dụng.'],
  ['Promotion name is required (max 160 characters).', FIELD_ERROR_VI.name!],
  ['Start time must be before end time', 'Thời gian bắt đầu phải trước thời gian kết thúc.'],
  ['Usage limit cannot be lower than already redeemed uses.', FIELD_ERROR_VI.usageLimit!],
  ['One or more product IDs are invalid for this shop.', FIELD_ERROR_VI.productIds!],
  ['Idempotency-Key must be a UUID.', FIELD_ERROR_VI.idempotencyKey!],
  ['If-Match must be a seller-promotion ETag.', FIELD_ERROR_VI.ifMatch!],
  ['Request body shape is invalid.', FIELD_ERROR_VI.request!],
  ['One or more promotion fields are invalid.', 'Một hoặc nhiều trường khuyến mãi chưa hợp lệ.'],
];

function translatePromotionDetail(detail: string | undefined): string | null {
  if (!detail) return null;
  for (const [english, vietnamese] of DETAIL_ERROR_VI) {
    if (detail.includes(english) || detail === english) return vietnamese;
  }
  return null;
}

export function promotionErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof RoleApiError) {
    const translatedDetail = translatePromotionDetail(cause.problem?.detail);
    if (translatedDetail) return translatedDetail;
    const fields = cause.problem?.invalidParameters ?? [];
    const fieldMessages = [...new Set(fields.map((field) => FIELD_ERROR_VI[field]).filter(Boolean))];
    if (fieldMessages.length) return fieldMessages.join(' ');
    if (cause.problem?.detail) return cause.problem.detail;
    if (fields.length) return `Thông tin chưa hợp lệ: ${fields.join(', ')}.`;
    return fallback;
  }
  return cause instanceof Error ? cause.message : fallback;
}

export function validateVoucherInput(input: SellerVoucherCreateRequest): string | null {
  if (!input.name.trim()) return FIELD_ERROR_VI.name!;
  if (!input.startsAt || !input.endsAt) return 'Chọn thời gian hợp lệ.';
  if (input.startsAt >= input.endsAt) return 'Thời gian bắt đầu phải trước thời gian kết thúc.';
  if (input.benefitType === 'FIXED_AMOUNT' && (!input.fixedAmountMinor || input.fixedAmountMinor < 1)) {
    return FIELD_ERROR_VI.fixedAmountMinor!;
  }
  if (
    input.benefitType === 'PERCENTAGE' &&
    (input.percentageBasisPoints === null ||
      input.percentageBasisPoints < 100 ||
      input.percentageBasisPoints > 9000)
  ) {
    return FIELD_ERROR_VI.percentageBasisPoints!;
  }
  if (input.usageLimit < 1) return FIELD_ERROR_VI.usageLimit!;
  if (input.perBuyerLimit < 1) return FIELD_ERROR_VI.perBuyerLimit!;
  return null;
}

export function sellerVoucherInputFromForm(form: SellerVoucherFormValues): SellerVoucherCreateRequest {
  return {
    name: form.name.trim(),
    benefitType: form.benefitType,
    fixedAmountMinor: form.benefitType === 'FIXED_AMOUNT' ? integerInputValue(form.value) : null,
    percentageBasisPoints: form.benefitType === 'PERCENTAGE' ? Number(form.value) * 100 : null,
    maximumDiscountMinor:
      form.benefitType === 'PERCENTAGE' && form.maximum ? integerInputValue(form.maximum) : null,
    minimumSpendMinor: integerInputValue(form.minimum),
    startsAt: iso(form.startsAt),
    endsAt: iso(form.endsAt, 'end'),
    usageLimit: integerInputValue(form.usage),
    perBuyerLimit: integerInputValue(form.perBuyer),
    productIds: form.products.split(',').map((id) => id.trim()).filter(Boolean),
  };
}

function ErrorBox({ error, retry }: { error: string | null; retry: () => void }) {
  return error ? (
    <div className="seller-promotion-error" role="alert">
      <span>{error}</span>
      <button type="button" onClick={retry}>
        Thử lại
      </button>
    </div>
  ) : null;
}

type VoucherTimeFilter = 'ALL' | 'THIS_MONTH' | 'LAST_3_MONTHS';

function voucherValueLabel(item: SellerVoucherSummary): string {
  if (item.benefitType === 'PERCENTAGE') {
    const percentage = (item.percentageBasisPoints ?? 0) / 100;
    const maximum = item.maximumDiscountMinor === null ? '' : ` (Tối đa ${money(item.maximumDiscountMinor)})`;
    return `${percentage}%${maximum}`;
  }
  return money(item.fixedAmountMinor);
}

function voucherBenefitLabel(item: SellerVoucherSummary): string {
  return item.benefitType === 'PERCENTAGE' ? 'Phần trăm' : 'Cố định';
}

function voucherDateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function compactCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace('.0', '')}k`;
  return String(value);
}

export function createVoucherForm() {
  return {
    name: '',
    benefitType: 'FIXED_AMOUNT' as 'FIXED_AMOUNT' | 'PERCENTAGE',
    value: '',
    maximum: '',
    minimum: '0',
    usage: '1',
    perBuyer: '1',
    startsAt: dateInput(0),
    endsAt: dateInput(7),
    products: '',
  };
}

export type SellerVoucherFormValues = ReturnType<typeof createVoucherForm>;

export function voucherFormFromSummary(item: SellerVoucherSummary): SellerVoucherFormValues {
  return {
    name: item.name,
    benefitType: item.benefitType,
    value:
      item.benefitType === 'PERCENTAGE'
        ? String((item.percentageBasisPoints ?? 0) / 100)
        : formatIntegerInput(String(item.fixedAmountMinor ?? '')),
    maximum:
      item.maximumDiscountMinor === null
        ? ''
        : formatIntegerInput(String(item.maximumDiscountMinor)),
    minimum: formatIntegerInput(String(item.minimumSpendMinor)),
    usage: formatIntegerInput(String(item.usageLimit)),
    perBuyer: formatIntegerInput(String(item.perBuyerLimit)),
    startsAt: dateInputValue(item.startsAt),
    endsAt: dateInputValue(item.endsAt),
    products: item.productIds.join(','),
  };
}

function voucherTimeMatches(item: SellerVoucherSummary, filter: VoucherTimeFilter): boolean {
  if (filter === 'ALL') return true;
  const createdAt = new Date(item.createdAt);
  if (Number.isNaN(createdAt.getTime())) return false;
  const now = new Date();
  if (filter === 'THIS_MONTH') {
    return createdAt.getFullYear() === now.getFullYear() && createdAt.getMonth() === now.getMonth();
  }
  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() - 3);
  return createdAt >= threshold;
}

function productPriceLabel(product: SellerProductSummary): string {
  const range = product.operationalPriceRange;
  if (!range || (range.minPriceMinor === null && range.maxPriceMinor === null)) return 'Chưa có giá';
  if (range.minPriceMinor === range.maxPriceMinor) return formatMoney(range.minPriceMinor);
  return `${formatMoney(range.minPriceMinor)} - ${formatMoney(range.maxPriceMinor)}`;
}

function VoucherKpiCard({ label, value, note, tone }: { label: string; value: string; note: string; tone: 'blue' | 'green' | 'amber' | 'violet' }) {
  return (
    <article className={`seller-voucher-kpi seller-voucher-kpi--${tone}`}>
      <div className="seller-voucher-kpi__top">
        <span>{label}</span>
        <span className="seller-voucher-kpi__icon" aria-hidden="true">
          {tone === 'blue' ? <Check size={15} /> : tone === 'green' ? <CalendarDays size={15} /> : tone === 'amber' ? <AlertTriangle size={15} /> : <Eye size={15} />}
        </span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function VoucherListView({
  vouchers,
  visibleVouchers,
  voucherCursor,
  promotionSearch,
  promotionSort,
  voucherState,
  voucherTimeFilter,
  saving,
  onSearch,
  onSort,
  onVoucherState,
  onTimeFilter,
  onCreate,
  onEdit,
  onPause,
  onResume,
  onDelete,
  onLoadMore,
}: {
  vouchers: SellerVoucherSummary[];
  visibleVouchers: SellerVoucherSummary[];
  voucherCursor: string | null;
  promotionSearch: string;
  promotionSort: PromotionSort;
  voucherState: string;
  voucherTimeFilter: VoucherTimeFilter;
  saving: boolean;
  onSearch: (value: string) => void;
  onSort: (value: PromotionSort) => void;
  onVoucherState: (value: string) => void;
  onTimeFilter: (value: VoucherTimeFilter) => void;
  onCreate: () => void;
  onEdit: (item: SellerVoucherSummary) => void;
  onPause: (item: SellerVoucherSummary) => void;
  onResume: (item: SellerVoucherSummary) => void;
  onDelete: (item: SellerVoucherSummary) => void;
  onLoadMore: () => void;
}) {
  const activeCount = vouchers.filter((item) => item.state === 'ACTIVE').length;
  const expiredCount = vouchers.filter((item) => item.state === 'EXPIRED').length;
  const usedCount = vouchers.reduce((total, item) => total + item.usedCount, 0);
  return (
    <div className="seller-voucher-dashboard">
      <div className="seller-voucher-breadcrumb" aria-label="Đường dẫn">
        <span>Dashboard</span><span aria-hidden="true">/</span><strong>Quản lý Voucher</strong>
      </div>
      <div className="seller-voucher-heading">
        <div>
          <h2>Quản lý Voucher</h2>
          <p>Theo dõi, tạo và tối ưu các chương trình ưu đãi cho shop.</p>
        </div>
        <button className="seller-voucher-primary-action" type="button" onClick={onCreate}>
          <Plus size={16} aria-hidden="true" /> Tạo voucher mới
        </button>
      </div>
      <div className="seller-voucher-kpis" aria-label="Tổng quan voucher">
        <VoucherKpiCard label="Tổng voucher" value={String(vouchers.length)} note="Đã tải từ hệ thống" tone="blue" />
        <VoucherKpiCard label="Đang hoạt động" value={String(activeCount)} note="Trong danh sách đã tải" tone="green" />
        <VoucherKpiCard label="Đã hết hạn" value={String(expiredCount)} note="Cần kiểm tra lại" tone="amber" />
        <VoucherKpiCard label="Đã sử dụng" value={compactCount(usedCount)} note="Tổng lượt đã dùng" tone="violet" />
      </div>
      <div className="seller-voucher-toolbar">
        <div className="seller-pl-search seller-promotions-search">
          <Search className="seller-pl-search__icon" size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Tìm kiếm voucher"
            placeholder="Tìm theo mã voucher hoặc tên chương trình..."
            value={promotionSearch}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
        <div className="seller-voucher-toolbar__controls">
          <div className="seller-pl-field">
            <label htmlFor="seller-voucher-status">Trạng thái</label>
            <div className="seller-pl-select-wrap">
              <select id="seller-voucher-status" className="seller-pl-select" aria-label="Trạng thái" value={voucherState} onChange={(event) => onVoucherState(event.target.value)}>
                <option value="ALL">Tất cả</option>
                <option value="ACTIVE">Đang chạy</option>
                <option value="SCHEDULED">Đã lên lịch</option>
                <option value="PAUSED">Tạm dừng</option>
                <option value="EXPIRED">Hết hạn</option>
              </select>
              <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
            </div>
          </div>
          <div className="seller-pl-field">
            <label htmlFor="seller-voucher-time">Thời gian</label>
            <div className="seller-pl-select-wrap seller-voucher-time-select">
              <select id="seller-voucher-time" className="seller-pl-select" value={voucherTimeFilter} onChange={(event) => onTimeFilter(event.target.value as VoucherTimeFilter)}>
                <option value="ALL">Tất cả thời gian</option>
                <option value="THIS_MONTH">Tháng này</option>
                <option value="LAST_3_MONTHS">3 tháng gần đây</option>
              </select>
              <CalendarDays className="seller-voucher-toolbar__calendar" size={15} aria-hidden="true" />
            </div>
          </div>
          <div className="seller-pl-field">
            <label htmlFor="seller-voucher-sort">Sắp xếp</label>
            <div className="seller-pl-select-wrap">
              <select id="seller-voucher-sort" className="seller-pl-select" value={promotionSort} onChange={(event) => onSort(event.target.value as PromotionSort)}>
                <option value="newest">Mới nhất</option>
                <option value="oldest">Cũ nhất</option>
                <option value="highest-value">Giá trị cao đến thấp</option>
                <option value="lowest-value">Giá trị thấp đến cao</option>
              </select>
              <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
      <div className="seller-voucher-table-card">
        <div className="seller-voucher-table-scroll">
          <table className="seller-voucher-table">
            <thead>
              <tr><th>Mã voucher</th><th>Tên chương trình</th><th>Loại giảm</th><th>Giá trị</th><th>Đã dùng / Tổng</th><th>Hạn sử dụng</th><th>Trạng thái</th><th>Hành động</th></tr>
            </thead>
            <tbody>
              {visibleVouchers.map((item) => {
                const usagePercent = item.usageLimit > 0 ? Math.min(100, Math.round((item.usedCount / item.usageLimit) * 100)) : 0;
                return (
                  <tr key={item.id}>
                    <td><Link className="seller-voucher-code" href={`/seller/promotions/vouchers/${item.id}`}>{item.code}</Link></td>
                    <td><span className="seller-voucher-name" title={item.name}>{item.name}</span></td>
                    <td><span className="seller-voucher-muted">{voucherBenefitLabel(item)}</span></td>
                    <td><strong>{voucherValueLabel(item)}</strong></td>
                    <td>
                      <div className="seller-voucher-usage"><span>{item.usedCount}/{item.usageLimit}</span><i><b style={{ width: `${usagePercent}%` }} /></i></div>
                    </td>
                    <td><span className="seller-voucher-expiry">Bắt đầu: {voucherDateLabel(item.startsAt)}<br />Kết thúc: {voucherDateLabel(item.endsAt)}</span></td>
                    <td><span className="seller-voucher-status" data-state={item.state}>{promotionStateLabel[item.state]}</span></td>
                    <td>
                      <div className="seller-voucher-row-actions">
                        <Link href={`/seller/promotions/vouchers/${item.id}`} aria-label={`Xem voucher ${item.code}`} title="Xem chi tiết"><Eye size={15} aria-hidden="true" /></Link>
                        <button type="button" aria-label={`Sửa voucher ${item.code}`} title="Sửa" onClick={() => onEdit(item)}><SquarePen size={15} aria-hidden="true" /></button>
                        {item.state === 'PAUSED' ? <button type="button" aria-label={`Tiếp tục voucher ${item.code}`} title="Tiếp tục" disabled={saving} onClick={() => onResume(item)}>▶</button> : null}
                        {['ACTIVE', 'SCHEDULED'].includes(item.state) ? <button type="button" aria-label={`Tạm dừng voucher ${item.code}`} title="Tạm dừng" disabled={saving} onClick={() => onPause(item)}>Ⅱ</button> : null}
                        {item.state === 'PAUSED' ? <button type="button" aria-label={`Xóa voucher ${item.code}`} title="Xóa" disabled={saving} onClick={() => onDelete(item)}><Trash2 size={15} aria-hidden="true" /></button> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visibleVouchers.length ? <p className="seller-voucher-empty">{vouchers.length ? 'Không tìm thấy voucher phù hợp.' : 'Chưa có voucher nào.'}</p> : null}
        </div>
        <footer className="seller-voucher-footer">
          <span>Hiển thị <strong>{visibleVouchers.length}</strong> trong <strong>{vouchers.length}</strong> voucher đã tải</span>
          <div className="seller-voucher-pagination">
            <button type="button" disabled aria-label="Trang trước">‹</button><button type="button" className="is-active">1</button>
            {voucherCursor ? <button type="button" onClick={onLoadMore}>Xem thêm</button> : <span>Đã tải hết danh sách</span>}
            <button type="button" disabled={!voucherCursor} aria-label="Trang sau">›</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function ProductPicker({
  selectedIds,
  onChange,
  fetcher,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  fetcher: AuthenticatedFetcher;
}) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<SellerProductSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items: SellerProductSummary[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | undefined;
      while (true) {
        const page = await fetchSellerProducts(fetcher, cursor ? { cursor } : {});
        items.push(...page.items);
        if (!page.nextCursor || seenCursors.has(page.nextCursor)) break;
        seenCursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      setProducts(items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải danh sách sản phẩm.');
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    if ((!open && !selectedIds.length) || products.length || loading) return;
    void Promise.resolve().then(() => loadProducts());
  }, [loadProducts, loading, open, products.length, selectedIds.length]);

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi-VN');
    if (!term) return products;
    return products.filter((product) => product.name.toLocaleLowerCase('vi-VN').includes(term));
  }, [products, search]);

  const toggleProduct = (productId: string) => {
    const next = new Set(selected);
    if (next.has(productId)) next.delete(productId);
    else next.add(productId);
    onChange([...next]);
  };

  return (
    <div className="seller-product-picker">
      <div className="seller-product-picker__summary">
        <div>
          <strong>{selectedIds.length ? `${selectedIds.length} sản phẩm đã chọn` : 'Tất cả sản phẩm'}</strong>
          <small>{selectedIds.length ? 'Voucher chỉ áp dụng cho các sản phẩm đã chọn.' : 'Không chọn sản phẩm thì voucher áp dụng cho mọi sản phẩm của shop.'}</small>
        </div>
        <button className="seller-product-picker__open" type="button" onClick={() => setOpen(true)}>
          {selectedIds.length ? 'Thay đổi sản phẩm' : 'Chọn sản phẩm'}
        </button>
      </div>
      {selectedIds.length ? (
        <div className="seller-product-picker__chips" aria-label="Sản phẩm đã chọn">
          {selectedIds.map((id) => {
            const product = products.find((item) => item.id === id);
            return <span key={id}>{product?.name ?? id}<button type="button" aria-label={`Bỏ sản phẩm ${product?.name ?? id}`} onClick={() => toggleProduct(id)}>×</button></span>;
          })}
        </div>
      ) : null}
      {open ? (
        <div className="seller-product-picker__overlay" role="presentation">
          <div className="seller-product-picker__dialog" role="dialog" aria-modal="true" aria-labelledby="seller-product-picker-title">
            <header className="seller-product-picker__header">
              <div>
                <span className="seller-voucher-detail__eyebrow">Phạm vi áp dụng</span>
                <h3 id="seller-product-picker-title">Chọn sản phẩm cho voucher</h3>
                <p>Có thể chọn nhiều sản phẩm. Bỏ chọn toàn bộ để áp dụng cho mọi sản phẩm.</p>
              </div>
              <button type="button" aria-label="Đóng danh sách sản phẩm" onClick={() => setOpen(false)}>×</button>
            </header>
            <div className="seller-product-picker__toolbar">
              <Search size={16} aria-hidden="true" />
              <input type="search" aria-label="Tìm sản phẩm" placeholder="Tìm theo tên sản phẩm..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            {loading ? <p className="seller-product-picker__state">Đang tải sản phẩm…</p> : null}
            {error ? <div className="seller-product-picker__state seller-product-picker__state--error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadProducts()}>Thử lại</button></div> : null}
            {!loading && !error ? (
              <div className="seller-product-picker__list">
                {visibleProducts.length ? visibleProducts.map((product) => (
                  <label className="seller-product-picker__item" key={product.id}>
                    <input aria-label={product.name} type="checkbox" checked={selected.has(product.id)} onChange={() => toggleProduct(product.id)} />
                    <Image src={sellerProductMediaUrl(product.primaryMediaUrl) || '/media/products/product-placeholder.svg'} alt="" width={42} height={42} unoptimized />
                    <span className="seller-product-picker__item-copy">
                      <strong>{product.name}</strong>
                      <small>{productPriceLabel(product)}</small>
                    </span>
                  </label>
                )) : <p className="seller-product-picker__state">Không tìm thấy sản phẩm phù hợp.</p>}
              </div>
            ) : null}
            <footer className="seller-product-picker__footer">
              <span>{selectedIds.length} sản phẩm được chọn</span>
              <button className="seller-product-picker__done" type="button" onClick={() => setOpen(false)}>Xong</button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type SellerVoucherFormDialogProps = {
  editingVoucher: SellerVoucherSummary | null;
  form: SellerVoucherFormValues;
  fetcher: AuthenticatedFetcher;
  saving: boolean;
  onChange: (form: SellerVoucherFormValues) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onClose: () => void;
};

export function SellerVoucherFormDialog({
  editingVoucher,
  form,
  fetcher,
  saving,
  onChange,
  onSubmit,
  onClose,
}: SellerVoucherFormDialogProps) {
  const patchForm = (patch: Partial<SellerVoucherFormValues>) => onChange({ ...form, ...patch });
  const selectedIds = form.products.split(',').map((id) => id.trim()).filter(Boolean);

  return (
    <div className="seller-voucher-form-overlay" role="presentation">
      <div className="seller-voucher-form-dialog" role="dialog" aria-modal="true" aria-labelledby="seller-voucher-form-title">
        <header className="seller-voucher-form-dialog__header">
          <div>
            <span className="seller-voucher-form-dialog__eyebrow">Voucher shop</span>
            <h2 id="seller-voucher-form-title">{editingVoucher ? 'Cập nhật voucher' : 'Tạo voucher mới'}</h2>
            <p>Thiết lập ưu đãi rõ ràng, dễ theo dõi và đồng bộ với dữ liệu shop.</p>
          </div>
          <button type="button" aria-label="Đóng form voucher" onClick={onClose} disabled={saving}>×</button>
        </header>
        <div className="seller-promotion-layout seller-voucher-form-layout">
          <form className="seller-promotion-form" onSubmit={onSubmit} noValidate>
            <section className="seller-promotion-form__section">
              <div className="seller-promotion-form__section-heading">
                <h3>Thông tin voucher</h3>
                <p>Mã voucher sẽ được hệ thống tạo tự động sau khi lưu.</p>
              </div>
              <div className="seller-promotion-form__field-grid">
                {editingVoucher ? (
                  <div className="seller-promotion-form__field seller-promotion-form__field--wide seller-voucher-code-readonly">
                    <span>Mã voucher</span>
                    <output aria-label="Mã voucher">{editingVoucher.code}</output>
                  </div>
                ) : null}
                <label className="seller-promotion-form__field seller-promotion-form__field--wide">
                  Tên
                  <input required value={form.name} onChange={(event) => patchForm({ name: event.target.value })} />
                </label>
                <div className="seller-pl-field seller-promotion-form__field">
                  <label htmlFor="seller-promotion-benefit-type">Loại ưu đãi</label>
                  <div className="seller-pl-select-wrap">
                    <select
                      id="seller-promotion-benefit-type"
                      className="seller-pl-select"
                      value={form.benefitType}
                      onChange={(event) => {
                        const benefitType = event.target.value as SellerVoucherFormValues['benefitType'];
                        onChange({
                          ...form,
                          benefitType,
                          value: benefitType === form.benefitType ? form.value : '',
                          maximum: benefitType === 'FIXED_AMOUNT' ? '' : form.maximum,
                        });
                      }}
                    >
                      <option value="FIXED_AMOUNT">Giảm số tiền</option>
                      <option value="PERCENTAGE">Giảm phần trăm</option>
                    </select>
                    <ChevronDown className="seller-pl-select__arrow" size={16} aria-hidden="true" />
                  </div>
                </div>
                <label className="seller-promotion-form__field">
                  <span className="seller-promotion-form__label-line">
                    <span>Mức giảm</span>
                    <small>({form.benefitType === 'PERCENTAGE' ? '%' : 'đ'})</small>
                  </span>
                  <input
                    required
                    aria-label="Mức giảm"
                    type={form.benefitType === 'PERCENTAGE' ? 'number' : 'text'}
                    inputMode="numeric"
                    min="1"
                    max={form.benefitType === 'PERCENTAGE' ? '90' : undefined}
                    value={form.value}
                    onChange={(event) => patchForm({ value: form.benefitType === 'PERCENTAGE' ? event.target.value : formatIntegerInput(event.target.value) })}
                  />
                </label>
                <label className="seller-promotion-form__field">
                  Mức giảm tối đa (tuỳ chọn)
                  <small>Số tiền tối đa voucher được áp dụng khi chọn giảm phần trăm.</small>
                  <input
                    type="text"
                    aria-label="Mức giảm tối đa"
                    inputMode="numeric"
                    min="1"
                    disabled={form.benefitType === 'FIXED_AMOUNT'}
                    value={form.maximum}
                    onChange={(event) => patchForm({ maximum: formatIntegerInput(event.target.value) })}
                  />
                </label>
              </div>
            </section>
            <section className="seller-promotion-form__section">
              <div className="seller-promotion-form__section-heading">
                <h3>Điều kiện áp dụng</h3>
                <p>Giới hạn giá trị đơn, lượt sử dụng và sản phẩm được áp dụng.</p>
              </div>
              <div className="seller-promotion-form__field-grid">
                <label className="seller-promotion-form__field">
                  Đơn tối thiểu
                  <input type="text" inputMode="numeric" min="0" value={form.minimum} onChange={(event) => patchForm({ minimum: formatIntegerInput(event.target.value) })} />
                </label>
                <label className="seller-promotion-form__field">
                  Giới hạn dùng
                  <input type="text" inputMode="numeric" min="1" value={form.usage} onChange={(event) => patchForm({ usage: formatIntegerInput(event.target.value) })} />
                </label>
                <label className="seller-promotion-form__field">
                  Mỗi buyer
                  <input type="text" inputMode="numeric" min="1" value={form.perBuyer} onChange={(event) => patchForm({ perBuyer: formatIntegerInput(event.target.value) })} />
                </label>
                <div className="seller-promotion-form__field seller-promotion-form__field--wide">
                  <span>Sản phẩm áp dụng <small>(tuỳ chọn)</small></span>
                  <ProductPicker fetcher={fetcher} selectedIds={selectedIds} onChange={(ids) => patchForm({ products: ids.join(',') })} />
                </div>
              </div>
            </section>
            <section className="seller-promotion-form__section">
              <div className="seller-promotion-form__section-heading">
                <h3>Ngày hiệu lực</h3>
                <p>Voucher chỉ được áp dụng trong khoảng ngày đã chọn.</p>
              </div>
              <div className="seller-promotion-form__field-grid">
                <div className="seller-promotion-datetime seller-promotion-form__field">
                  Bắt đầu
                  <DateTimeLocalPicker mode="date" aria-label="Bắt đầu" value={form.startsAt} onChange={(startsAt) => patchForm({ startsAt })} />
                </div>
                <div className="seller-promotion-datetime seller-promotion-form__field">
                  Kết thúc
                  <DateTimeLocalPicker mode="date" aria-label="Kết thúc" value={form.endsAt} onChange={(endsAt) => patchForm({ endsAt })} />
                </div>
              </div>
            </section>
            <div className="seller-promotion-form__actions">
              {editingVoucher ? (
                <button className="seller-promotion-secondary" type="button" onClick={onClose} disabled={saving}>Hủy sửa</button>
              ) : null}
              <button className="seller-promotion-primary" disabled={saving} type="submit">
                {saving ? 'Đang lưu…' : editingVoucher ? 'Lưu thay đổi' : 'Tạo voucher'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function SellerPromotionsManagement() {
  const auth = useAuthSession();
  const { toast } = useToast();
  const [vouchers, setVouchers] = useState<SellerVoucherSummary[]>([]);
  const [voucherState, setVoucherState] = useState('ALL');
  const [promotionSearch, setPromotionSearch] = useState('');
  const [promotionSort, setPromotionSort] = useState<PromotionSort>('newest');
  const [voucherTimeFilter, setVoucherTimeFilter] = useState<VoucherTimeFilter>('ALL');
  const [requestedVoucherEditId, setRequestedVoucherEditId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('edit');
  });
  const [voucherCursor, setVoucherCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    item: SellerVoucherSummary;
    action: SellerPromotionAction;
  } | null>(null);
  const [pendingVoucherDelete, setPendingVoucherDelete] = useState<SellerVoucherSummary | null>(null);
  const [editingVoucher, setEditingVoucher] = useState<SellerVoucherSummary | null>(null);
  const [voucherFormOpen, setVoucherFormOpen] = useState(false);
  const [voucherForm, setVoucherForm] = useState(createVoucherForm);

  const load = useCallback(async () => {
    if (auth.state.status !== 'authenticated') return;
    setLoading(true);
    setError(null);
    try {
      const voucherPage = await fetchSellerVouchers(auth.authenticatedFetch, { state: voucherState, limit: 20 });
      setVouchers(voucherPage.items);
      setVoucherCursor(voucherPage.nextCursor);
    } catch (cause) {
      setError(promotionErrorMessage(cause, 'Không thể tải khuyến mãi.'));
    } finally {
      setLoading(false);
    }
  }, [auth.authenticatedFetch, auth.state.status, voucherState]);
  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  useEffect(() => {
    if (!requestedVoucherEditId || loading || voucherFormOpen) return;
    const item = vouchers.find((candidate) => candidate.id === requestedVoucherEditId);
    if (!item) return;
    void Promise.resolve().then(() => {
      setEditingVoucher(item);
      setVoucherForm(voucherFormFromSummary(item));
      setVoucherFormOpen(true);
      setRequestedVoucherEditId(null);
      window.history.replaceState(null, '', '/seller/promotions');
    });
  }, [loading, requestedVoucherEditId, voucherFormOpen, vouchers]);

  const visibleVouchers = useMemo(() => {
    const term = promotionSearch.trim().toLocaleLowerCase('vi-VN');
    const filtered = vouchers.filter((item) => {
      if (!term) return true;
      return [item.code, item.name, ...item.productIds]
        .some((value) => value.toLocaleLowerCase('vi-VN').includes(term));
    }).filter((item) => voucherTimeMatches(item, voucherTimeFilter));
    return [...filtered].sort((left, right) => {
      if (promotionSort === 'highest-value' || promotionSort === 'lowest-value') {
        const difference = promotionValue(right) - promotionValue(left);
        return (promotionSort === 'highest-value' ? difference : -difference)
          || left.id.localeCompare(right.id);
      }
      const leftTime = Date.parse(left.createdAt);
      const rightTime = Date.parse(right.createdAt);
      return (promotionSort === 'newest' ? rightTime - leftTime : leftTime - rightTime)
        || left.id.localeCompare(right.id);
    });
  }, [promotionSearch, promotionSort, voucherTimeFilter, vouchers]);

  if (auth.state.status !== 'authenticated')
    return (
      <section className="operational-state">
        <h1>Khuyến mãi</h1>
        <p>Vui lòng đăng nhập tài khoản seller để quản lý khuyến mãi.</p>
      </section>
    );
  const submitVoucher = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input = sellerVoucherInputFromForm(voucherForm);
      const localError = validateVoucherInput(input);
      if (localError) {
        toast({
          title: editingVoucher ? 'Cập nhật voucher thất bại' : 'Tạo voucher thất bại',
          description: localError,
          variant: 'danger',
          duration: 5000,
        });
        return;
      }
      if (editingVoucher) {
        await updateSellerVoucher(
          auth.authenticatedFetch,
          editingVoucher.id,
          editingVoucher.version,
          input,
        );
        toast({
          title: 'Đã cập nhật voucher',
          description: 'Thông tin voucher đã được lưu thành công.',
          variant: 'success',
          duration: 5000,
        });
      } else {
        await createSellerVoucher(auth.authenticatedFetch, input);
        toast({
          title: 'Tạo voucher thành công',
          description: 'Voucher đã được tạo và mã được hệ thống sinh tự động.',
          variant: 'success',
          duration: 5000,
        });
      }
      await load();
      setEditingVoucher(null);
      setVoucherFormOpen(false);
      setVoucherForm((form) => ({ ...form, name: '', value: '' }));
    } catch (cause) {
      toast({
        title: editingVoucher ? 'Cập nhật voucher thất bại' : 'Tạo voucher thất bại',
        description: promotionErrorMessage(cause, 'Không thể tạo voucher.'),
        variant: 'danger',
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  };
  const actVoucher = async (item: SellerVoucherSummary, action: SellerPromotionAction) => {
    setError(null);
    setSaving(true);
    try {
      await actionSellerVoucher(auth.authenticatedFetch, item.id, item.version, action);
      await load();
    } catch (cause) {
      if (cause instanceof RoleApiError && cause.status === 412) void load();
      setError(promotionErrorMessage(cause, 'Không thể cập nhật voucher.'));
    } finally {
      setSaving(false);
    }
  };
  const removeVoucher = async (item: SellerVoucherSummary) => {
    setError(null);
    setSaving(true);
    try {
      await deleteSellerVoucher(auth.authenticatedFetch, item.id, item.version);
      if (editingVoucher?.id === item.id) {
        setEditingVoucher(null);
        setVoucherFormOpen(false);
      }
      await load();
    } catch (cause) {
      if (cause instanceof RoleApiError && cause.status === 412) void load();
      setError(promotionErrorMessage(cause, 'Không thể xóa voucher.'));
    } finally {
      setSaving(false);
    }
  };
  const confirmPendingAction = async () => {
    const pending = pendingAction;
    setPendingAction(null);
    if (!pending) return;
    await actVoucher(pending.item, pending.action);
  };
  const loadMoreVouchers = async () => {
    if (!voucherCursor) return;
    const page = await fetchSellerVouchers(auth.authenticatedFetch, {
      state: voucherState,
      limit: 20,
      cursor: voucherCursor,
    });
    setVouchers((items) => [...items, ...page.items]);
    setVoucherCursor(page.nextCursor);
  };
  const startVoucherEdit = (item: SellerVoucherSummary) => {
    setEditingVoucher(item);
    setVoucherFormOpen(true);
    setVoucherForm(voucherFormFromSummary(item));
  };
  const startVoucherCreate = () => {
    setEditingVoucher(null);
    setVoucherForm(createVoucherForm());
    setVoucherFormOpen(true);
  };
  const closeVoucherForm = () => {
    if (saving) return;
    setEditingVoucher(null);
    setVoucherFormOpen(false);
  };

  return (
    <section className="seller-promotions-page">
      <header className="seller-dashboard-heading">
        <div>
          <p className="seller-dashboard-eyebrow">SELLER CENTER</p>
          <h1>Khuyến mãi</h1>
          <p>Tạo và quản lý voucher shop. Giá cuối cùng luôn do server tính lại.</p>
        </div>
      </header>
      <ErrorBox error={error} retry={() => void load()} />
      {loading ? (
        <p className="seller-dashboard-state">Đang tải khuyến mãi…</p>
      ) : (
        <>
          <VoucherListView
            vouchers={vouchers}
            visibleVouchers={visibleVouchers}
            voucherCursor={voucherCursor}
            promotionSearch={promotionSearch}
            promotionSort={promotionSort}
            voucherState={voucherState}
            voucherTimeFilter={voucherTimeFilter}
            saving={saving}
            onSearch={setPromotionSearch}
            onSort={setPromotionSort}
            onVoucherState={setVoucherState}
            onTimeFilter={setVoucherTimeFilter}
            onCreate={startVoucherCreate}
            onEdit={startVoucherEdit}
            onPause={(item) => setPendingAction({ item, action: 'PAUSE' })}
            onResume={(item) => setPendingAction({ item, action: 'RESUME' })}
            onDelete={setPendingVoucherDelete}
            onLoadMore={() => void loadMoreVouchers()}
          />
          {voucherFormOpen ? (
            <SellerVoucherFormDialog
              editingVoucher={editingVoucher}
              form={voucherForm}
              fetcher={auth.authenticatedFetch}
              saving={saving}
              onChange={(form) => setVoucherForm(form)}
              onSubmit={submitVoucher}
              onClose={closeVoucherForm}
            />
          ) : null}
        </>
      )}
      {pendingAction && (
        <div className="seller-promotion-dialog-backdrop" role="presentation">
          <div
            className="seller-promotion-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="promotion-action-title"
          >
            <h2 id="promotion-action-title">Xác nhận thao tác</h2>
            <p>
              Bạn có chắc muốn{' '}
              {pendingAction.action === 'ARCHIVE'
                ? 'lưu trữ'
                : pendingAction.action === 'PAUSE'
                  ? 'tạm dừng'
                  : 'tiếp tục'}{' '}
              chương trình này?
            </p>
            <div className="seller-promotion-actions">
              <button type="button" onClick={() => setPendingAction(null)}>
                Hủy
              </button>
              <button
                className="seller-promotion-primary"
                type="button"
                disabled={saving}
                onClick={() => void confirmPendingAction()}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingVoucherDelete && (
        <div className="seller-promotion-dialog-backdrop" role="presentation">
          <div
            className="seller-promotion-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="voucher-delete-title"
          >
            <h2 id="voucher-delete-title">Xóa voucher?</h2>
            <p>
              Voucher <strong>{pendingVoucherDelete.code}</strong> đang tạm dừng và sẽ bị xóa vĩnh viễn.
              Thao tác này không thể hoàn tác.
            </p>
            <div className="seller-promotion-actions">
              <button type="button" onClick={() => setPendingVoucherDelete(null)}>
                Hủy
              </button>
              <button
                className="seller-promotion-primary"
                type="button"
                disabled={saving}
                onClick={() => {
                  const item = pendingVoucherDelete;
                  setPendingVoucherDelete(null);
                  void removeVoucher(item);
                }}
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

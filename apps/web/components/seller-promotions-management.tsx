'use client';

import type {
  SellerDiscountCreateRequest,
  SellerDiscountSummary,
  SellerPromotionAction,
  SellerVoucherCreateRequest,
  SellerVoucherSummary,
} from '@shopee-clone/contracts';
import { useToast } from '@shopee-clone/ui';
import { useCallback, useEffect, useState } from 'react';
import { DateTimeLocalPicker } from './datetime-local-picker';
import { useAuthSession } from './auth-session-provider';
import { RoleApiError } from '../lib/role-api';
import {
  actionSellerDiscount,
  actionSellerVoucher,
  createSellerDiscount,
  createSellerVoucher,
  deleteSellerVoucher,
  fetchSellerDiscounts,
  fetchSellerVouchers,
  updateSellerDiscount,
  updateSellerVoucher,
} from '../lib/seller-promotions-api';

const iso = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};
const dateInput = (days: number) => {
  const date = new Date(Date.now() + days * 86400000);
  return date.toISOString().slice(0, 16);
};
const money = (value: number | null) =>
  value === null ? '—' : `${new Intl.NumberFormat('vi-VN').format(value)} đ`;
const formatIntegerInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};
const integerInputValue = (value: string) => Number(value.replace(/\D/g, '') || 0);
const promotionStateLabel: Record<SellerVoucherSummary['state'] | SellerDiscountSummary['state'], string> = {
  SCHEDULED: 'Đã lên lịch',
  ACTIVE: 'Đang chạy',
  PAUSED: 'Tạm dừng',
  EXHAUSTED: 'Đã hết lượt',
  EXPIRED: 'Hết hạn',
  ARCHIVED: 'Đã lưu trữ',
};
const VOUCHER_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$/;
const VOUCHER_CODE_HINT =
  'Mã voucher phải từ 4–32 ký tự, chỉ gồm chữ in hoa, số và dấu gạch ngang (không bắt đầu/kết thúc bằng -).';
const FIELD_ERROR_VI: Record<string, string> = {
  code: VOUCHER_CODE_HINT,
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
  ['Voucher code must be 4-32 characters using A-Z, 0-9, and optional hyphens.', VOUCHER_CODE_HINT],
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

function promotionErrorMessage(cause: unknown, fallback: string): string {
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

function validateVoucherInput(input: SellerVoucherCreateRequest): string | null {
  if (!VOUCHER_CODE_PATTERN.test(input.code)) return VOUCHER_CODE_HINT;
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

export function SellerPromotionsManagement() {
  const auth = useAuthSession();
  const { toast } = useToast();
  const [tab, setTab] = useState<'vouchers' | 'discounts'>('vouchers');
  const [vouchers, setVouchers] = useState<SellerVoucherSummary[]>([]);
  const [discounts, setDiscounts] = useState<SellerDiscountSummary[]>([]);
  const [voucherState, setVoucherState] = useState('ALL');
  const [discountState, setDiscountState] = useState('ALL');
  const [voucherCursor, setVoucherCursor] = useState<string | null>(null);
  const [discountCursor, setDiscountCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    kind: 'voucher' | 'discount';
    item: SellerVoucherSummary | SellerDiscountSummary;
    action: SellerPromotionAction;
  } | null>(null);
  const [pendingVoucherDelete, setPendingVoucherDelete] = useState<SellerVoucherSummary | null>(null);
  const [editingVoucher, setEditingVoucher] = useState<SellerVoucherSummary | null>(null);
  const [editingDiscount, setEditingDiscount] = useState<SellerDiscountSummary | null>(null);
  const [voucherForm, setVoucherForm] = useState({
    code: '',
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
  });
  const [discountForm, setDiscountForm] = useState({
    name: '',
    startsAt: dateInput(0),
    endsAt: dateInput(7),
    products: '',
    rate: '10',
  });

  const load = useCallback(async () => {
    if (auth.state.status !== 'authenticated') return;
    setLoading(true);
    setError(null);
    try {
      const [voucherPage, discountPage] = await Promise.all([
        fetchSellerVouchers(auth.authenticatedFetch, { state: voucherState, limit: 20 }),
        fetchSellerDiscounts(auth.authenticatedFetch, { state: discountState, limit: 20 }),
      ]);
      setVouchers(voucherPage.items);
      setDiscounts(discountPage.items);
      setVoucherCursor(voucherPage.nextCursor);
      setDiscountCursor(discountPage.nextCursor);
    } catch (cause) {
      setError(promotionErrorMessage(cause, 'Không thể tải khuyến mãi.'));
    } finally {
      setLoading(false);
    }
  }, [auth.authenticatedFetch, auth.state.status, discountState, voucherState]);
  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

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
      const input: SellerVoucherCreateRequest = {
        code: voucherForm.code.trim().toUpperCase(),
        name: voucherForm.name.trim(),
        benefitType: voucherForm.benefitType,
        fixedAmountMinor:
          voucherForm.benefitType === 'FIXED_AMOUNT' ? integerInputValue(voucherForm.value) : null,
        percentageBasisPoints:
          voucherForm.benefitType === 'PERCENTAGE' ? Number(voucherForm.value) * 100 : null,
        maximumDiscountMinor:
          voucherForm.benefitType === 'PERCENTAGE' && voucherForm.maximum
            ? integerInputValue(voucherForm.maximum)
            : null,
        minimumSpendMinor: integerInputValue(voucherForm.minimum),
        startsAt: iso(voucherForm.startsAt),
        endsAt: iso(voucherForm.endsAt),
        usageLimit: integerInputValue(voucherForm.usage),
        perBuyerLimit: integerInputValue(voucherForm.perBuyer),
        productIds: voucherForm.products
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      };
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
          description: `Mã ${input.code} đã được lưu thành công.`,
          variant: 'success',
          duration: 5000,
        });
      } else {
        await createSellerVoucher(auth.authenticatedFetch, input);
        toast({
          title: 'Tạo voucher thành công',
          description: `Mã ${input.code} đã sẵn sàng trong danh sách khuyến mãi.`,
          variant: 'success',
          duration: 5000,
        });
      }
      await load();
      setEditingVoucher(null);
      setVoucherForm((form) => ({ ...form, code: '', name: '', value: '' }));
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
  const submitDiscount = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const productIds = discountForm.products
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      const input: SellerDiscountCreateRequest = {
        name: discountForm.name.trim(),
        startsAt: iso(discountForm.startsAt),
        endsAt: iso(discountForm.endsAt),
        products: productIds.map((productId) => ({
          productId,
          discountBasisPoints: Number(discountForm.rate) * 100,
        })),
      };
      if (!input.startsAt || !input.endsAt || productIds.length === 0)
        throw new Error('Nhập tên, thời gian và ít nhất một product ID.');
      if (editingDiscount)
        await updateSellerDiscount(
          auth.authenticatedFetch,
          editingDiscount.id,
          editingDiscount.version,
          input,
        );
      else await createSellerDiscount(auth.authenticatedFetch, input);
      await load();
      setEditingDiscount(null);
    } catch (cause) {
      if (cause instanceof RoleApiError && cause.status === 412) void load();
      setError(promotionErrorMessage(cause, 'Không thể tạo chương trình.'));
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
  const actDiscount = async (item: SellerDiscountSummary, action: SellerPromotionAction) => {
    setError(null);
    setSaving(true);
    try {
      await actionSellerDiscount(auth.authenticatedFetch, item.id, item.version, action);
      await load();
    } catch (cause) {
      setError(promotionErrorMessage(cause, 'Không thể cập nhật chương trình.'));
    } finally {
      setSaving(false);
    }
  };
  const removeVoucher = async (item: SellerVoucherSummary) => {
    setError(null);
    setSaving(true);
    try {
      await deleteSellerVoucher(auth.authenticatedFetch, item.id, item.version);
      if (editingVoucher?.id === item.id) setEditingVoucher(null);
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
    if (pending.kind === 'voucher')
      await actVoucher(pending.item as SellerVoucherSummary, pending.action);
    else await actDiscount(pending.item as SellerDiscountSummary, pending.action);
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
  const loadMoreDiscounts = async () => {
    if (!discountCursor) return;
    const page = await fetchSellerDiscounts(auth.authenticatedFetch, {
      state: discountState,
      limit: 20,
      cursor: discountCursor,
    });
    setDiscounts((items) => [...items, ...page.items]);
    setDiscountCursor(page.nextCursor);
  };
  const startVoucherEdit = (item: SellerVoucherSummary) => {
    setEditingVoucher(item);
    setVoucherForm({
      code: item.code,
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
      startsAt: item.startsAt.slice(0, 16),
      endsAt: item.endsAt.slice(0, 16),
      products: item.productIds.join(','),
    });
  };
  const startDiscountEdit = (item: SellerDiscountSummary) => {
    setEditingDiscount(item);
    setDiscountForm({
      name: item.name,
      startsAt: item.startsAt.slice(0, 16),
      endsAt: item.endsAt.slice(0, 16),
      products: item.products.map((product) => product.productId).join(','),
      rate: String(Math.round((item.products[0]?.discountBasisPoints ?? 100) / 100)),
    });
  };

  return (
    <section className="seller-promotions-page">
      <header className="seller-dashboard-heading">
        <div>
          <p className="seller-dashboard-eyebrow">SELLER CENTER</p>
          <h1>Khuyến mãi</h1>
          <p>Tạo voucher shop và lịch giảm giá sản phẩm. Giá cuối cùng luôn do server tính lại.</p>
        </div>
      </header>
      <div className="seller-promotion-tabs" role="tablist">
        <button
          className={tab === 'vouchers' ? 'is-active' : ''}
          type="button"
          onClick={() => setTab('vouchers')}
        >
          Voucher shop
        </button>
        <button
          className={tab === 'discounts' ? 'is-active' : ''}
          type="button"
          onClick={() => setTab('discounts')}
        >
          Giảm giá sản phẩm
        </button>
      </div>
      <div className="seller-promotion-filter">
        <label>
          Trạng thái
          <select
            value={tab === 'vouchers' ? voucherState : discountState}
            onChange={(event) =>
              tab === 'vouchers'
                ? setVoucherState(event.target.value)
                : setDiscountState(event.target.value)
            }
          >
            <option value="ALL">Tất cả</option>
            <option value="SCHEDULED">Đã lên lịch</option>
            <option value="ACTIVE">Đang chạy</option>
            <option value="PAUSED">Tạm dừng</option>
            <option value="EXPIRED">Hết hạn</option>
            {tab === 'discounts' && <option value="ARCHIVED">Đã lưu trữ</option>}
          </select>
        </label>
      </div>
      <ErrorBox error={error} retry={() => void load()} />
      {loading ? (
        <p className="seller-dashboard-state">Đang tải khuyến mãi…</p>
      ) : tab === 'vouchers' ? (
        <div className="seller-promotion-layout">
          <form className="seller-promotion-form" onSubmit={submitVoucher} noValidate>
            <h2>{editingVoucher ? 'Cập nhật voucher' : 'Tạo voucher cố định'}</h2>
            <label>
              Mã voucher
              <small>4–32 ký tự: chữ in hoa, số, dấu - (ví dụ SHOP10).</small>
              <input
                required
                aria-label="Mã voucher"
                value={voucherForm.code}
                onChange={(event) => setVoucherForm({ ...voucherForm, code: event.target.value })}
                placeholder="SHOP10"
                maxLength={32}
                aria-description={VOUCHER_CODE_HINT}
              />
            </label>
            <label>
              Tên
              <input
                required
                value={voucherForm.name}
                onChange={(event) => setVoucherForm({ ...voucherForm, name: event.target.value })}
              />
            </label>
            <label>
              Loại ưu đãi
              <select
                value={voucherForm.benefitType}
                onChange={(event) =>
                  setVoucherForm((form) => {
                    const benefitType = event.target.value as 'FIXED_AMOUNT' | 'PERCENTAGE';
                    return {
                      ...form,
                      benefitType,
                      value: benefitType === form.benefitType ? form.value : '',
                      maximum: benefitType === 'FIXED_AMOUNT' ? '' : form.maximum,
                    };
                  })
                }
              >
                <option value="FIXED_AMOUNT">Giảm số tiền</option>
                <option value="PERCENTAGE">Giảm phần trăm</option>
              </select>
            </label>
            <label>
              Mức giảm
              <small>
                {voucherForm.benefitType === 'PERCENTAGE'
                  ? 'Tỷ lệ giá trị đơn hàng voucher sẽ giảm.'
                  : 'Số tiền voucher sẽ giảm trực tiếp trên đơn hàng.'}
              </small>
              <input
                required
                aria-label="Mức giảm"
                type={voucherForm.benefitType === 'PERCENTAGE' ? 'number' : 'text'}
                inputMode="numeric"
                min="1"
                max={voucherForm.benefitType === 'PERCENTAGE' ? '90' : undefined}
                value={voucherForm.value}
                onChange={(event) =>
                  setVoucherForm({
                    ...voucherForm,
                    value:
                      voucherForm.benefitType === 'PERCENTAGE'
                        ? event.target.value
                        : formatIntegerInput(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Mức giảm tối đa (tuỳ chọn)
              <small>Số tiền tối đa voucher được áp dụng khi chọn giảm phần trăm.</small>
              <input
                type="text"
                aria-label="Mức giảm tối đa"
                inputMode="numeric"
                min="1"
                disabled={voucherForm.benefitType === 'FIXED_AMOUNT'}
                value={voucherForm.maximum}
                onChange={(event) =>
                  setVoucherForm({
                    ...voucherForm,
                    maximum: formatIntegerInput(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Đơn tối thiểu
              <input
                type="text"
                inputMode="numeric"
                min="0"
                value={voucherForm.minimum}
                onChange={(event) =>
                  setVoucherForm({
                    ...voucherForm,
                    minimum: formatIntegerInput(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Giới hạn dùng
              <input
                type="text"
                inputMode="numeric"
                min="1"
                value={voucherForm.usage}
                onChange={(event) =>
                  setVoucherForm({
                    ...voucherForm,
                    usage: formatIntegerInput(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Mỗi buyer
              <input
                type="text"
                inputMode="numeric"
                min="1"
                value={voucherForm.perBuyer}
                onChange={(event) =>
                  setVoucherForm({
                    ...voucherForm,
                    perBuyer: formatIntegerInput(event.target.value),
                  })
                }
              />
            </label>
            <div className="seller-promotion-datetime">
              Bắt đầu
              <DateTimeLocalPicker
                aria-label="Bắt đầu"
                value={voucherForm.startsAt}
                onChange={(startsAt) => setVoucherForm({ ...voucherForm, startsAt })}
              />
            </div>
            <div className="seller-promotion-datetime">
              Kết thúc
              <DateTimeLocalPicker
                aria-label="Kết thúc"
                value={voucherForm.endsAt}
                onChange={(endsAt) => setVoucherForm({ ...voucherForm, endsAt })}
              />
            </div>
            <label>
              Product IDs (tuỳ chọn, cách nhau bằng dấu phẩy)
              <input
                value={voucherForm.products}
                onChange={(event) =>
                  setVoucherForm({ ...voucherForm, products: event.target.value })
                }
              />
            </label>
            <button className="seller-promotion-primary" disabled={saving} type="submit">
              {saving ? 'Đang lưu…' : editingVoucher ? 'Lưu thay đổi' : 'Tạo voucher'}
            </button>
            {editingVoucher && (
              <button
                className="seller-promotion-secondary"
                type="button"
                onClick={() => setEditingVoucher(null)}
              >
                Hủy sửa
              </button>
            )}
          </form>
          <div className="seller-promotion-list">
            <h2>Voucher của shop</h2>
            {vouchers.length ? (
              vouchers.map((item) => (
                <article className="seller-promotion-card" key={item.id}>
                  <div>
                    <strong>{item.code}</strong>
                    <span>
                      {item.name} · {money(item.fixedAmountMinor)} · dùng {item.usedCount}/
                      {item.usageLimit}
                    </span>
                  </div>
                  <b data-state={item.state}>{promotionStateLabel[item.state]}</b>
                  <div className="seller-promotion-actions">
                    <button type="button" onClick={() => startVoucherEdit(item)}>
                      Sửa
                    </button>
                    {item.state === 'PAUSED' && (
                      <button
                        type="button"
                        onClick={() =>
                          setPendingAction({ kind: 'voucher', item, action: 'RESUME' })
                        }
                      >
                        Tiếp tục
                      </button>
                    )}
                    {['ACTIVE', 'SCHEDULED'].includes(item.state) && (
                      <button
                        type="button"
                        onClick={() => setPendingAction({ kind: 'voucher', item, action: 'PAUSE' })}
                      >
                        Tạm dừng
                      </button>
                    )}
                    {item.state === 'PAUSED' && (
                      <button
                        type="button"
                        onClick={() => setPendingVoucherDelete(item)}
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="seller-dashboard-empty">Chưa có voucher.</p>
            )}
            {voucherCursor && (
              <button
                className="seller-promotion-more"
                type="button"
                onClick={() => void loadMoreVouchers()}
              >
                Xem thêm
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="seller-promotion-layout">
          <form className="seller-promotion-form" onSubmit={submitDiscount}>
            <h2>{editingDiscount ? 'Cập nhật chương trình' : 'Tạo lịch giảm giá'}</h2>
            <label>
              Tên chương trình
              <input
                required
                value={discountForm.name}
                onChange={(event) => setDiscountForm({ ...discountForm, name: event.target.value })}
              />
            </label>
            <label>
              Tỷ lệ giảm (%)
              <input
                required
                type="number"
                min="1"
                max="90"
                value={discountForm.rate}
                onChange={(event) => setDiscountForm({ ...discountForm, rate: event.target.value })}
              />
            </label>
            <div className="seller-promotion-datetime">
              Bắt đầu
              <DateTimeLocalPicker
                aria-label="Bắt đầu"
                value={discountForm.startsAt}
                onChange={(startsAt) => setDiscountForm({ ...discountForm, startsAt })}
              />
            </div>
            <div className="seller-promotion-datetime">
              Kết thúc
              <DateTimeLocalPicker
                aria-label="Kết thúc"
                value={discountForm.endsAt}
                onChange={(endsAt) => setDiscountForm({ ...discountForm, endsAt })}
              />
            </div>
            <label>
              Product IDs (bắt buộc, cách nhau bằng dấu phẩy)
              <input
                required
                value={discountForm.products}
                onChange={(event) =>
                  setDiscountForm({ ...discountForm, products: event.target.value })
                }
              />
            </label>
            <button className="seller-promotion-primary" disabled={saving} type="submit">
              {saving ? 'Đang lưu…' : editingDiscount ? 'Lưu thay đổi' : 'Tạo chương trình'}
            </button>
            {editingDiscount && (
              <button
                className="seller-promotion-secondary"
                type="button"
                onClick={() => setEditingDiscount(null)}
              >
                Hủy sửa
              </button>
            )}
          </form>
          <div className="seller-promotion-list">
            <h2>Chương trình của shop</h2>
            {discounts.length ? (
              discounts.map((item) => (
                <article className="seller-promotion-card" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {item.products.length} sản phẩm · {item.startsAt.slice(0, 16)} →{' '}
                      {item.endsAt.slice(0, 16)}
                    </span>
                  </div>
                  <b data-state={item.state}>{promotionStateLabel[item.state]}</b>
                  <div className="seller-promotion-actions">
                    <button type="button" onClick={() => startDiscountEdit(item)}>
                      Sửa
                    </button>
                    {item.state === 'PAUSED' && (
                      <button
                        type="button"
                        onClick={() =>
                          setPendingAction({ kind: 'discount', item, action: 'RESUME' })
                        }
                      >
                        Tiếp tục
                      </button>
                    )}
                    {['ACTIVE', 'SCHEDULED'].includes(item.state) && (
                      <button
                        type="button"
                        onClick={() =>
                          setPendingAction({ kind: 'discount', item, action: 'PAUSE' })
                        }
                      >
                        Tạm dừng
                      </button>
                    )}
                    {item.state !== 'ARCHIVED' && (
                      <button
                        type="button"
                        onClick={() =>
                          setPendingAction({ kind: 'discount', item, action: 'ARCHIVE' })
                        }
                      >
                        Lưu trữ
                      </button>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="seller-dashboard-empty">Chưa có chương trình giảm giá.</p>
            )}
            {discountCursor && (
              <button
                className="seller-promotion-more"
                type="button"
                onClick={() => void loadMoreDiscounts()}
              >
                Xem thêm
              </button>
            )}
          </div>
        </div>
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

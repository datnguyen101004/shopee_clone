'use client';

import type { SellerPromotionAction, SellerVoucherSummary } from '@shopee-clone/contracts';
import { CalendarDays, Check, SquarePen, Trash2, useToast } from '@shopee-clone/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { CSSProperties } from 'react';
import { useAuthSession } from './auth-session-provider';
import {
  createVoucherForm,
  promotionErrorMessage,
  SellerVoucherFormDialog,
  sellerVoucherInputFromForm,
  validateVoucherInput,
  voucherFormFromSummary,
} from './seller-promotions-management';
import type { SellerVoucherFormValues } from './seller-promotions-management';
import { RoleApiError } from '../lib/role-api';
import {
  actionSellerVoucher,
  deleteSellerVoucher,
  fetchSellerVoucher,
  updateSellerVoucher,
} from '../lib/seller-promotions-api';

const stateLabel: Record<SellerVoucherSummary['state'], string> = {
  SCHEDULED: 'Đã lên lịch',
  ACTIVE: 'Đang chạy',
  PAUSED: 'Tạm dừng',
  EXHAUSTED: 'Đã hết lượt',
  EXPIRED: 'Hết hạn',
};

const money = (value: number | null) =>
  value === null ? '—' : `${new Intl.NumberFormat('vi-VN').format(value)} đ`;

const dateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
};

const dateOnly = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

function detailError(cause: unknown, fallback: string) {
  if (cause instanceof RoleApiError && cause.problem?.detail) return cause.problem.detail;
  return cause instanceof Error ? cause.message : fallback;
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="seller-voucher-detail__field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function StatusBadge({ state }: { state: SellerVoucherSummary['state'] }) {
  return (
    <span className="seller-voucher-status" data-state={state}>
      {stateLabel[state]}
    </span>
  );
}

export function SellerVoucherDetail({ voucherId }: { voucherId: string }) {
  const auth = useAuthSession();
  const { toast } = useToast();
  const router = useRouter();
  const [voucher, setVoucher] = useState<SellerVoucherSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<SellerVoucherFormValues>(() => createVoucherForm());

  const load = useCallback(async () => {
    if (auth.state.status !== 'authenticated') return;
    setLoading(true);
    setError(null);
    try {
      setVoucher(await fetchSellerVoucher(auth.authenticatedFetch, voucherId));
    } catch (cause) {
      setError(detailError(cause, 'Không thể tải chi tiết voucher.'));
    } finally {
      setLoading(false);
    }
  }, [auth.authenticatedFetch, auth.state.status, voucherId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const usagePercent = useMemo(() => {
    if (!voucher || voucher.usageLimit <= 0) return 0;
    return Math.min(100, Math.round((voucher.usedCount / voucher.usageLimit) * 100));
  }, [voucher]);

  const runAction = async (action: SellerPromotionAction) => {
    if (!voucher || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await actionSellerVoucher(auth.authenticatedFetch, voucher.id, voucher.version, action);
      setVoucher(result.value);
    } catch (cause) {
      if (cause instanceof RoleApiError && cause.status === 412) await load();
      setError(detailError(cause, 'Không thể cập nhật voucher.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!voucher || saving || voucher.state !== 'PAUSED') return;
    if (!window.confirm(`Xóa vĩnh viễn voucher ${voucher.code}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteSellerVoucher(auth.authenticatedFetch, voucher.id, voucher.version);
      router.push('/seller/promotions');
    } catch (cause) {
      if (cause instanceof RoleApiError && cause.status === 412) await load();
      setError(detailError(cause, 'Không thể xóa voucher.'));
      setSaving(false);
    }
  };

  const openEdit = () => {
    if (!voucher || saving) return;
    setEditForm(voucherFormFromSummary(voucher));
    setEditOpen(true);
    setError(null);
  };

  const closeEdit = () => {
    if (saving) return;
    setEditOpen(false);
  };

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!voucher || saving) return;
    setSaving(true);
    setError(null);
    try {
      const input = sellerVoucherInputFromForm(editForm);
      const localError = validateVoucherInput(input);
      if (localError) {
        toast({ title: 'Cập nhật voucher thất bại', description: localError, variant: 'danger', duration: 5000 });
        return;
      }
      const result = await updateSellerVoucher(auth.authenticatedFetch, voucher.id, voucher.version, input);
      setVoucher(result.value);
      setEditOpen(false);
      toast({ title: 'Đã cập nhật voucher', description: 'Thông tin voucher đã được lưu thành công.', variant: 'success', duration: 5000 });
    } catch (cause) {
      toast({ title: 'Cập nhật voucher thất bại', description: promotionErrorMessage(cause, 'Không thể cập nhật voucher.'), variant: 'danger', duration: 5000 });
    } finally {
      setSaving(false);
    }
  };

  if (auth.state.status !== 'authenticated') {
    return (
      <section className="operational-state">
        <h1>Chi tiết Voucher</h1>
        <p>Vui lòng đăng nhập tài khoản seller để xem voucher.</p>
      </section>
    );
  }

  if (loading) return <p className="seller-dashboard-state">Đang tải chi tiết voucher…</p>;
  if (error || !voucher) {
    return (
      <section className="seller-voucher-detail seller-voucher-detail--error" role="alert">
        <p>{error ?? 'Không tìm thấy voucher.'}</p>
        <button type="button" onClick={() => void load()}>Thử lại</button>
        <Link href="/seller/promotions">Quay lại danh sách</Link>
      </section>
    );
  }

  const isPausable = voucher.state === 'ACTIVE' || voucher.state === 'SCHEDULED';
  const isResumable = voucher.state === 'PAUSED';
  const benefit = voucher.benefitType === 'PERCENTAGE'
    ? `${(voucher.percentageBasisPoints ?? 0) / 100}%${voucher.maximumDiscountMinor === null ? '' : ` (tối đa ${money(voucher.maximumDiscountMinor)})`}`
    : money(voucher.fixedAmountMinor);

  return (
    <section className="seller-voucher-detail">
      <div className="seller-voucher-detail__breadcrumb" aria-label="Đường dẫn">
        <Link href="/seller/promotions">Quản lý Voucher</Link>
        <span aria-hidden="true">/</span>
        <strong>Chi tiết Voucher</strong>
      </div>
      <header className="seller-voucher-detail__heading">
        <div>
          <Link className="seller-voucher-detail__back" href="/seller/promotions">
            ← Quay lại danh sách
          </Link>
          <div className="seller-voucher-detail__title-row">
            <h2>Chi tiết Voucher: {voucher.code}</h2>
            <StatusBadge state={voucher.state} />
          </div>
          <p>Thông tin cấu hình, tiến độ sử dụng và trạng thái vận hành của voucher.</p>
        </div>
      </header>
      {error ? <p className="seller-voucher-detail__inline-error" role="alert">{error}</p> : null}
      <div className="seller-voucher-detail__layout">
        <article className="seller-voucher-detail__card seller-voucher-detail__card--info">
          <div className="seller-voucher-detail__card-heading">
            <div>
              <span className="seller-voucher-detail__eyebrow">Thiết lập voucher</span>
              <h3>Thông tin Voucher</h3>
            </div>
            <Check size={17} aria-hidden="true" />
          </div>
          <dl className="seller-voucher-detail__fields">
            <DetailField label="Tên chương trình" value={voucher.name} />
            <DetailField label="Mã voucher" value={voucher.code} />
            <DetailField label="Loại giảm giá" value={voucher.benefitType === 'PERCENTAGE' ? 'Giảm theo phần trăm (%)' : 'Giảm số tiền cố định'} />
            <DetailField label="Mức giảm" value={benefit} />
            <DetailField label="Giá trị đơn hàng tối thiểu" value={money(voucher.minimumSpendMinor)} />
            <DetailField label="Giới hạn lượt sử dụng" value={`${voucher.usageLimit.toLocaleString('vi-VN')} lượt (mỗi khách tối đa ${voucher.perBuyerLimit})`} />
            <DetailField label="Thời gian áp dụng" value={`${dateTime(voucher.startsAt)} – ${dateTime(voucher.endsAt)}`} />
            <DetailField label="Kênh áp dụng" value={voucher.productIds.length ? `${voucher.productIds.length} sản phẩm đã chọn` : 'Tất cả sản phẩm của shop'} />
            <DetailField label="Cập nhật gần nhất" value={dateTime(voucher.updatedAt)} />
          </dl>
        </article>
        <div className="seller-voucher-detail__right-column">
          <article className="seller-voucher-detail__card seller-voucher-detail__card--usage">
            <div className="seller-voucher-detail__card-heading">
              <div>
                <span className="seller-voucher-detail__eyebrow">Hiệu suất</span>
                <h3>Tiến độ sử dụng</h3>
              </div>
              <CalendarDays size={17} aria-hidden="true" />
            </div>
            <div className="seller-voucher-detail__donut" style={{ '--usage': `${usagePercent * 3.6}deg` } as CSSProperties}>
              <div><strong>{usagePercent}%</strong><span>đã dùng</span></div>
            </div>
            <p className="seller-voucher-detail__usage-count"><strong>{voucher.usedCount.toLocaleString('vi-VN')}</strong> / {voucher.usageLimit.toLocaleString('vi-VN')} lượt áp dụng</p>
            <p className="seller-voucher-detail__muted">Còn lại {(Math.max(0, voucher.usageLimit - voucher.usedCount)).toLocaleString('vi-VN')} lượt.</p>
          </article>
          <article className="seller-voucher-detail__card seller-voucher-detail__card--chart">
            <div className="seller-voucher-detail__card-heading">
              <div>
                <span className="seller-voucher-detail__eyebrow">Theo dõi</span>
                <h3>Hiệu quả sử dụng</h3>
              </div>
              <CalendarDays size={17} aria-hidden="true" />
            </div>
            <div className="seller-voucher-detail__chart-placeholder">
              <span>Biểu đồ theo ngày</span>
              <strong>{voucher.usedCount.toLocaleString('vi-VN')} lượt đã dùng</strong>
              <small>Lịch sử chi tiết chưa được API cung cấp.</small>
            </div>
          </article>
          <article className="seller-voucher-detail__card seller-voucher-detail__card--history">
            <div className="seller-voucher-detail__card-heading">
              <div>
                <span className="seller-voucher-detail__eyebrow">Gần đây</span>
                <h3>Lịch sử khách hàng sử dụng</h3>
              </div>
            </div>
            <div className="seller-voucher-detail__history-empty">API hiện chỉ trả tổng lượt sử dụng; chưa có dữ liệu đơn hàng và khách hàng chi tiết.</div>
          </article>
        </div>
      </div>
      <p className="seller-voucher-detail__meta">Hiệu lực: {dateOnly(voucher.startsAt)} – {dateOnly(voucher.endsAt)} · Phiên bản {voucher.version}</p>
      <div className="seller-voucher-detail__footer-actions">
        <button className="seller-voucher-detail__button seller-voucher-detail__button--primary" type="button" disabled={saving} onClick={openEdit}>
          <SquarePen size={15} aria-hidden="true" /> Chỉnh sửa thông tin
        </button>
        {isPausable ? (
          <button className="seller-voucher-detail__button seller-voucher-detail__button--secondary" type="button" disabled={saving} onClick={() => void runAction('PAUSE')}>
            Ⅱ Tạm dừng phát hành
          </button>
        ) : null}
        {isResumable ? (
          <button className="seller-voucher-detail__button seller-voucher-detail__button--secondary" type="button" disabled={saving} onClick={() => void runAction('RESUME')}>
            ▶ Tiếp tục phát hành
          </button>
        ) : null}
        {voucher.state === 'PAUSED' ? (
          <button className="seller-voucher-detail__button seller-voucher-detail__button--danger" type="button" disabled={saving} onClick={() => void remove()}>
            <Trash2 size={15} aria-hidden="true" /> Xóa voucher
          </button>
        ) : null}
      </div>
      {editOpen ? (
        <SellerVoucherFormDialog
          editingVoucher={voucher}
          form={editForm}
          fetcher={auth.authenticatedFetch}
          saving={saving}
          onChange={setEditForm}
          onSubmit={submitEdit}
          onClose={closeEdit}
        />
      ) : null}
    </section>
  );
}

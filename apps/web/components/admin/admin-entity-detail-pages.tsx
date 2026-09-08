'use client';

import type {
  AdminProductDetail,
  AdminShopSummary,
  AdminUserSummary,
  CampaignAdminParticipantPage,
  CampaignAdminSummary,
} from '@shopee-clone/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { AdminEntityLink } from './admin-entity-link';
import { CheckIcon, LockIcon, UnlockIcon, XIcon } from './admin-icons';
import { useAuthSession } from '../auth-session-provider';
import {
  adminErrorMessage,
  applyAdminProductAction,
  executeAdminShopAction,
  fetchAdminShop,
  fetchAdminUser,
  lookupAdminProduct,
} from '../../lib/admin-api';
import {
  cancelAdminCampaign,
  fetchAdminCampaign,
  fetchAdminCampaignParticipantDetails,
  publishAdminCampaign,
} from '../../lib/campaigns-api';
import { AdminPagination } from './admin-pagination';

function DetailState({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading)
    return (
      <section className="admin-state-card" role="status">
        Đang tải chi tiết…
      </section>
    );
  if (error)
    return (
      <section className="admin-state-card admin-state-card--error" role="alert">
        {error}
      </section>
    );
  return null;
}

type AdminLockAction = 'SUSPEND' | 'RESTORE';

function AdminDetailLockButton({
  entityLabel,
  entityName,
  action,
  onClick,
  disabled,
}: {
  entityLabel: 'cửa hàng' | 'sản phẩm';
  entityName: string;
  action: AdminLockAction;
  onClick: () => void;
  disabled?: boolean;
}) {
  const isSuspending = action === 'SUSPEND';
  const actionLabel = isSuspending ? 'Khóa' : 'Mở khóa';
  return (
    <button
      type="button"
      className={`admin-btn admin-btn-action ${isSuspending ? 'admin-btn-action--danger' : 'admin-btn-action--success'}`}
      aria-label={`${actionLabel} ${entityLabel} ${entityName}`}
      title={`${actionLabel} ${entityLabel}`}
      onClick={onClick}
      disabled={disabled}
    >
      {isSuspending ? <LockIcon aria-hidden="true" /> : <UnlockIcon aria-hidden="true" />}
      {actionLabel} {entityLabel}
    </button>
  );
}

function AdminDetailLockDialog({
  entityLabel,
  entityName,
  action,
  reason,
  actionError,
  submitting,
  onReasonChange,
  onClose,
  onSubmit,
}: {
  entityLabel: 'cửa hàng' | 'sản phẩm';
  entityName: string;
  action: AdminLockAction;
  reason: string;
  actionError: string | null;
  submitting: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isSuspending = action === 'SUSPEND';
  const subject = entityLabel === 'cửa hàng' ? 'shop' : 'sản phẩm';
  const title = `${isSuspending ? 'Tạm khóa' : 'Mở khóa'} ${subject}: ${entityName}`;
  const titleId = `admin-${entityLabel === 'cửa hàng' ? 'shop' : 'product'}-detail-action-title`;

  return (
    <div className="admin-dialog-backdrop" role="presentation">
      <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        <p>
          {entityLabel === 'cửa hàng'
            ? isSuspending
              ? 'Khi khóa shop, toàn bộ sản phẩm và trang storefront của shop sẽ bị ẩn khỏi người mua.'
              : 'Khôi phục shop về trạng thái hoạt động bình thường.'
            : isSuspending
              ? 'Khi khóa sản phẩm, sản phẩm sẽ bị ẩn khỏi người mua.'
              : 'Khôi phục sản phẩm về trạng thái hoạt động bình thường.'}
        </p>
        {entityLabel === 'cửa hàng' ? (
          <p role="note">
            Với shop seller đã duyệt, thao tác này cập nhật đồng thời tài khoản sở hữu và shop;
            khôi phục không tự mở lại các phiên đã bị thu hồi.
          </p>
        ) : null}
        <form
          className="admin-dialog__form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label className="admin-field" htmlFor={`${titleId}-reason`}>
            <span>Lý do (8–240 ký tự)</span>
            <textarea
              id={`${titleId}-reason`}
              className="admin-control"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              minLength={8}
              maxLength={240}
              rows={4}
              required
            />
          </label>
          {actionError ? (
            <p className="admin-inline-error" role="alert">
              {actionError}
            </p>
          ) : null}
          <div className="admin-dialog__actions">
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              className={`admin-btn ${isSuspending ? 'admin-btn-danger' : 'admin-btn-primary'}`}
              disabled={submitting}
            >
              {submitting ? 'Đang xử lý…' : 'Xác nhận'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

type AdminCampaignAction = 'PUBLISH' | 'CANCEL';

function AdminCampaignActionButton({
  title,
  action,
  onClick,
  disabled,
}: {
  title: string;
  action: AdminCampaignAction;
  onClick: () => void;
  disabled?: boolean;
}) {
  const isPublishing = action === 'PUBLISH';
  const label = isPublishing ? 'Đăng chiến dịch' : 'Hủy chiến dịch';
  return (
    <button
      type="button"
      className={`admin-btn admin-btn-action ${isPublishing ? 'admin-btn-action--success' : 'admin-btn-action--danger'}`}
      aria-label={`${label} ${title}`}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {isPublishing ? <CheckIcon aria-hidden="true" /> : <XIcon aria-hidden="true" />}
      {label}
    </button>
  );
}

function AdminCampaignActionDialog({
  title,
  action,
  reason,
  actionError,
  submitting,
  onReasonChange,
  onClose,
  onSubmit,
}: {
  title: string;
  action: AdminCampaignAction;
  reason: string;
  actionError: string | null;
  submitting: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const isPublishing = action === 'PUBLISH';
  const titleId = 'admin-campaign-detail-action-title';
  const dialogRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const submittingRef = useRef(submitting);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const getFocusable = () => Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    getFocusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submittingRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  return (
    <div className="admin-dialog-backdrop" role="presentation">
      <section ref={dialogRef} className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="admin-dialog__header">
          <div>
            <h2 id={titleId}>{isPublishing ? 'Đăng chiến dịch' : 'Hủy chiến dịch'}</h2>
            <p>{title}</p>
          </div>
          <button
            type="button"
            className="admin-dialog__close"
            aria-label="Đóng xác nhận chiến dịch"
            onClick={onClose}
            disabled={submitting}
          >
            ×
          </button>
        </div>
        <form
          className="admin-dialog__form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <p>
            {isPublishing
              ? 'Sau khi đăng, loại chiến dịch và chính sách áp dụng sẽ được khóa.'
              : 'Chiến dịch sẽ được hủy và các đăng ký liên quan sẽ được dừng.'}
          </p>
          {!isPublishing ? (
            <label className="admin-field" htmlFor="admin-campaign-detail-cancel-reason">
              <span>Lý do (tối đa 240 ký tự)</span>
              <textarea
                id="admin-campaign-detail-cancel-reason"
                className="admin-control"
                value={reason}
                onChange={(event) => onReasonChange(event.target.value)}
                maxLength={240}
                rows={4}
                required
              />
            </label>
          ) : null}
          {actionError ? (
            <p className="admin-inline-error" role="alert">
              {actionError}
            </p>
          ) : null}
          <div className="admin-dialog__actions">
            <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose} disabled={submitting}>
              Hủy
            </button>
            <button
              type="submit"
              className={`admin-btn ${isPublishing ? 'admin-btn-primary' : 'admin-btn-danger'}`}
              disabled={submitting}
            >
              {submitting ? 'Đang xử lý…' : 'Xác nhận'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AdminDetailShell({
  title,
  backHref,
  children,
}: {
  title: string;
  backHref: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-page admin-entity-detail-page">
      <Link className="admin-detail-back" href={backHref}>
        ← Về danh sách quản lý
      </Link>
      <section className="admin-detail-panel">
        <header className="admin-detail-header">
          <h2>{title}</h2>
        </header>
        {children}
      </section>
    </div>
  );
}

function useAdminDetail<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const value = await loader();
      setData(value);
      return value;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết');
      return null;
    } finally {
      setLoading(false);
    }
  }, [loader]);

  const update = useCallback((updater: (current: T | null) => T | null) => {
    setData(updater);
  }, []);

  useEffect(() => {
    let active = true;
    void loader()
      .then((value) => {
        if (active) {
          setData(value);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Không thể tải chi tiết');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [loader]);
  return { data, loading, error, reload, update };
}

export function AdminUserDetailPage({ userId }: { userId: string }) {
  const { authenticatedFetch } = useAuthSession();
  const load = useCallback(
    () => fetchAdminUser(authenticatedFetch, userId),
    [authenticatedFetch, userId],
  );
  const result = useAdminDetail<AdminUserSummary>(load);
  return (
    <AdminDetailShell
      title={result.data?.displayName ?? 'Chi tiết người dùng'}
      backHref="/admin/users"
    >
      <DetailState loading={result.loading} error={result.error} />
      {result.data ? (
        <div className="admin-entity-detail__content">
          <AdminEntityLink
            href={`/admin/users/${result.data.id}`}
            name={result.data.displayName}
            imageUrl={result.data.avatarUrl}
            meta={result.data.email}
          />
          <dl className="admin-detail-facts">
            <div>
              <dt>Vai trò</dt>
              <dd>{result.data.roles.join(', ')}</dd>
            </div>
            <div>
              <dt>Trạng thái</dt>
              <dd>{result.data.status === 'ACTIVE' ? 'Hoạt động' : 'Tạm khóa'}</dd>
            </div>
            <div>
              <dt>Số điện thoại</dt>
              <dd>{result.data.phoneNumber ?? 'Chưa cập nhật'}</dd>
            </div>
            <div>
              <dt>Ngày tạo</dt>
              <dd>{new Date(result.data.createdAt).toLocaleDateString('vi-VN')}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </AdminDetailShell>
  );
}

export function AdminShopDetailPage({ shopId }: { shopId: string }) {
  const { authenticatedFetch } = useAuthSession();
  const load = useCallback(
    () => fetchAdminShop(authenticatedFetch, shopId),
    [authenticatedFetch, shopId],
  );
  const result = useAdminDetail<AdminShopSummary>(load);
  const [action, setAction] = useState<AdminLockAction | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetAction = () => {
    setAction(null);
    setReason('');
    setActionError(null);
    setSubmitting(false);
  };

  const closeAction = () => {
    if (submitting) return;
    resetAction();
  };

  const openAction = () => {
    if (!result.data || result.data.onboardingStatus !== 'APPROVED') return;
    setAction(result.data.status === 'ACTIVE' ? 'SUSPEND' : 'RESTORE');
    setReason('');
    setActionError(null);
  };

  const handleAction = async () => {
    if (!result.data || !action || submitting) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 8 || trimmedReason.length > 240) {
      setActionError('Lý do phải có từ 8 đến 240 ký tự');
      return;
    }

    setSubmitting(true);
    setActionError(null);
    try {
      const updated = await executeAdminShopAction(authenticatedFetch, result.data.id, {
        action,
        reason: trimmedReason,
      });
      result.update(() => updated);
      resetAction();
      void result.reload();
    } catch (cause: unknown) {
      setActionError(adminErrorMessage(cause, 'Thao tác thất bại'));
      setSubmitting(false);
    }
  };

  return (
    <AdminDetailShell
      title={result.data?.name ?? 'Chi tiết cửa hàng'}
      backHref="/admin/shops"
    >
      <DetailState loading={result.loading} error={result.error} />
      {result.data ? (
        <div className="admin-entity-detail__content">
          <AdminEntityLink
            href={`/admin/shops/${result.data.id}`}
            name={result.data.name}
            imageUrl={result.data.logoUrl}
            meta={`/${result.data.slug}`}
          />
          <dl className="admin-detail-facts">
            <div>
              <dt>Trạng thái bán</dt>
              <dd>{result.data.status}</dd>
            </div>
            <div>
              <dt>Trạng thái xét duyệt</dt>
              <dd>{result.data.onboardingStatus}</dd>
            </div>
            <div>
              <dt>Ngày cập nhật</dt>
              <dd>{new Date(result.data.updatedAt).toLocaleDateString('vi-VN')}</dd>
            </div>
          </dl>
          {result.data.onboardingStatus === 'APPROVED' ? (
            <div className="admin-detail-actions" aria-label="Thao tác cửa hàng">
              <AdminDetailLockButton
                entityLabel="cửa hàng"
                entityName={result.data.name}
                action={result.data.status === 'ACTIVE' ? 'SUSPEND' : 'RESTORE'}
                onClick={openAction}
                disabled={submitting || result.loading}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {result.data && action ? (
        <AdminDetailLockDialog
          entityLabel="cửa hàng"
          entityName={result.data.name}
          action={action}
          reason={reason}
          actionError={actionError}
          submitting={submitting}
          onReasonChange={setReason}
          onClose={closeAction}
          onSubmit={() => void handleAction()}
        />
      ) : null}
    </AdminDetailShell>
  );
}

export function AdminProductDetailPage({ productId }: { productId: string }) {
  const { authenticatedFetch } = useAuthSession();
  const load = useCallback(
    () => lookupAdminProduct(authenticatedFetch, { id: productId }),
    [authenticatedFetch, productId],
  );
  const result = useAdminDetail<{ product: AdminProductDetail | null }>(load);
  const product = result.data?.product;
  const [action, setAction] = useState<AdminLockAction | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetAction = () => {
    setAction(null);
    setReason('');
    setActionError(null);
    setSubmitting(false);
  };

  const closeAction = () => {
    if (submitting) return;
    resetAction();
  };

  const openAction = () => {
    if (!product) return;
    setAction(product.moderationStatus === 'ACTIVE' ? 'SUSPEND' : 'RESTORE');
    setReason('');
    setActionError(null);
  };

  const handleAction = async () => {
    if (!product || !action || submitting) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 8 || trimmedReason.length > 240) {
      setActionError('Lý do phải có từ 8 đến 240 ký tự');
      return;
    }

    setSubmitting(true);
    setActionError(null);
    try {
      const updated = await applyAdminProductAction(authenticatedFetch, product.id, {
        action,
        reason: trimmedReason,
      });
      result.update((current) =>
        current?.product
          ? {
              ...current,
              product: {
                ...current.product,
                moderationStatus: updated.moderationStatus,
                updatedAt: updated.updatedAt,
              },
            }
          : current,
      );
      resetAction();
      void result.reload();
    } catch (cause: unknown) {
      setActionError(adminErrorMessage(cause, 'Thao tác thất bại'));
      setSubmitting(false);
    }
  };

  return (
    <AdminDetailShell
      title={product?.name ?? 'Chi tiết sản phẩm'}
      backHref="/admin/products"
    >
      <DetailState loading={result.loading} error={result.error} />
      {product ? (
        <div className="admin-entity-detail__content">
          <AdminEntityLink
            href={`/admin/products/${product.id}`}
            name={product.name}
            imageUrl={product.images[0]?.url}
            meta={product.slug}
          />
          <div className="admin-detail-linked-entities">
            <AdminEntityLink
              href={`/admin/shops/${product.shopId}`}
              name={product.shopName}
              meta={product.shopSlug}
            />
            <AdminEntityLink
              href={`/admin/categories#admin-category-${product.categoryId}`}
              name={product.categoryName}
              meta={product.categorySlug}
            />
          </div>
          <dl className="admin-detail-facts">
            <div>
              <dt>Trạng thái</dt>
              <dd>{product.status}</dd>
            </div>
            <div>
              <dt>Kiểm duyệt</dt>
              <dd>{product.moderationStatus}</dd>
            </div>
            <div>
              <dt>Đã bán</dt>
              <dd>{product.soldCount.toLocaleString('vi-VN')}</dd>
            </div>
          </dl>
          <div className="admin-detail-actions" aria-label="Thao tác sản phẩm">
            <AdminDetailLockButton
              entityLabel="sản phẩm"
              entityName={product.name}
              action={product.moderationStatus === 'ACTIVE' ? 'SUSPEND' : 'RESTORE'}
              onClick={openAction}
              disabled={submitting || result.loading}
            />
          </div>
        </div>
      ) : null}
      {product && action ? (
        <AdminDetailLockDialog
          entityLabel="sản phẩm"
          entityName={product.name}
          action={action}
          reason={reason}
          actionError={actionError}
          submitting={submitting}
          onReasonChange={setReason}
          onClose={closeAction}
          onSubmit={() => void handleAction()}
        />
      ) : null}
    </AdminDetailShell>
  );
}

const participantStateLabels: Record<string, string> = {
  UNRESPONDED: 'Chưa phản hồi',
  JOINED: 'Đã tham gia',
  DECLINED: 'Đã từ chối',
  WITHDRAWN: 'Đã rút lui',
  LOCKED: 'Đã chốt',
};

const formatParticipantMoney = (value: number | null) =>
  value === null ? '—' : `₫${new Intl.NumberFormat('vi-VN').format(value)}`;

function AdminCampaignParticipants({
  data,
  loading,
  error,
  onRetry,
  onPageChange,
}: {
  data: CampaignAdminParticipantPage | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onPageChange: (page: number) => void;
}) {
  const groupedParticipants = data?.items.reduce(
    (groups, participant) => {
      const existing = groups.get(participant.participationId);
      if (existing) {
        existing.products.push(...participant.products);
      } else {
        groups.set(participant.participationId, { ...participant, products: [...participant.products] });
      }
      return groups;
    },
    new Map<string, CampaignAdminParticipantPage['items'][number]>(),
  );
  const visibleParticipants = groupedParticipants ? [...groupedParticipants.values()] : [];

  return (
    <section className="admin-campaign-participants" aria-labelledby="admin-campaign-participants-title">
      <div className="admin-campaign-participants__heading">
        <div>
          <h3 id="admin-campaign-participants-title">Shop và sản phẩm tham gia</h3>
        </div>
        {data ? <span className="admin-badge">{data.totalItems} mục tham gia</span> : null}
      </div>
      {loading ? <p className="admin-state-card" role="status">Đang tải danh sách tham gia…</p> : null}
      {error ? (
        <div className="admin-state-card admin-state-card--error" role="alert">
          <span>{error}</span>
          <button type="button" className="admin-btn admin-btn-secondary" onClick={onRetry}>Thử lại</button>
        </div>
      ) : null}
      {!loading && !error && visibleParticipants.length === 0 ? (
        <p className="admin-state-card">Chưa có sản phẩm/SKU nào được đăng ký.</p>
      ) : null}
      {!loading && !error && visibleParticipants.length ? (
        <div className="admin-campaign-participants__list">
          {visibleParticipants.map((participant) => (
            <article
              className="admin-campaign-participant"
              key={`${participant.participationId}-${participant.products[0]?.variantId ?? participant.products[0]?.productId ?? 'empty'}`}
            >
              <header className="admin-campaign-participant__header">
                <div>
                  <Link href={`/admin/shops/${participant.shopId}`} className="admin-campaign-participant__shop">
                    {participant.shopName}
                  </Link>
                </div>
                <div className="admin-campaign-participant__meta">
                  <span className="admin-badge">{participantStateLabels[participant.state] ?? participant.state}</span>
                  <span>{participant.products.length} sản phẩm/SKU</span>
                  {participant.respondedAt ? <span>Phản hồi {new Date(participant.respondedAt).toLocaleDateString('vi-VN')}</span> : null}
                </div>
              </header>
              {participant.products.length ? (
                <div className="admin-table-scroll">
                  <table className="admin-data-table admin-management-table admin-campaign-participant-table">
                    <thead>
                      <tr>
                        <th scope="col" className="management-table-id-cell">ID</th>
                        <th scope="col">Sản phẩm / SKU</th>
                        <th scope="col">Giá gốc đăng ký</th>
                        <th scope="col">Giá chiến dịch</th>
                        <th scope="col">Quota chiến dịch</th>
                        <th scope="col">Còn lại</th>
                        <th scope="col">Tồn kho khả dụng</th>
                        <th scope="col">Mức giảm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participant.products.map((product) => (
                        <tr key={`${participant.participationId}-${product.variantId ?? product.productId}`}>
                          <td className="management-table-id-cell">{product.id}</td>
                          <td>
                            <Link href={`/admin/products/${product.productId}`} className="admin-campaign-participant__product">
                              <strong>{product.productName}</strong>
                              {product.variantName ? <span>{product.variantName}</span> : null}
                              {product.options.length ? <small>{product.options.join(' · ')}</small> : null}
                              {product.sku ? <small>SKU: {product.sku}</small> : null}
                            </Link>
                          </td>
                          <td>{formatParticipantMoney(product.regularPriceMinor)}</td>
                          <td>{formatParticipantMoney(product.salePriceMinor)}</td>
                          <td>{product.allocatedQuantity === null ? '—' : product.allocatedQuantity.toLocaleString('vi-VN')}</td>
                          <td>{product.remainingQuantity === null ? '—' : product.remainingQuantity.toLocaleString('vi-VN')}</td>
                          <td>{product.physicalInventoryAvailable === null ? '—' : product.physicalInventoryAvailable.toLocaleString('vi-VN')}</td>
                          <td>{product.discountBasisPoints === null ? '—' : `Giảm ${product.discountBasisPoints / 100}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="admin-campaign-participant__empty">Shop chưa đăng ký sản phẩm hoặc SKU.</p>
              )}
            </article>
          ))}
        </div>
      ) : null}
      {data && data.totalPages > 1 ? (
        <AdminPagination
          itemLabel="mục đăng ký"
          page={data.page}
          totalItems={data.totalItems}
          totalPages={data.totalPages}
          disabled={loading}
          onPageChange={onPageChange}
        />
      ) : null}
    </section>
  );
}

export function AdminCampaignDetailPage({ campaignId }: { campaignId: string }) {
  const { authenticatedFetch } = useAuthSession();
  const load = useCallback(
    () => fetchAdminCampaign(authenticatedFetch, campaignId),
    [authenticatedFetch, campaignId],
  );
  const result = useAdminDetail<CampaignAdminSummary>(load);
  const [participantPage, setParticipantPage] = useState(1);
  const [participantData, setParticipantData] = useState<CampaignAdminParticipantPage | null>(null);
  const [participantLoading, setParticipantLoading] = useState(true);
  const [participantError, setParticipantError] = useState<string | null>(null);
  const loadParticipants = useCallback(
    async (page: number) => fetchAdminCampaignParticipantDetails(authenticatedFetch, campaignId, page),
    [authenticatedFetch, campaignId],
  );
  useEffect(() => {
    let active = true;
    void loadParticipants(participantPage)
      .then((value) => {
        if (!active) return;
        setParticipantData(value);
        setParticipantLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setParticipantError(cause instanceof Error ? cause.message : 'Không thể tải danh sách tham gia');
        setParticipantLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadParticipants, participantPage]);
  const [action, setAction] = useState<AdminCampaignAction | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetAction = () => {
    setAction(null);
    setReason('');
    setActionError(null);
    setSubmitting(false);
  };

  const closeAction = () => {
    if (submitting) return;
    resetAction();
  };

  const openAction = (nextAction: AdminCampaignAction) => {
    if (!result.data) return;
    const lifecycle = result.data.lifecycle;
    if (nextAction === 'PUBLISH' && lifecycle !== 'DRAFT') return;
    if (nextAction === 'CANCEL' && (lifecycle === 'CANCELLED' || lifecycle === 'ENDED')) return;
    setAction(nextAction);
    setReason('');
    setActionError(null);
  };

  const handleAction = async () => {
    if (!result.data || !action || submitting) return;
    const trimmedReason = reason.trim();
    if (action === 'CANCEL' && (!trimmedReason || trimmedReason.length > 240)) {
      setActionError('Lý do không được để trống và tối đa 240 ký tự');
      return;
    }

    setSubmitting(true);
    setActionError(null);
    try {
      const updated = action === 'PUBLISH'
        ? await publishAdminCampaign(authenticatedFetch, result.data.id, result.data.version)
        : await cancelAdminCampaign(authenticatedFetch, result.data.id, result.data.version, trimmedReason);
      result.update(() => updated);
      resetAction();
      void result.reload();
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : 'Thao tác thất bại');
      setSubmitting(false);
    }
  };

  const canPublish = result.data?.lifecycle === 'DRAFT';
  const canCancel = result.data
    ? result.data.lifecycle !== 'CANCELLED' && result.data.lifecycle !== 'ENDED'
    : false;
  return (
    <AdminDetailShell
      title={result.data?.title ?? 'Chi tiết chiến dịch'}
      backHref="/admin/campaigns"
    >
      <DetailState loading={result.loading} error={result.error} />
      {result.data ? (
        <div className="admin-entity-detail__content">
          <AdminEntityLink
            href={`/admin/campaigns/${campaignId}`}
            name={result.data.title}
            meta={`${result.data.type.displayName} · ${result.data.lifecycle}`}
          />
          <dl className="admin-detail-facts">
            <div>
              <dt>Sản phẩm</dt>
              <dd>{result.data.productCount}</dd>
            </div>
            <div>
              <dt>Seller tham gia</dt>
              <dd>{result.data.sellerJoinedCount}</dd>
            </div>
            <div>
              <dt>Bắt đầu</dt>
              <dd>{new Date(result.data.startsAt).toLocaleString('vi-VN')}</dd>
            </div>
            <div>
              <dt>Kết thúc</dt>
              <dd>{new Date(result.data.endsAt).toLocaleString('vi-VN')}</dd>
            </div>
          </dl>
          <AdminCampaignParticipants
            data={participantData}
            loading={participantLoading}
            error={participantError}
            onRetry={() => {
              setParticipantError(null);
              setParticipantLoading(true);
              void loadParticipants(participantPage)
                .then((value) => {
                  setParticipantData(value);
                  setParticipantLoading(false);
                })
                .catch((cause: unknown) => {
                  setParticipantError(cause instanceof Error ? cause.message : 'Không thể tải danh sách tham gia');
                  setParticipantLoading(false);
                });
            }}
            onPageChange={(page) => {
              setParticipantError(null);
              setParticipantLoading(true);
              setParticipantPage(page);
            }}
          />
          {canPublish || canCancel ? (
            <div className="admin-detail-actions" aria-label="Thao tác chiến dịch">
              {canPublish ? (
                <AdminCampaignActionButton
                  title={result.data.title}
                  action="PUBLISH"
                  onClick={() => openAction('PUBLISH')}
                  disabled={submitting || result.loading}
                />
              ) : null}
              {canCancel ? (
                <AdminCampaignActionButton
                  title={result.data.title}
                  action="CANCEL"
                  onClick={() => openAction('CANCEL')}
                  disabled={submitting || result.loading}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {result.data && action ? (
        <AdminCampaignActionDialog
          title={result.data.title}
          action={action}
          reason={reason}
          actionError={actionError}
          submitting={submitting}
          onReasonChange={setReason}
          onClose={closeAction}
          onSubmit={() => void handleAction()}
        />
      ) : null}
    </AdminDetailShell>
  );
}

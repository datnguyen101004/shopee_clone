'use client';

import type { AdminProductListItem, AdminProductListQuery } from '@shopee-clone/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  EyeIcon,
  LockIcon,
  ProductIcon,
  UnlockIcon,
} from '../../../../components/admin/admin-icons';
import { AdminEntityLink } from '../../../../components/admin/admin-entity-link';
import { useAuthSession } from '../../../../components/auth-session-provider';
import {
  adminErrorMessage,
  applyAdminProductAction,
  fetchAdminProducts,
} from '../../../../lib/admin-api';

type ProductFilters = {
  q: string;
  moderationStatus: NonNullable<AdminProductListQuery['moderationStatus']> | '';
};

const STATUS_LABELS: Record<AdminProductListItem['status'], string> = {
  DRAFT: 'Bản nháp',
  ACTIVE: 'Đang bán',
  HIDDEN: 'Đang ẩn',
  ARCHIVED: 'Đã lưu trữ',
};

function formatVnd(amount: number | null, maxAmount = amount): string {
  if (amount === null || maxAmount === null) return 'Chưa có giá';
  const formatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
  const min = formatter.format(amount);
  return amount === maxAmount ? min : `${min} – ${formatter.format(maxAmount)}`;
}

export default function AdminProductsPage() {
  const { authenticatedFetch } = useAuthSession();
  const [draftQuery, setDraftQuery] = useState('');
  const [draftModerationStatus, setDraftModerationStatus] =
    useState<ProductFilters['moderationStatus']>('');
  const [filters, setFilters] = useState<ProductFilters>({ q: '', moderationStatus: '' });
  const [products, setProducts] = useState<AdminProductListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modalProduct, setModalProduct] = useState<AdminProductListItem | null>(null);
  const [modalAction, setModalAction] = useState<'SUSPEND' | 'RESTORE' | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadProducts = useCallback(
    async (nextFilters: ProductFilters, cursor?: string, append = false) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const response = await fetchAdminProducts(authenticatedFetch, {
          limit: 20,
          cursor,
          q: nextFilters.q || undefined,
          status: 'ACTIVE',
          moderationStatus: nextFilters.moderationStatus || undefined,
        });
        setProducts((current) => (append ? [...current, ...response.items] : response.items));
        setNextCursor(response.nextCursor);
      } catch (error: unknown) {
        setErrorMessage(adminErrorMessage(error, 'Không thể tải danh sách sản phẩm'));
        if (!append) setProducts([]);
      } finally {
        setLoading(false);
      }
    },
    [authenticatedFetch],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProducts(filters), 0);
    return () => window.clearTimeout(timer);
  }, [filters, loadProducts]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters({ q: draftQuery.trim(), moderationStatus: draftModerationStatus });
  };

  const handleModerationFilterChange = (value: ProductFilters['moderationStatus']) => {
    setDraftModerationStatus(value);
    setFilters({ q: draftQuery.trim(), moderationStatus: value });
  };

  const openAction = (product: AdminProductListItem) => {
    setModalProduct(product);
    setModalAction(product.moderationStatus === 'ACTIVE' ? 'SUSPEND' : 'RESTORE');
    setReason('');
    setActionError(null);
  };

  const closeAction = () => {
    if (submitting) return;
    setModalProduct(null);
    setModalAction(null);
    setReason('');
    setActionError(null);
  };

  const handleAction = async () => {
    if (!modalProduct || !modalAction) return;
    if (reason.trim().length < 8) {
      setActionError('Lý do phải có ít nhất 8 ký tự.');
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const result = await applyAdminProductAction(authenticatedFetch, modalProduct.id, {
        action: modalAction,
        reason: reason.trim(),
      });
      setProducts((current) =>
        current.map((item) =>
          item.id === modalProduct.id
            ? { ...item, moderationStatus: result.moderationStatus }
            : item,
        ),
      );
      closeAction();
    } catch (error: unknown) {
      setActionError(adminErrorMessage(error, 'Không thể cập nhật trạng thái sản phẩm'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-page admin-products-page">
      <form
        className="admin-toolbar admin-products-list-toolbar"
        onSubmit={handleSearch}
        role="search"
      >
        <div className="admin-toolbar__filters admin-products-list-toolbar__filters">
          <div className="admin-field admin-products-list-toolbar__search">
            <label htmlFor="admin-product-search">Tìm sản phẩm</label>
            <input
              id="admin-product-search"
              className="admin-control"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="Tên, slug, gian hàng hoặc danh mục"
            />
          </div>
          <div className="admin-field">
            <label htmlFor="admin-product-moderation">Kiểm duyệt</label>
            <select
              id="admin-product-moderation"
              className="admin-control"
              value={draftModerationStatus}
              onChange={(event) =>
                handleModerationFilterChange(
                  event.target.value as ProductFilters['moderationStatus'],
                )
              }
            >
              <option value="">Tất cả</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="SUSPENDED">Đã tạm khóa</option>
            </select>
          </div>
        </div>
      </form>

      {errorMessage ? (
        <div className="admin-state-card admin-state-card--error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <section
        className="admin-table-card admin-products-list-card"
        aria-label="Danh sách sản phẩm đang hoạt động"
      >
        <div className="admin-table-card__header">
          <div>
            <h2>Sản phẩm đang hoạt động</h2>
            <p>
              {filters.q
                ? `Kết quả cho “${filters.q}”`
                : 'Danh sách sản phẩm đang hoạt động trên toàn sàn'}
            </p>
          </div>
          <span className="admin-table-card__count">Đã tải {products.length} sản phẩm</span>
        </div>
        {loading && products.length === 0 ? (
          <div className="admin-state-card__message" role="status">
            Đang tải danh sách sản phẩm…
          </div>
        ) : null}
        {!loading && products.length === 0 ? (
          <div className="admin-state-card__message" role="status">
            Không có sản phẩm nào phù hợp bộ lọc.
          </div>
        ) : null}
        {products.length > 0 ? (
          <div className="admin-table-scroll">
            <table className="admin-data-table admin-products-list-table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Gian hàng</th>
                  <th>Danh mục</th>
                  <th>Giá / tồn kho</th>
                  <th>Trạng thái</th>
                  <th className="admin-table-cell--actions">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <AdminEntityLink
                        href={`/admin/products/${product.id}`}
                        name={product.name}
                        imageUrl={product.primaryImageUrl}
                        meta={product.slug}
                        fallbackIcon={<ProductIcon size={22} color="#94a3b8" />}
                      />
                    </td>
                    <td>
                      <AdminEntityLink
                        href={product.shopId ? `/admin/shops/${product.shopId}` : '/admin/shops'}
                        name={product.shopName}
                        meta={product.shopSlug}
                      />
                    </td>
                    <td>
                      <AdminEntityLink
                        href={
                          product.categoryId
                            ? `/admin/categories#admin-category-${product.categoryId}`
                            : '/admin/categories'
                        }
                        name={product.categoryName}
                        meta={product.categorySlug}
                      />
                    </td>
                    <td>
                      <span>{formatVnd(product.minPrice, product.maxPrice)}</span>
                      <small className="admin-table-subtext">
                        {product.stockQuantity} tồn · {product.variantCount} phân loại
                      </small>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${product.moderationStatus === 'ACTIVE' ? 'admin-badge--success' : 'admin-badge--danger'}`}
                      >
                        {product.moderationStatus === 'ACTIVE' ? 'Đang hoạt động' : 'Đã tạm khóa'}
                      </span>
                      <small className="admin-table-subtext">
                        {STATUS_LABELS[product.status]} · {product.soldCount} đã bán
                      </small>
                    </td>
                    <td className="admin-table-cell--actions">
                      <div className="admin-table-actions">
                        <Link
                          href={`/admin/products/${product.id}`}
                          className="admin-icon-btn admin-icon-btn--secondary"
                          aria-label={`Xem sản phẩm ${product.name}`}
                          title="Xem sản phẩm"
                        >
                          <EyeIcon aria-hidden="true" />
                        </Link>
                        <button
                          type="button"
                          className={`admin-icon-btn ${product.moderationStatus === 'ACTIVE' ? 'admin-icon-btn--danger' : 'admin-icon-btn--success'}`}
                          aria-label={`${product.moderationStatus === 'ACTIVE' ? 'Khóa' : 'Mở khóa'} sản phẩm ${product.name}`}
                          title={
                            product.moderationStatus === 'ACTIVE'
                              ? 'Khóa sản phẩm'
                              : 'Mở khóa sản phẩm'
                          }
                          onClick={() => openAction(product)}
                        >
                          {product.moderationStatus === 'ACTIVE' ? (
                            <LockIcon aria-hidden="true" />
                          ) : (
                            <UnlockIcon aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <footer className="admin-list-footer">
          <span>Hiển thị {products.length} sản phẩm đã tải</span>
          {nextCursor ? (
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => void loadProducts(filters, nextCursor, true)}
              disabled={loading}
            >
              {loading ? 'Đang tải…' : 'Tải thêm sản phẩm'}
            </button>
          ) : (
            <span>Đã hiển thị hết kết quả</span>
          )}
        </footer>
      </section>

      {modalProduct && modalAction ? (
        <div className="admin-dialog-backdrop" role="presentation">
          <section
            className="admin-dialog admin-product-action-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-product-action-title"
          >
            <h2 id="admin-product-action-title">
              {modalAction === 'SUSPEND' ? 'Khóa sản phẩm' : 'Mở khóa sản phẩm'}
            </h2>
            <p>
              Sản phẩm: <strong>{modalProduct.name}</strong>
            </p>
            <label className="admin-field" htmlFor="admin-product-action-reason">
              <span>Lý do (8–240 ký tự)</span>
              <textarea
                id="admin-product-action-reason"
                className="admin-control"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={8}
                maxLength={240}
                rows={4}
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
                onClick={closeAction}
                disabled={submitting}
              >
                Hủy
              </button>
              <button
                type="button"
                className={`admin-btn ${modalAction === 'SUSPEND' ? 'admin-btn-danger' : 'admin-btn-primary'}`}
                onClick={() => void handleAction()}
                disabled={submitting}
              >
                {submitting ? 'Đang lưu…' : 'Xác nhận'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

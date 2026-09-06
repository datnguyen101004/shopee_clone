'use client';

import type {
  AdminProductDetail,
  AdminShopSummary,
  AdminUserSummary,
  CampaignAdminSummary,
} from '@shopee-clone/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { AdminEntityLink } from './admin-entity-link';
import { useAuthSession } from '../auth-session-provider';
import { fetchAdminShop, fetchAdminUser, lookupAdminProduct } from '../../lib/admin-api';
import { fetchAdminCampaign } from '../../lib/campaigns-api';

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
  return { data, loading, error };
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
  return (
    <AdminDetailShell title={result.data?.name ?? 'Chi tiết cửa hàng'} backHref="/admin/shops">
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
        </div>
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
  return (
    <AdminDetailShell title={product?.name ?? 'Chi tiết sản phẩm'} backHref="/admin/products">
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
        </div>
      ) : null}
    </AdminDetailShell>
  );
}

export function AdminCampaignDetailPage({ campaignId }: { campaignId: string }) {
  const { authenticatedFetch } = useAuthSession();
  const load = useCallback(
    () => fetchAdminCampaign(authenticatedFetch, campaignId),
    [authenticatedFetch, campaignId],
  );
  const result = useAdminDetail<CampaignAdminSummary>(load);
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
        </div>
      ) : null}
    </AdminDetailShell>
  );
}

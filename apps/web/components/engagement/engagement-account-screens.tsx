'use client';

import {
  buyerDisplayProductPriceMinor,
  type CatalogProductCard,
  type FavoritePage,
  type RecentlyViewedPage,
} from '@shopee-clone/contracts';
import { Card } from '@shopee-clone/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { getFavorites, getRecentlyViewed, setFavorite } from '../../lib/engagement-api';
import { useAuthSession } from '../auth-session-provider';
import { MarketplaceProductImage } from '../marketplace-product-image';
import {
  AccountLoadFailure,
  AccountWorkspace,
  ProtectedAccountState,
} from '../protected-account-state';

const pageSize = 20;
const money = (value: number) => new Intl.NumberFormat('vi-VN').format(value);

function ProductSummary({ product }: { product: CatalogProductCard }) {
  return (
    <Link className="engagement-product" href={product.href} aria-label={`Xem ${product.name}`}>
      <MarketplaceProductImage
        src={product.imageUrl ?? '/media/products/product-placeholder.svg'}
        alt={product.imageAlt}
        width={180}
        height={180}
      />
      <span>
        <strong>{product.name}</strong>
        <small>
          {product.shop.name} · {product.shop.location}
        </small>
        <b>₫{money(buyerDisplayProductPriceMinor(product))}</b>
        {product.buyerBestPrice?.merchandiseDiscountMinor ? (
          <small>Giá tốt nhất dự kiến · Voucher đã áp dụng</small>
        ) : null}
      </span>
    </Link>
  );
}

function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage(page: number): void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="engagement-pager" aria-label="Phân trang">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Trang trước
      </button>
      <span>
        Trang {page} / {totalPages}
      </span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Trang sau
      </button>
    </nav>
  );
}

export function FavoritesManagement() {
  const auth = useAuthSession();
  const authenticatedUserId = auth.state.status === 'authenticated' ? auth.state.user.id : null;
  const [page, setPage] = useState(1);
  const [data, setData] = useState<FavoritePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!authenticatedUserId) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await getFavorites(page, pageSize, auth.authenticatedFetch);
      setData(response);
      if (page > 1 && response.items.length === 0 && response.pagination.totalPages < page)
        setPage(Math.max(1, response.pagination.totalPages));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [auth.authenticatedFetch, authenticatedUserId, page]);
  useEffect(() => {
    queueMicrotask(() => {
      if (authenticatedUserId) void load();
      else setData(null);
    });
  }, [authenticatedUserId, load]);
  async function remove(productId: string) {
    if (pendingId || auth.state.status !== 'authenticated') return;
    setPendingId(productId);
    try {
      await setFavorite(productId, false, auth.authenticatedFetch);
      await load();
    } catch {
      setFailed(true);
    } finally {
      setPendingId(null);
    }
  }
  return (
    <AccountWorkspace
      title="Sản phẩm yêu thích"
      description="Các sản phẩm bạn đã lưu, mới nhất hiển thị trước."
    >
      <ProtectedAccountState account={auth.state} returnTo="/account/favorites">
        {loading && !data ? (
          <section className="buyer-account-state" aria-busy="true">
            <h2>Đang tải yêu thích…</h2>
          </section>
        ) : null}
        {failed && !data ? <AccountLoadFailure onRetry={() => void load()} /> : null}
        {data && data.items.length === 0 ? (
          <section className="buyer-account-state">
            <h2>Chưa có sản phẩm yêu thích</h2>
            <p>Nhấn biểu tượng trái tim trên sản phẩm để lưu tại đây.</p>
            <Link href="/">Khám phá sản phẩm</Link>
          </section>
        ) : null}
        {data && data.items.length > 0 ? (
          <div aria-busy={loading}>
            {failed ? (
              <p className="engagement-inline-error" role="alert">
                Chưa thể làm mới danh sách. Vui lòng thử lại.
              </p>
            ) : null}
            <div className="engagement-list">
              {data.items.map((item) => (
                <Card
                  className={`engagement-list__item is-${item.availability}`}
                  key={item.productId}
                >
                  {item.availability === 'available' ? (
                    <ProductSummary product={item.product} />
                  ) : (
                    <div className="engagement-product engagement-product--unavailable">
                      <MarketplaceProductImage
                        src={item.product.imageUrl ?? '/media/products/product-placeholder.svg'}
                        alt={item.product.imageAlt}
                        width={180}
                        height={180}
                      />
                      <span>
                        <strong>{item.product.name}</strong>
                        <small>Sản phẩm hiện không còn bán</small>
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={pendingId === item.productId}
                    onClick={() => void remove(item.productId)}
                  >
                    {pendingId === item.productId ? 'Đang xóa…' : 'Xóa khỏi yêu thích'}
                  </button>
                </Card>
              ))}
            </div>
            <Pager
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onPage={setPage}
            />
          </div>
        ) : null}
      </ProtectedAccountState>
    </AccountWorkspace>
  );
}

export function RecentlyViewedManagement() {
  const auth = useAuthSession();
  const authenticatedUserId = auth.state.status === 'authenticated' ? auth.state.user.id : null;
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RecentlyViewedPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (!authenticatedUserId) return;
    setLoading(true);
    setFailed(false);
    try {
      setData(await getRecentlyViewed(page, pageSize, auth.authenticatedFetch));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [auth.authenticatedFetch, authenticatedUserId, page]);
  useEffect(() => {
    queueMicrotask(() => {
      if (authenticatedUserId) void load();
      else setData(null);
    });
  }, [authenticatedUserId, load]);
  return (
    <AccountWorkspace
      title="Sản phẩm đã xem"
      description="Lịch sử 100 sản phẩm gần nhất, lần xem mới nhất hiển thị trước."
    >
      <ProtectedAccountState account={auth.state} returnTo="/account/recently-viewed">
        {loading && !data ? (
          <section className="buyer-account-state" aria-busy="true">
            <h2>Đang tải lịch sử…</h2>
          </section>
        ) : null}
        {failed && !data ? <AccountLoadFailure onRetry={() => void load()} /> : null}
        {data && data.items.length === 0 ? (
          <section className="buyer-account-state">
            <h2>Chưa có sản phẩm đã xem</h2>
            <p>Sản phẩm bạn mở khi đăng nhập sẽ xuất hiện tại đây.</p>
            <Link href="/">Khám phá sản phẩm</Link>
          </section>
        ) : null}
        {data && data.items.length > 0 ? (
          <div aria-busy={loading}>
            {failed ? (
              <p className="engagement-inline-error" role="alert">
                Chưa thể làm mới lịch sử.
              </p>
            ) : null}
            <div className="engagement-list">
              {data.items.map((item) => (
                <Card className="engagement-list__item" key={item.productId}>
                  <ProductSummary product={item.product} />
                  <time dateTime={item.lastViewedAt}>
                    Đã xem{' '}
                    {new Intl.DateTimeFormat('vi-VN', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                      timeZone: 'Asia/Ho_Chi_Minh',
                    }).format(new Date(item.lastViewedAt))}
                  </time>
                </Card>
              ))}
            </div>
            <Pager
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              onPage={setPage}
            />
          </div>
        ) : null}
      </ProtectedAccountState>
    </AccountWorkspace>
  );
}

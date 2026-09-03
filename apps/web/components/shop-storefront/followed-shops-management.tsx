'use client';

import type {
  FollowedShopItem,
  FollowedShopPage,
  FollowedShopPageQuery,
} from '@shopee-clone/contracts';
import { Card } from '@shopee-clone/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { followedShopsHref } from '../../lib/followed-shops-query';
import { getFollowedShops, setShopFollowing } from '../../lib/shop-follow-api';
import { useAuthSession } from '../auth-session-provider';
import { CatalogPagination } from '../catalog/catalog';
import {
  AccountLoadFailure,
  AccountWorkspace,
  ProtectedAccountState,
} from '../protected-account-state';

const dateFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const numberFormatter = new Intl.NumberFormat('vi-VN');

function shopInitial(name: string): string {
  const normalized = name.trim();
  return normalized ? normalized[0]!.toLocaleUpperCase('vi-VN') : 'S';
}

function FollowedShopCard({
  item,
  pending,
  onUnfollow,
}: {
  item: FollowedShopItem;
  pending: boolean;
  onUnfollow(shopId: string): void;
}) {
  const summary = (
    <>
      <span className="followed-shop-card__avatar" aria-hidden="true">
        {shopInitial(item.shop.name)}
      </span>
      <span className="followed-shop-card__summary">
        <strong>{item.shop.name}</strong>
        {item.availability === 'available' ? (
          <small>
            {item.shop.location} · {numberFormatter.format(item.shop.followerCount)} người theo dõi
          </small>
        ) : (
          <small>Shop hiện không còn khả dụng</small>
        )}
        <time dateTime={item.followedAt}>
          Theo dõi từ {dateFormatter.format(new Date(item.followedAt))}
        </time>
      </span>
    </>
  );

  return (
    <Card className={`followed-shop-card is-${item.availability}`} data-shop-id={item.shopId}>
      {item.availability === 'available' ? (
        <Link
          className="followed-shop-card__link"
          href={item.shop.href}
          aria-label={`Xem gian hàng ${item.shop.name}`}
        >
          {summary}
        </Link>
      ) : (
        <div className="followed-shop-card__link followed-shop-card__link--unavailable">
          {summary}
        </div>
      )}
      <button
        type="button"
        data-unfollow={item.shopId}
        disabled={pending}
        onClick={() => onUnfollow(item.shopId)}
        aria-label={`Bỏ theo dõi ${item.shop.name}`}
      >
        {pending ? 'Đang bỏ theo dõi…' : 'Bỏ theo dõi'}
      </button>
    </Card>
  );
}

export function FollowedShopsManagement({ query }: { query: FollowedShopPageQuery | null }) {
  const auth = useAuthSession();
  const router = useRouter();
  const authenticatedUserId = auth.state.status === 'authenticated' ? auth.state.user.id : null;
  const [data, setData] = useState<FollowedShopPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const pendingIdsRef = useRef(new Set<string>());
  const [announcement, setAnnouncement] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async (): Promise<FollowedShopPage | null> => {
    if (!authenticatedUserId || !query) return null;
    setLoading(true);
    setFailed(false);
    try {
      const response = await getFollowedShops(query, auth.authenticatedFetch);
      setData(response);
      return response;
    } catch {
      setFailed(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [auth.authenticatedFetch, authenticatedUserId, query]);

  useEffect(() => {
    queueMicrotask(() => {
      if (authenticatedUserId && query) {
        void load().then((response) => {
          if (
            response &&
            response.items.length === 0 &&
            query.page > 1 &&
            response.pagination.totalPages < query.page
          ) {
            router.replace(
              followedShopsHref({
                page: Math.max(1, response.pagination.totalPages),
                pageSize: query.pageSize,
              }),
            );
          }
        });
      } else {
        setData(null);
      }
    });
  }, [authenticatedUserId, load, query, router]);

  async function unfollow(item: FollowedShopItem) {
    if (pendingIdsRef.current.has(item.shopId) || auth.state.status !== 'authenticated' || !query)
      return;
    pendingIdsRef.current.add(item.shopId);
    setPendingIds((current) => new Set(current).add(item.shopId));
    setAnnouncement('');
    try {
      await setShopFollowing(item.shopId, false, auth.authenticatedFetch);
      const refreshed = await load();
      if (!refreshed) {
        setAnnouncement('Đã bỏ theo dõi, nhưng chưa thể làm mới danh sách. Hãy thử tải lại.');
        return;
      }
      setAnnouncement(`Đã bỏ theo dõi ${item.shop.name}.`);
      if (
        refreshed.items.length === 0 &&
        query.page > 1 &&
        refreshed.pagination.totalPages < query.page
      ) {
        router.push(
          followedShopsHref({
            page: Math.max(1, refreshed.pagination.totalPages),
            pageSize: query.pageSize,
          }),
        );
      } else {
        requestAnimationFrame(() => {
          const next = document.querySelector<HTMLButtonElement>('[data-unfollow]:not(:disabled)');
          (next ?? headingRef.current)?.focus();
        });
      }
    } catch {
      setAnnouncement(`Chưa thể bỏ theo dõi ${item.shop.name}. Vui lòng thử lại.`);
    } finally {
      pendingIdsRef.current.delete(item.shopId);
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(item.shopId);
        return next;
      });
    }
  }

  return (
    <AccountWorkspace
      title="Shop đang theo dõi"
      description="Các gian hàng bạn đã theo dõi, mới nhất hiển thị trước."
    >
      <ProtectedAccountState account={auth.state} returnTo="/account/followed-shops">
        <h2 className="sc-visually-hidden" tabIndex={-1} ref={headingRef}>
          Danh sách shop đang theo dõi
        </h2>
        <p className="sc-visually-hidden" role="status" aria-live="polite">
          {announcement}
        </p>
        {!query ? (
          <section className="buyer-account-state">
            <h2>Đường dẫn chưa hợp lệ</h2>
            <p>Chỉ có thể sử dụng tham số trang và số shop trên mỗi trang.</p>
            <Link href={followedShopsHref()}>Mở danh sách từ trang đầu</Link>
          </section>
        ) : null}
        {query && loading && !data ? (
          <section className="buyer-account-state" aria-busy="true">
            <h2>Đang tải các shop đã theo dõi…</h2>
          </section>
        ) : null}
        {query && failed && !data ? <AccountLoadFailure onRetry={() => void load()} /> : null}
        {query && data && data.items.length === 0 ? (
          <section className="buyer-account-state">
            <h2>Chưa theo dõi shop nào</h2>
            <p>Khám phá gian hàng và nhấn “Theo dõi” để xem lại tại đây.</p>
            <Link href="/">Khám phá sản phẩm</Link>
          </section>
        ) : null}
        {query && data && data.items.length > 0 ? (
          <div className="followed-shops" aria-busy={loading}>
            {failed ? (
              <p className="engagement-inline-error" role="alert">
                Chưa thể làm mới danh sách. Vui lòng thử lại.
              </p>
            ) : null}
            <div className="followed-shops__list">
              {data.items.map((item) => (
                <FollowedShopCard
                  key={item.shopId}
                  item={item}
                  pending={pendingIds.has(item.shopId)}
                  onUnfollow={() => void unfollow(item)}
                />
              ))}
            </div>
            <CatalogPagination
              response={{ pagination: data.pagination }}
              pageHrefBuilder={(page) => followedShopsHref({ page, pageSize: query.pageSize })}
            />
          </div>
        ) : null}
      </ProtectedAccountState>
    </AccountWorkspace>
  );
}

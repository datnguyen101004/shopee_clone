'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  getShopFollowStatus,
  setShopFollowing,
  ShopFollowApiError,
} from '../../lib/shop-follow-api';
import { useAuthSession } from '../auth-session-provider';

type Snapshot = {
  key: string;
  isFollowing: boolean;
  followerCount: number;
  pending: boolean;
  loaded: boolean;
  blocked: boolean;
  message: string | null;
};

export function ShopFollowControl({
  shopId,
  initialFollowerCount,
  loginHref,
}: {
  shopId: string;
  initialFollowerCount: number;
  loginHref: string;
}) {
  const auth = useAuthSession();
  const userId = auth.state.status === 'authenticated' ? auth.state.user.id : null;
  const sessionKey = userId ? `${userId}:${shopId}` : 'guest';
  const [snapshot, setSnapshot] = useState<Snapshot>({
    key: '',
    isFollowing: false,
    followerCount: initialFollowerCount,
    pending: false,
    loaded: false,
    blocked: false,
    message: null,
  });
  const state = useMemo<Snapshot>(
    () =>
      snapshot.key === sessionKey
        ? snapshot
        : {
            key: sessionKey,
            isFollowing: false,
            followerCount: initialFollowerCount,
            pending: auth.state.status === 'authenticated',
            loaded: auth.state.status !== 'authenticated',
            blocked: false,
            message: null,
          },
    [auth.state.status, initialFollowerCount, sessionKey, snapshot],
  );

  useEffect(() => {
    let active = true;
    if (auth.state.status !== 'authenticated') return () => undefined;
    void getShopFollowStatus([shopId], auth.authenticatedFetch)
      .then(({ items }) => {
        if (!active) return;
        setSnapshot({
          key: sessionKey,
          isFollowing: items[0]!.isFollowing,
          followerCount: initialFollowerCount,
          pending: false,
          loaded: true,
          blocked: false,
          message: null,
        });
      })
      .catch(() => {
        if (!active) return;
        setSnapshot({
          key: sessionKey,
          isFollowing: false,
          followerCount: initialFollowerCount,
          pending: false,
          loaded: true,
          blocked: false,
          message: 'Chưa thể tải trạng thái theo dõi. Bạn có thể thử lại.',
        });
      });
    return () => {
      active = false;
    };
  }, [auth.authenticatedFetch, auth.state.status, initialFollowerCount, sessionKey, shopId]);

  async function toggle() {
    if (auth.state.status !== 'authenticated' || state.pending || state.blocked) return;
    const previous = state;
    const next = !state.isFollowing;
    setSnapshot({
      ...state,
      key: sessionKey,
      isFollowing: next,
      followerCount: Math.max(0, state.followerCount + (next ? 1 : -1)),
      pending: true,
      message: null,
    });
    try {
      const confirmed = await setShopFollowing(shopId, next, auth.authenticatedFetch);
      setSnapshot({
        key: sessionKey,
        isFollowing: confirmed.isFollowing,
        followerCount: confirmed.followerCount ?? previous.followerCount,
        pending: false,
        loaded: true,
        blocked: false,
        message: confirmed.isFollowing ? 'Đã theo dõi shop.' : 'Đã bỏ theo dõi shop.',
      });
    } catch (error) {
      const blocked = error instanceof ShopFollowApiError && [404, 409].includes(error.status);
      setSnapshot({
        ...previous,
        key: sessionKey,
        pending: false,
        blocked,
        message:
          error instanceof ShopFollowApiError && error.status === 409
            ? 'Bạn không thể theo dõi shop của chính mình.'
            : error instanceof ShopFollowApiError && error.status === 404
              ? 'Shop hiện không còn khả dụng.'
              : 'Không thể cập nhật theo dõi. Thay đổi đã được hoàn tác.',
      });
    }
  }

  return (
    <div className="shop-follow-control">
      {auth.state.status === 'guest' ? (
        <Link href={loginHref}>Đăng nhập để theo dõi</Link>
      ) : (
        <button
          type="button"
          aria-pressed={state.isFollowing}
          disabled={auth.state.status === 'loading' || state.pending || state.blocked}
          onClick={() => void toggle()}
        >
          {auth.state.status === 'loading' || !state.loaded
            ? 'Đang khôi phục…'
            : state.pending
              ? 'Đang cập nhật…'
              : state.isFollowing
                ? 'Đang theo dõi'
                : 'Theo dõi'}
        </button>
      )}
      <span>{new Intl.NumberFormat('vi-VN').format(state.followerCount)} người theo dõi</span>
      <p role="status" aria-live="polite">
        {state.message}
      </p>
    </div>
  );
}

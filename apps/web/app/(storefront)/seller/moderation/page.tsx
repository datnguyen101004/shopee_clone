'use client';

import type { SellerModerationNoticeSummary } from '@shopee-clone/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { useAuthSession } from '../../../../components/auth-session-provider';
import {
  listSellerModerationNotices,
  markSellerModerationNoticeRead,
} from '../../../../lib/seller-moderation-api';

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function noticeTargetHref(notice: SellerModerationNoticeSummary): string | null {
  if (!notice.targetId) return null;
  if (notice.targetType === 'PRODUCT') return `/products/${notice.targetId}`;
  return notice.targetSlug ? `/shops/${encodeURIComponent(notice.targetSlug)}` : null;
}

function actionLabel(action: SellerModerationNoticeSummary['action']): string {
  return action.endsWith('SUSPENDED') ? 'Đã đình chỉ' : 'Đã khôi phục';
}

export default function SellerModerationNoticesPage() {
  const { authenticatedFetch, state: authState } = useAuthSession();
  const isSeller =
    authState.status === 'authenticated' && authState.user.roles.includes('seller');
  const [notices, setNotices] = useState<SellerModerationNoticeSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingNoticeId, setPendingNoticeId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchNotices = useCallback(
    async (cursor?: string) => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await listSellerModerationNotices(authenticatedFetch, { unreadOnly, cursor });
        setNotices((current) => (cursor ? [...current, ...response.items] : response.items));
        setUnreadCount(response.unreadCount);
        setNextCursor(response.nextCursor);
      } catch (error) {
        setErrorMessage(messageFrom(error, 'Không thể tải thông báo kiểm duyệt.'));
      } finally {
        setIsLoading(false);
      }
    },
    [authenticatedFetch, unreadOnly],
  );

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      if (isSeller) void fetchNotices();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [fetchNotices, isSeller]);

  const handleMarkRead = async (noticeId: string) => {
    setPendingNoticeId(noticeId);
    setErrorMessage(null);
    try {
      const result = await markSellerModerationNoticeRead(authenticatedFetch, noticeId);
      setNotices((current) => current.map((notice) => (
        notice.id === noticeId ? { ...notice, readAt: result.readAt } : notice
      )));
      setUnreadCount((current) => Math.max(0, current - 1));
      setStatusMessage('Đã đánh dấu thông báo là đã đọc.');
    } catch (error) {
      setErrorMessage(messageFrom(error, 'Không thể xác nhận thông báo. Vui lòng thử lại.'));
    } finally {
      setPendingNoticeId(null);
    }
  };

  if (authState.status === 'loading') {
    return <p className="seller-moderation-state" role="status">Đang kiểm tra tài khoản…</p>;
  }

  if (authState.status === 'guest') {
    return (
      <section className="seller-moderation-state" aria-labelledby="seller-notice-auth-title">
        <h1 id="seller-notice-auth-title">Cần đăng nhập</h1>
        <p>Đăng nhập bằng tài khoản người bán để xem thông báo kiểm duyệt.</p>
        <Link href="/login?returnTo=/seller/moderation">Đăng nhập</Link>
      </section>
    );
  }

  if (!isSeller) {
    return (
      <section className="seller-moderation-state" aria-labelledby="seller-notice-forbidden-title">
        <h1 id="seller-notice-forbidden-title">Bạn không có quyền truy cập</h1>
        <p>Khu vực này chỉ dành cho tài khoản người bán.</p>
      </section>
    );
  }

  return (
    <main className="seller-moderation-page" aria-labelledby="seller-notice-title">
      <header className="seller-moderation-page__header">
        <div>
          <div className="seller-moderation-page__title-row">
            <h1 id="seller-notice-title">Thông báo kiểm duyệt</h1>
            {unreadCount > 0 ? <span className="seller-moderation-page__count">{unreadCount} chưa đọc</span> : null}
          </div>
          <p>Các cập nhật về trạng thái kiểm duyệt sản phẩm và cửa hàng của bạn.</p>
        </div>
        <label className="seller-moderation-page__filter">
          <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
          Chỉ hiện chưa đọc
        </label>
      </header>

      <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>
      {errorMessage ? <p className="seller-moderation-page__error" role="alert">{errorMessage}</p> : null}
      {isLoading && notices.length === 0 ? <p className="seller-moderation-page__state" role="status">Đang tải thông báo…</p> : null}
      {!isLoading && !errorMessage && notices.length === 0 ? <p className="seller-moderation-page__state" role="status">Không có thông báo kiểm duyệt.</p> : null}

      {notices.length > 0 ? (
        <section className="seller-moderation-page__list" aria-label="Danh sách thông báo kiểm duyệt">
          {notices.map((notice) => {
            const isSuspension = notice.action.endsWith('SUSPENDED');
            const href = noticeTargetHref(notice);
            return (
              <article key={notice.id} className={`seller-moderation-card${!notice.readAt ? ' is-unread' : ''}`}>
                <div className="seller-moderation-card__row">
                  <div>
                    <div className="seller-moderation-card__title-row">
                      <span className={`seller-moderation-card__badge ${isSuspension ? 'is-suspended' : 'is-restored'}`}>{actionLabel(notice.action)}</span>
                      {href ? <Link href={href}>{notice.targetName}</Link> : <span>{notice.targetName}</span>}
                    </div>
                    <p className="seller-moderation-card__reason">Lý do: <span>{notice.reason}</span></p>
                    <p className="seller-moderation-card__date">Có hiệu lực: {new Date(notice.effectiveAt).toLocaleString('vi-VN')}</p>
                  </div>
                  {!notice.readAt ? (
                    <button type="button" onClick={() => void handleMarkRead(notice.id)} disabled={pendingNoticeId === notice.id} className="seller-moderation-card__action">
                      {pendingNoticeId === notice.id ? 'Đang xác nhận…' : 'Đánh dấu đã đọc'}
                    </button>
                  ) : <span className="seller-moderation-card__read">Đã đọc {new Date(notice.readAt).toLocaleDateString('vi-VN')}</span>}
                </div>
              </article>
            );
          })}
          {nextCursor ? <div className="seller-moderation-page__more"><button type="button" onClick={() => void fetchNotices(nextCursor)} disabled={isLoading}>{isLoading ? 'Đang tải…' : 'Tải thêm thông báo'}</button></div> : null}
        </section>
      ) : null}
    </main>
  );
}

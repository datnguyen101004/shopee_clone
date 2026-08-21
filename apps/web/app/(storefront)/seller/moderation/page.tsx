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
    return <p className="mx-auto max-w-4xl px-4 py-12" role="status">Đang kiểm tra tài khoản…</p>;
  }

  if (authState.status === 'guest') {
    return (
      <section className="mx-auto max-w-4xl px-4 py-12" aria-labelledby="seller-notice-auth-title">
        <h1 id="seller-notice-auth-title" className="text-xl font-bold">Cần đăng nhập</h1>
        <p className="mt-2">Đăng nhập bằng tài khoản người bán để xem thông báo kiểm duyệt.</p>
        <Link className="mt-4 inline-block" href="/login?returnTo=/seller/moderation">Đăng nhập</Link>
      </section>
    );
  }

  if (!isSeller) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-12" aria-labelledby="seller-notice-forbidden-title">
        <h1 id="seller-notice-forbidden-title" className="text-xl font-bold">Bạn không có quyền truy cập</h1>
        <p className="mt-2">Khu vực này chỉ dành cho tài khoản người bán.</p>
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8" aria-labelledby="seller-notice-title">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b pb-4 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 id="seller-notice-title" className="text-2xl font-bold text-zinc-900 dark:text-white">Thông báo kiểm duyệt</h1>
            {unreadCount > 0 ? <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">{unreadCount} chưa đọc</span> : null}
          </div>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Các cập nhật về trạng thái kiểm duyệt sản phẩm và cửa hàng của bạn.</p>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} className="rounded border-zinc-300" />
          Chỉ hiện chưa đọc
        </label>
      </header>

      <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>
      {errorMessage ? <p className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">{errorMessage}</p> : null}
      {isLoading && notices.length === 0 ? <p className="py-12 text-center text-zinc-500" role="status">Đang tải thông báo…</p> : null}
      {!isLoading && !errorMessage && notices.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-300 py-12 text-center text-zinc-500 dark:border-zinc-700" role="status">Không có thông báo kiểm duyệt.</p> : null}

      {notices.length > 0 ? (
        <section className="space-y-4" aria-label="Danh sách thông báo kiểm duyệt">
          {notices.map((notice) => {
            const isSuspension = notice.action.endsWith('SUSPENDED');
            const href = noticeTargetHref(notice);
            return (
              <article key={notice.id} className={`rounded-xl border p-5 shadow-sm transition dark:bg-zinc-900 ${!notice.readAt ? 'border-orange-300 bg-orange-50/20 dark:border-orange-700/50' : 'border-zinc-200 bg-white dark:border-zinc-800'}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-bold ${isSuspension ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' : 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'}`}>{actionLabel(notice.action)}</span>
                      {href ? <Link className="font-semibold text-zinc-900 underline dark:text-white" href={href}>{notice.targetName}</Link> : <span className="font-semibold text-zinc-900 dark:text-white">{notice.targetName}</span>}
                    </div>
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">Lý do: <span className="font-medium">{notice.reason}</span></p>
                    <p className="mt-2 text-xs text-zinc-500">Có hiệu lực: {new Date(notice.effectiveAt).toLocaleString('vi-VN')}</p>
                  </div>
                  {!notice.readAt ? (
                    <button type="button" onClick={() => void handleMarkRead(notice.id)} disabled={pendingNoticeId === notice.id} className="min-h-11 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60">
                      {pendingNoticeId === notice.id ? 'Đang xác nhận…' : 'Đánh dấu đã đọc'}
                    </button>
                  ) : <span className="text-xs text-zinc-500">Đã đọc {new Date(notice.readAt).toLocaleDateString('vi-VN')}</span>}
                </div>
              </article>
            );
          })}
          {nextCursor ? <div className="pt-2 text-center"><button type="button" className="min-h-11 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800" onClick={() => void fetchNotices(nextCursor)} disabled={isLoading}>{isLoading ? 'Đang tải…' : 'Tải thêm thông báo'}</button></div> : null}
        </section>
      ) : null}
    </main>
  );
}

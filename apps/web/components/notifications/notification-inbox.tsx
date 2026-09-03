'use client';

import type { NotificationCategory, NotificationItem } from '@shopee-clone/contracts';
import { Card } from '@shopee-clone/ui';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  listNotifications,
  isNotificationAtOrBefore,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../lib/notifications-api';
import { marketplaceMediaUrl } from '../../lib/marketplace-media-url';
import { useAuthSession } from '../auth-session-provider';
import { useChat } from '../chat/chat-provider';
import {
  AccountLoadFailure,
  AccountWorkspace,
  ProtectedAccountState,
} from '../protected-account-state';

type InboxTab = 'ALL' | 'ORDERS' | 'PROMOTIONS' | 'SYSTEM' | 'CHAT';

const tabs: { id: InboxTab; label: string }[] = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'ORDERS', label: 'Đơn hàng' },
  { id: 'PROMOTIONS', label: 'Khuyến mãi' },
  { id: 'SYSTEM', label: 'Hệ thống' },
  { id: 'CHAT', label: 'Tin nhắn' },
];

const pageSize = 20;

function formatRelativeTime(iso: string): string {
  const created = Date.parse(iso);
  if (!Number.isFinite(created)) return '';
  const deltaSec = Math.max(0, Math.round((Date.now() - created) / 1000));
  if (deltaSec < 60) return 'Vừa xong';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} phút trước`;
  if (deltaSec < 86_400) return `${Math.floor(deltaSec / 3600)} giờ trước`;
  if (deltaSec < 86_400 * 7) return `${Math.floor(deltaSec / 86_400)} ngày trước`;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(created);
}

function categoryLabel(category: NotificationCategory): string {
  switch (category) {
    case 'ORDERS':
      return 'Đơn hàng';
    case 'PROMOTIONS':
      return 'Khuyến mãi';
    case 'ACCOUNT':
      return 'Tài khoản';
    case 'SYSTEM':
      return 'Hệ thống';
    case 'CHAT':
      return 'Tin nhắn';
  }
}

function sortByNewest(items: NotificationItem[]): NotificationItem[] {
  return [...items].sort((left, right) => {
    const byTime = (right.activityAt ?? right.createdAt).localeCompare(left.activityAt ?? left.createdAt);
    return byTime !== 0 ? byTime : right.id.localeCompare(left.id);
  });
}

function mergeUnique(existing: NotificationItem[], incoming: NotificationItem[]): NotificationItem[] {
  const seen = new Set(existing.map((item) => item.id));
  const next = [...existing];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
  }
  return sortByNewest(next);
}

export function NotificationInbox() {
  const auth = useAuthSession();
  const chat = useChat();
  const authenticatedUserId = auth.state.status === 'authenticated' ? auth.state.user.id : null;
  const [tab, setTab] = useState<InboxTab>('ALL');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [systemCursor, setSystemCursor] = useState<string | null>(null);
  const [accountCursor, setAccountCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const hasMore = useMemo(() => {
    if (tab === 'SYSTEM') return Boolean(systemCursor || accountCursor);
    return cursor !== null;
  }, [accountCursor, cursor, systemCursor, tab]);

  const loadPage = useCallback(
    async (mode: 'replace' | 'append') => {
      if (!authenticatedUserId) return;
      if (mode === 'replace') {
        setLoading(true);
        setFailed(false);
      } else {
        setLoadingMore(true);
      }
      try {
        if (tab === 'SYSTEM') {
          const [systemPage, accountPage] = await Promise.all([
            listNotifications(
              {
                category: 'SYSTEM',
                limit: pageSize,
                cursor: mode === 'append' ? systemCursor : null,
              },
              auth.authenticatedFetch,
            ),
            listNotifications(
              {
                category: 'ACCOUNT',
                limit: pageSize,
                cursor: mode === 'append' ? accountCursor : null,
              },
              auth.authenticatedFetch,
            ),
          ]);
          const combined = sortByNewest([...systemPage.items, ...accountPage.items]);
          setItems((current) => (mode === 'append' ? mergeUnique(current, combined) : combined));
          setUnreadCount(systemPage.unreadCount);
          setSystemCursor(systemPage.nextCursor);
          setAccountCursor(accountPage.nextCursor);
          setCursor(null);
        } else {
          const response = await listNotifications(
            {
              category: tab,
              limit: pageSize,
              cursor: mode === 'append' ? cursor : null,
            },
            auth.authenticatedFetch,
          );
          setItems((current) =>
            mode === 'append' ? mergeUnique(current, response.items) : response.items,
          );
          setUnreadCount(response.unreadCount);
          setCursor(response.nextCursor);
          setSystemCursor(null);
          setAccountCursor(null);
        }
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      accountCursor,
      auth.authenticatedFetch,
      authenticatedUserId,
      cursor,
      systemCursor,
      tab,
    ],
  );

  useEffect(() => {
    queueMicrotask(() => {
      if (authenticatedUserId) {
        setItems([]);
        setCursor(null);
        setSystemCursor(null);
        setAccountCursor(null);
        void loadPage('replace');
      } else {
        setItems([]);
        setUnreadCount(0);
      }
    });
    // Intentionally reload when tab / session changes; loadPage closes over cursors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticatedUserId, tab]);

  async function handleMarkAll() {
    if (markingAll || auth.state.status !== 'authenticated' || unreadCount <= 0) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(auth.authenticatedFetch);
      setItems((current) =>
        current.map((item) =>
          item.isRead
            ? item
            : { ...item, isRead: true, readAt: new Date().toISOString() },
        ),
      );
      setUnreadCount(0);
    } catch {
      setFailed(true);
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleOpen(item: NotificationItem) {
    if (pendingId || auth.state.status !== 'authenticated') return;
    setPendingId(item.id);
    try {
      if (item.category === 'CHAT' && item.metadata.chat) {
        const opened = await chat.openConversationFromNotification(
          item.metadata.chat.conversationId,
          item.metadata.chat.newestSequence,
        );
        if (!opened) throw new Error('conversation unavailable');
      }
      const readResult = await markNotificationRead(item.id, auth.authenticatedFetch);
      setItems((current) =>
        current.map((entry) =>
          !entry.isRead && isNotificationAtOrBefore(entry, item)
            ? { ...entry, isRead: true, readAt: readResult.readAt }
            : entry,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - readResult.updatedCount));
      if (!(item.category === 'CHAT' && item.metadata.chat)) window.location.assign(item.metadata.targetUrl);
    } catch {
      setFailed(true);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <AccountWorkspace
      title="Thông báo"
      description="Theo dõi cập nhật đơn hàng, khuyến mãi và thông báo hệ thống."
    >
      <ProtectedAccountState account={auth.state} returnTo="/account/notifications">
        <div className="notification-inbox">
          <div className="notification-inbox__toolbar">
            <div className="notification-inbox__tabs" role="tablist" aria-label="Loại thông báo">
              {tabs.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === entry.id}
                  className={tab === entry.id ? 'is-active' : undefined}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <div className="notification-inbox__actions">
              <Link href="/account/profile/notifications">Cài đặt thông báo</Link>
              <button
                type="button"
                disabled={markingAll || unreadCount <= 0}
                onClick={() => void handleMarkAll()}
              >
                {markingAll ? 'Đang đánh dấu…' : 'Đánh dấu tất cả đã đọc'}
              </button>
            </div>
          </div>

          {loading && items.length === 0 ? (
            <section className="buyer-account-state" aria-busy="true">
              <h2>Đang tải thông báo…</h2>
            </section>
          ) : null}

          {failed && items.length === 0 ? (
            <AccountLoadFailure onRetry={() => void loadPage('replace')} />
          ) : null}

          {!loading && !failed && items.length === 0 ? (
            <section className="buyer-account-state">
              <h2>Chưa có thông báo</h2>
              <p>Khi có cập nhật đơn hàng hoặc khuyến mãi, thông báo sẽ hiện tại đây.</p>
            </section>
          ) : null}

          {items.length > 0 ? (
            <div aria-busy={loading || loadingMore}>
              {failed ? (
                <p className="engagement-inline-error" role="alert">
                  Chưa thể làm mới danh sách. Vui lòng thử lại.
                </p>
              ) : null}
              <ul className="notification-inbox__list">
                {items.map((item) => (
                  <li key={item.id}>
                    <Card
                      className={`notification-inbox__item${item.isRead ? '' : ' is-unread'}`}
                    >
                      <button
                        type="button"
                        disabled={pendingId === item.id}
                        onClick={() => void handleOpen(item)}
                      >
                        {item.metadata.thumbnailUrl ? (
                          <img
                            src={marketplaceMediaUrl(item.metadata.thumbnailUrl)}
                            alt=""
                            width={48}
                            height={48}
                          />
                        ) : (
                          <span className="notification-inbox__thumb" aria-hidden="true">
                            {item.category === 'CHAT' ? '💬' : '🔔'}
                          </span>
                        )}
                        <span className="notification-inbox__body">
                          <strong>{item.title}</strong>
                          <small>{item.body}</small>
                          <span className="notification-inbox__meta">
                            <em>{categoryLabel(item.category)}</em>
                            <time dateTime={item.createdAt}>
                              {formatRelativeTime(item.createdAt)}
                            </time>
                          </span>
                        </span>
                      </button>
                    </Card>
                  </li>
                ))}
              </ul>
              {hasMore ? (
                <div className="notification-inbox__more">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void loadPage('append')}
                  >
                    {loadingMore ? 'Đang tải…' : 'Tải thêm'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </ProtectedAccountState>
    </AccountWorkspace>
  );
}

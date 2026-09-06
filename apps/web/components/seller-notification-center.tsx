'use client';

import type { NotificationItem } from '@shopee-clone/contracts';
import { useCallback, useEffect, useState } from 'react';

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../lib/notifications-api';
import { useAuthSession } from './auth-session-provider';
import { useChat } from './chat/chat-provider';

function notificationTime(iso: string): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return '';
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) return 'Vừa xong';
  if (deltaSeconds < 3600) return `${Math.floor(deltaSeconds / 60)} phút trước`;
  if (deltaSeconds < 86_400) return `${Math.floor(deltaSeconds / 3600)} giờ trước`;
  if (deltaSeconds < 86_400 * 7) return `${Math.floor(deltaSeconds / 86_400)} ngày trước`;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(timestamp);
}

export function SellerNotificationCenter() {
  const auth = useAuthSession();
  const chat = useChat();
  const authenticatedUserId = auth.state.status === 'authenticated' ? auth.state.user.id : null;
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!authenticatedUserId) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await listNotifications(
        { category: 'ALL', limit: 50 },
        auth.authenticatedFetch,
      );
      setItems(response.items);
      setUnreadCount(response.unreadCount);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [auth.authenticatedFetch, authenticatedUserId]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  async function handleMarkAll() {
    if (markingAll || unreadCount <= 0 || auth.state.status !== 'authenticated') return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(auth.authenticatedFetch);
      setItems((current) =>
        current.map((item) =>
          item.isRead ? item : { ...item, isRead: true, readAt: new Date().toISOString() },
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
          entry.id === item.id ? { ...entry, isRead: true, readAt: readResult.readAt } : entry,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - readResult.updatedCount));

      if (!(item.category === 'CHAT' && item.metadata.chat)) {
        window.location.assign(item.metadata.targetUrl);
      }
    } catch {
      setFailed(true);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="seller-notification-page" aria-labelledby="seller-notification-page-title">
      <div className="seller-notification-page__toolbar">
        <div>
          <span className="seller-dashboard-eyebrow">SELLER CENTER</span>
          <h2 id="seller-notification-page-title">Thông báo của shop</h2>
          <p>
            {unreadCount
              ? `${unreadCount} thông báo chưa đọc`
              : 'Bạn đã xem hết các thông báo mới nhất.'}
          </p>
        </div>
        <button
          type="button"
          className="seller-notification-page__mark-all"
          disabled={markingAll || unreadCount === 0}
          onClick={() => void handleMarkAll()}
        >
          {markingAll ? 'Đang cập nhật…' : 'Đánh dấu tất cả đã đọc'}
        </button>
      </div>

      <section className="seller-dashboard-panel seller-notification-page__panel">
        {loading ? (
          <p className="seller-dashboard-empty" role="status">
            Đang tải thông báo…
          </p>
        ) : failed && items.length === 0 ? (
          <div className="seller-notification-page__empty" role="alert">
            <p>Không thể tải thông báo lúc này.</p>
            <button type="button" onClick={() => void loadNotifications()}>
              Thử lại
            </button>
          </div>
        ) : items.length ? (
          <div className="seller-notification-page__list" role="list">
            {items.map((item) => (
              <button
                type="button"
                className="seller-notification-page__item"
                data-unread={item.isRead ? undefined : 'true'}
                disabled={pendingId === item.id}
                key={item.id}
                role="listitem"
                onClick={() => void handleOpen(item)}
              >
                <span className="seller-dashboard-notification-icon" aria-hidden="true">
                  {item.category === 'CHAT' ? '💬' : '🔔'}
                </span>
                <span className="seller-dashboard-notification-copy">
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                </span>
                <time dateTime={item.createdAt}>{notificationTime(item.createdAt)}</time>
              </button>
            ))}
          </div>
        ) : (
          <p className="seller-dashboard-empty">Chưa có thông báo nào cho shop.</p>
        )}
      </section>
    </section>
  );
}

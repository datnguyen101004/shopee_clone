'use client';

import type { NotificationItem } from '@shopee-clone/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import {
  getNotificationUnreadCount,
  listNotificationPopover,
  markNotificationRead,
} from '../../lib/notifications-api';
import { useAuthSession } from '../auth-session-provider';

const POLL_INTERVAL_MS = 30_000;

function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function formatRelativeTime(iso: string): string {
  const created = Date.parse(iso);
  if (!Number.isFinite(created)) return '';
  const deltaSec = Math.max(0, Math.round((Date.now() - created) / 1000));
  if (deltaSec < 60) return 'Vừa xong';
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} phút trước`;
  if (deltaSec < 86_400) return `${Math.floor(deltaSec / 3600)} giờ trước`;
  if (deltaSec < 86_400 * 7) return `${Math.floor(deltaSec / 86_400)} ngày trước`;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(created);
}

function badgeLabel(count: number): string {
  if (count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}

export function NotificationBell() {
  const auth = useAuthSession();
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const authenticated = auth.state.status === 'authenticated';

  const refreshUnread = useCallback(async () => {
    if (auth.state.status !== 'authenticated') return;
    try {
      const response = await getNotificationUnreadCount(auth.authenticatedFetch);
      setUnreadCount(response.unreadCount);
    } catch {
      // Keep the last known badge value on transient failures.
    }
  }, [auth.authenticatedFetch, auth.state.status]);

  const loadPreview = useCallback(async () => {
    if (auth.state.status !== 'authenticated') return;
    setLoadingPreview(true);
    try {
      const response = await listNotificationPopover(auth.authenticatedFetch);
      setItems(response.items);
      setUnreadCount(response.unreadCount);
    } catch {
      setItems([]);
    } finally {
      setLoadingPreview(false);
    }
  }, [auth.authenticatedFetch, auth.state.status]);

  useEffect(() => {
    if (!authenticated) {
      setUnreadCount(0);
      setItems([]);
      setOpen(false);
      return;
    }
    void refreshUnread();
    const timer = window.setInterval(() => {
      void refreshUnread();
    }, POLL_INTERVAL_MS);
    const onFocus = () => {
      void refreshUnread();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [authenticated, refreshUnread]);

  useEffect(() => {
    if (!open) return;
    void loadPreview();
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [loadPreview, open]);

  if (!authenticated) return null;

  async function handleItemClick(item: NotificationItem) {
    if (pendingId) return;
    setPendingId(item.id);
    try {
      if (!item.isRead) {
        await markNotificationRead(item.id, auth.authenticatedFetch);
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, isRead: true, readAt: new Date().toISOString() }
              : entry,
          ),
        );
        setUnreadCount((current) => Math.max(0, current - 1));
      }
      setOpen(false);
      window.location.assign(item.metadata.targetUrl);
    } catch {
      // Leave the popover open so the user can retry.
    } finally {
      setPendingId(null);
    }
  }

  const countLabel = badgeLabel(unreadCount);

  return (
    <div className="market-notification" ref={rootRef}>
      <button
        type="button"
        className="market-notification__trigger"
        aria-label={
          unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : 'Thông báo'
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="market-notification__icon">
          <BellIcon />
          {countLabel ? <b aria-hidden="true">{countLabel}</b> : null}
        </span>
      </button>
      {open ? (
        <div
          className="market-notification__popover"
          id={popoverId}
          role="dialog"
          aria-label="Thông báo gần đây"
        >
          <header className="market-notification__popover-head">
            <strong>Thông báo</strong>
            {unreadCount > 0 ? <span>{unreadCount} chưa đọc</span> : null}
          </header>
          {loadingPreview && items.length === 0 ? (
            <p className="market-notification__empty" role="status">
              Đang tải thông báo…
            </p>
          ) : null}
          {!loadingPreview && items.length === 0 ? (
            <p className="market-notification__empty">Chưa có thông báo nào.</p>
          ) : null}
          {items.length > 0 ? (
            <ul className="market-notification__list">
              {items.map((item) => (
                <li key={item.id} data-unread={!item.isRead ? 'true' : undefined}>
                  <button
                    type="button"
                    className="market-notification__item"
                    disabled={pendingId === item.id}
                    onClick={() => void handleItemClick(item)}
                  >
                    {item.metadata.thumbnailUrl ? (
                      <img src={item.metadata.thumbnailUrl} alt="" width={40} height={40} />
                    ) : (
                      <span className="market-notification__thumb" aria-hidden="true">
                        🔔
                      </span>
                    )}
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.body}</small>
                      <time dateTime={item.createdAt}>{formatRelativeTime(item.createdAt)}</time>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Link
            className="market-notification__all"
            href="/account/notifications"
            onClick={() => setOpen(false)}
          >
            Xem tất cả
          </Link>
        </div>
      ) : null}
    </div>
  );
}

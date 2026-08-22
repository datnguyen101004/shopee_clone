'use client';

import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationChannelPreference,
} from '@shopee-clone/contracts';
import { Card } from '@shopee-clone/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getNotificationPreferences,
  updateNotificationPreference,
} from '../../lib/notifications-api';
import { useAuthSession } from '../auth-session-provider';
import {
  AccountLoadFailure,
  AccountWorkspace,
  ProtectedAccountState,
} from '../protected-account-state';

const categoryLabels: Record<NotificationCategory, string> = {
  ORDERS: 'Đơn hàng',
  PROMOTIONS: 'Khuyến mãi',
  ACCOUNT: 'Tài khoản',
  SYSTEM: 'Hệ thống',
};

const channelLabels: Record<NotificationChannel, string> = {
  IN_APP: 'Trong ứng dụng',
  EMAIL: 'Email',
};

function preferenceKey(category: NotificationCategory, channel: NotificationChannel): string {
  return `${category}:${channel}`;
}

export function NotificationPreferences() {
  const auth = useAuthSession();
  const authenticatedUserId = auth.state.status === 'authenticated' ? auth.state.user.id : null;
  const [preferences, setPreferences] = useState<NotificationChannelPreference[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const byKey = useMemo(() => {
    const map = new Map<string, NotificationChannelPreference>();
    for (const preference of preferences) {
      map.set(preferenceKey(preference.category, preference.channel), preference);
    }
    return map;
  }, [preferences]);

  const load = useCallback(async () => {
    if (!authenticatedUserId) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await getNotificationPreferences(auth.authenticatedFetch);
      setPreferences(response.preferences);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [auth.authenticatedFetch, authenticatedUserId]);

  useEffect(() => {
    queueMicrotask(() => {
      if (authenticatedUserId) void load();
      else setPreferences([]);
    });
  }, [authenticatedUserId, load]);

  async function toggle(
    category: NotificationCategory,
    channel: NotificationChannel,
    enabled: boolean,
  ) {
    if (auth.state.status !== 'authenticated') return;
    const key = preferenceKey(category, channel);
    const current = byKey.get(key);
    if (!current || current.mandatory || pendingKey) return;
    setPendingKey(key);
    setMessage('');
    try {
      const response = await updateNotificationPreference(
        { category, channel, enabled },
        auth.authenticatedFetch,
      );
      setPreferences(response.preferences);
      setMessage('Đã cập nhật tùy chọn thông báo.');
    } catch {
      setMessage('Chưa thể lưu tùy chọn. Vui lòng thử lại.');
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <AccountWorkspace
      title="Cài đặt thông báo"
      description="Chọn kênh nhận thông báo theo từng loại. Một số thông báo bắt buộc không thể tắt."
    >
      <ProtectedAccountState account={auth.state} returnTo="/account/profile/notifications">
        {loading && preferences.length === 0 ? (
          <section className="buyer-account-state" aria-busy="true">
            <h2>Đang tải tùy chọn…</h2>
          </section>
        ) : null}
        {failed && preferences.length === 0 ? (
          <AccountLoadFailure onRetry={() => void load()} />
        ) : null}
        {preferences.length > 0 ? (
          <div className="notification-preferences">
            {message ? (
              <p
                className={
                  message.startsWith('Đã')
                    ? 'buyer-account-message is-success'
                    : 'buyer-account-message is-error'
                }
                role={message.startsWith('Đã') ? 'status' : 'alert'}
              >
                {message}
              </p>
            ) : null}
            {NOTIFICATION_CATEGORIES.map((category) => (
              <Card className="notification-preferences__card" key={category}>
                <h2>{categoryLabels[category]}</h2>
                <ul>
                  {NOTIFICATION_CHANNELS.map((channel) => {
                    const preference = byKey.get(preferenceKey(category, channel));
                    const enabled = preference?.enabled ?? true;
                    const mandatory = preference?.mandatory ?? false;
                    const key = preferenceKey(category, channel);
                    return (
                      <li key={channel}>
                        <label>
                          <span>
                            <strong>{channelLabels[channel]}</strong>
                            {mandatory ? <small>Bắt buộc</small> : null}
                          </span>
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={mandatory || pendingKey === key || !preference}
                            onChange={(event) =>
                              void toggle(category, channel, event.target.checked)
                            }
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </div>
        ) : null}
      </ProtectedAccountState>
    </AccountWorkspace>
  );
}

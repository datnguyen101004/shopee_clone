import {
  archiveNotification,
  getNotificationPreferences,
  getNotificationUnreadCount,
  listNotificationPopover,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreference,
} from './notifications-api';

const notificationId = '00000000-0000-4000-8000-000000000201';
const timestamp = '2026-08-22T04:00:00.000Z';

const sampleItem = {
  id: notificationId,
  category: 'ORDERS' as const,
  type: 'ORDER_CONFIRMED' as const,
  title: 'Đơn hàng đã xác nhận',
  body: 'Đơn hàng của bạn đã được xác nhận.',
  metadata: {
    targetUrl: '/account/orders/0000-1111',
    thumbnailUrl: null,
    referenceId: '0000-1111',
    amountMinor: null,
    currency: null,
  },
  isRead: false,
  readAt: null,
  isArchived: false,
  createdAt: timestamp,
};

const listResponse = {
  notificationVersion: 'notifications-v1' as const,
  items: [sampleItem],
  nextCursor: null,
  unreadCount: 1,
};

describe('notifications API boundary', () => {
  it('uses authenticatedFetch for list, unread, and mutation paths', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(listResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(listResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ unreadCount: 3 }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: notificationId, isRead: true, readAt: timestamp }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ updatedCount: 2, readAt: timestamp }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: notificationId, isArchived: true }), { status: 200 }),
      );

    await listNotifications({ category: 'ORDERS', limit: 20 }, authenticatedFetch);
    await listNotificationPopover(authenticatedFetch);
    await getNotificationUnreadCount(authenticatedFetch);
    await markNotificationRead(notificationId, authenticatedFetch);
    await markAllNotificationsRead(authenticatedFetch);
    await archiveNotification(notificationId, authenticatedFetch);

    expect(authenticatedFetch.mock.calls.map(([url, init]) => [String(url), init.method])).toEqual([
      [expect.stringContaining('/api/v1/account/notifications?category=ORDERS&limit=20'), 'GET'],
      [expect.stringContaining('/api/v1/account/notifications?limit=5'), 'GET'],
      [expect.stringContaining('/api/v1/account/notifications/unread-count'), 'GET'],
      [
        expect.stringContaining(`/api/v1/account/notifications/${notificationId}/read`),
        'POST',
      ],
      [expect.stringContaining('/api/v1/account/notifications/read-all'), 'POST'],
      [
        expect.stringContaining(`/api/v1/account/notifications/${notificationId}/archive`),
        'POST',
      ],
    ]);
  });

  it('parses preferences and validates preference updates', async () => {
    const preferences = {
      notificationVersion: 'notifications-v1' as const,
      preferences: [
        { category: 'PROMOTIONS' as const, channel: 'EMAIL' as const, enabled: true, mandatory: false },
        { category: 'ORDERS' as const, channel: 'IN_APP' as const, enabled: true, mandatory: true },
      ],
    };
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(preferences), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(preferences), { status: 200 }));

    await expect(getNotificationPreferences(authenticatedFetch)).resolves.toEqual(preferences);
    await expect(
      updateNotificationPreference(
        { category: 'PROMOTIONS', channel: 'EMAIL', enabled: false },
        authenticatedFetch,
      ),
    ).resolves.toEqual(preferences);
    expect(authenticatedFetch.mock.calls[1]![1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({ category: 'PROMOTIONS', channel: 'EMAIL', enabled: false }),
    });
  });

  it('rejects invalid input and malformed successful responses', async () => {
    const authenticatedFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ unreadCount: -1 }), { status: 200 }),
    );

    await expect(
      listNotifications({ category: 'ORDERS', limit: 99 }, authenticatedFetch),
    ).rejects.toMatchObject({ kind: 'input' });
    await expect(markNotificationRead('not-a-uuid', authenticatedFetch)).rejects.toMatchObject({
      kind: 'input',
    });
    await expect(
      updateNotificationPreference(
        { category: 'PROMOTIONS', channel: 'EMAIL', enabled: 'yes' } as never,
        authenticatedFetch,
      ),
    ).rejects.toMatchObject({ kind: 'input' });
    await expect(getNotificationUnreadCount(authenticatedFetch)).rejects.toMatchObject({
      kind: 'contract',
    });
  });

  it('accepts chat notifications persisted for account inboxes', async () => {
    const chatResponse = {
      ...listResponse,
      items: [
        {
          ...sampleItem,
          category: 'ACCOUNT' as const,
          type: 'CHAT_MESSAGE' as const,
          metadata: {
            ...sampleItem.metadata,
            targetUrl: '/account/chat?conversation=00000000-0000-4000-8000-000000000401',
          },
        },
      ],
    };
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(chatResponse), { status: 200 }));

    await expect(listNotificationPopover(authenticatedFetch)).resolves.toEqual(chatResponse);
  });

  it('surfaces transport and status errors with problem details when present', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: 'https://shopee-clone.local/problems/authentication-required',
            title: 'Authentication Required',
            status: 401,
            detail: 'Sign in to continue.',
          }),
          { status: 401 },
        ),
      );

    await expect(getNotificationUnreadCount(authenticatedFetch)).rejects.toMatchObject({
      kind: 'transport',
    });
    await expect(getNotificationUnreadCount(authenticatedFetch)).rejects.toMatchObject({
      kind: 'status',
      status: 401,
      problem: expect.objectContaining({ status: 401 }),
    });
  });
});

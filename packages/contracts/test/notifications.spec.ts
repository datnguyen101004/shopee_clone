import {
  MANDATORY_NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORY_BY_TYPE,
  NOTIFICATION_DEFAULT_LIMIT,
  NOTIFICATION_MAX_LIMIT,
  NOTIFICATION_VERSION,
  isMandatoryNotificationType,
  isNotificationItem,
  isNotificationListResponse,
  isNotificationPreferencesResponse,
  isUpdateNotificationPreferenceRequest,
  parseNotificationListQuery,
} from '../src';
import { describe, expect, it } from 'vitest';

const id = '00000000-0000-4000-8000-000000000201';
const timestamp = '2026-08-22T09:00:00.000Z';

const item = {
  id,
  category: 'ORDERS' as const,
  type: 'ORDER_DELIVERED' as const,
  title: 'Đơn hàng đã giao',
  body: 'Đơn hàng của bạn đã được giao thành công.',
  metadata: {
    targetUrl: '/account/orders/00000000-0000-4000-8000-000000000301',
    thumbnailUrl: null,
    referenceId: '00000000-0000-4000-8000-000000000301',
    amountMinor: 150000,
    currency: 'VND',
  },
  isRead: false,
  readAt: null,
  isArchived: false,
  createdAt: timestamp,
};

describe('notification contracts', () => {
  it('maps types to categories and flags mandatory notices', () => {
    expect(NOTIFICATION_CATEGORY_BY_TYPE.ORDER_CONFIRMED).toBe('ORDERS');
    expect(NOTIFICATION_CATEGORY_BY_TYPE.VOUCHER_ASSIGNED).toBe('PROMOTIONS');
    expect(NOTIFICATION_CATEGORY_BY_TYPE.PRODUCT_REJECTED).toBe('SYSTEM');
    expect(NOTIFICATION_CATEGORY_BY_TYPE.CHAT_MESSAGE).toBe('ACCOUNT');
    expect(isMandatoryNotificationType('REFUNDED')).toBe(true);
    expect(isMandatoryNotificationType('VOUCHER_ASSIGNED')).toBe(false);
    expect(MANDATORY_NOTIFICATION_TYPES).toContain('DISPUTE_ESCALATED');
  });

  it('parses list query defaults and bounds', () => {
    expect(parseNotificationListQuery({})).toEqual({
      category: 'ALL',
      limit: NOTIFICATION_DEFAULT_LIMIT,
      cursor: null,
    });
    expect(
      parseNotificationListQuery({
        category: 'ORDERS',
        limit: String(NOTIFICATION_MAX_LIMIT),
        cursor: 'abc',
      }),
    ).toEqual({ category: 'ORDERS', limit: NOTIFICATION_MAX_LIMIT, cursor: 'abc' });
    expect(parseNotificationListQuery({ category: 'INVALID' })).toBeNull();
    expect(parseNotificationListQuery({ limit: '0' })).toBeNull();
    expect(parseNotificationListQuery({ extra: '1' })).toBeNull();
  });

  it('validates notification items and list responses', () => {
    expect(isNotificationItem(item)).toBe(true);
    expect(isNotificationItem({ ...item, readAt: timestamp })).toBe(false);
    expect(
      isNotificationListResponse({
        notificationVersion: NOTIFICATION_VERSION,
        items: [item],
        nextCursor: null,
        unreadCount: 1,
      }),
    ).toBe(true);
    expect(
      isNotificationListResponse({
        notificationVersion: 'wrong',
        items: [],
        nextCursor: null,
        unreadCount: 0,
      }),
    ).toBe(false);
    expect(
      isNotificationListResponse({
        notificationVersion: NOTIFICATION_VERSION,
        items: [
          {
            ...item,
            category: 'ACCOUNT',
            type: 'CHAT_MESSAGE',
            metadata: {
              ...item.metadata,
              targetUrl: '/account/chat?conversation=00000000-0000-4000-8000-000000000401',
            },
          },
        ],
        nextCursor: null,
        unreadCount: 1,
      }),
    ).toBe(true);
  });

  it('validates preference payloads', () => {
    expect(
      isUpdateNotificationPreferenceRequest({
        category: 'PROMOTIONS',
        channel: 'EMAIL',
        enabled: false,
      }),
    ).toBe(true);
    expect(
      isUpdateNotificationPreferenceRequest({
        category: 'PROMOTIONS',
        channel: 'PUSH',
        enabled: false,
      }),
    ).toBe(false);
    expect(
      isNotificationPreferencesResponse({
        notificationVersion: NOTIFICATION_VERSION,
        preferences: [
          { category: 'ORDERS', channel: 'IN_APP', enabled: true, mandatory: true },
          { category: 'PROMOTIONS', channel: 'EMAIL', enabled: false, mandatory: false },
        ],
      }),
    ).toBe(true);
  });
});

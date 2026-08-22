import { expect, test, type Page, type Route } from '@playwright/test';

const notificationId = '00000000-0000-4000-8000-000000000201';
const orderId = '00000000-0000-4000-8000-000000000301';
const timestamp = '2026-08-22T09:00:00.000Z';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer Example',
  status: 'active',
  roles: ['buyer'],
};

const notification = {
  id: notificationId,
  category: 'ORDERS',
  type: 'ORDER_DELIVERED',
  title: 'Đơn hàng đã giao',
  body: 'Đơn hàng của bạn đã được giao thành công.',
  metadata: {
    targetUrl: `/account/orders/${orderId}`,
    thumbnailUrl: null,
    referenceId: orderId,
    amountMinor: 150000,
    currency: 'VND',
  },
  isRead: false,
  readAt: null,
  isArchived: false,
  createdAt: timestamp,
};

async function authenticate(page: Page) {
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-22T09:00:00.000Z',
        user,
      }),
    }),
  );
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    },
    body: JSON.stringify(body),
  });
}

test.describe('notification bell and inbox', () => {
  test('shows unread badge, opens popover, and deep-links after mark-as-read', async ({ page }) => {
    await authenticate(page);

    await page.route('**/api/v1/account/notifications/unread-count', (route) =>
      fulfillJson(route, { unreadCount: 1 }),
    );
    await page.route('**/api/v1/account/notifications?**', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return fulfillJson(route, {});
      }
      return fulfillJson(route, {
        notificationVersion: 'notifications-v1',
        items: [notification],
        nextCursor: null,
        unreadCount: 1,
      });
    });
    await page.route(`**/api/v1/account/notifications/${notificationId}/read`, (route) =>
      fulfillJson(route, {
        id: notificationId,
        isRead: true,
        readAt: '2026-08-22T09:05:00.000Z',
      }),
    );
    await page.route(`**/api/v1/account/orders/${orderId}`, (route) =>
      fulfillJson(route, {
        orderHistoryVersion: 'order-history-v1',
        currency: 'VND',
        order: {
          orderReference: orderId,
          purchaseReference: '00000000-0000-4000-8000-000000000302',
          status: 'DELIVERED',
          paymentStatus: 'UNPAID',
          version: 3,
          createdAt: timestamp,
          updatedAt: timestamp,
          shop: { id: '00000000-0000-4000-8000-000000000010', slug: 'shop', name: 'Shop' },
          note: '',
          lines: [],
          shipping: null,
          totals: {
            merchandiseSubtotalMinor: 150000,
            productDiscountMinor: 0,
            shopVoucherDiscountMinor: 0,
            platformVoucherDiscountMinor: 0,
            shippingFeeMinor: 0,
            shippingDiscountMinor: 0,
            payableTotalMinor: 150000,
          },
        },
        address: null,
        timeline: [],
        cancellation: { allowed: false, reasonCodes: [] },
        returnCapability: { state: 'INELIGIBLE', returnDeadline: null },
      }),
    );

    await page.goto('/');
    const bell = page.getByRole('button', { name: /Thông báo/i });
    await expect(bell).toBeVisible();
    await expect(page.getByText('1', { exact: true }).first()).toBeVisible();

    await bell.click();
    await expect(page.getByText('Đơn hàng đã giao')).toBeVisible();
    await expect(page.getByRole('link', { name: /Xem tất cả/i })).toBeVisible();

    await page.getByRole('button', { name: /Đơn hàng đã giao/i }).click();
    await expect(page).toHaveURL(new RegExp(`/account/orders/${orderId}`));
  });

  test('inbox page filters categories and marks all as read', async ({ page }) => {
    await authenticate(page);
    let markedAll = false;

    await page.route('**/api/v1/account/notifications/unread-count', (route) =>
      fulfillJson(route, { unreadCount: markedAll ? 0 : 1 }),
    );
    await page.route('**/api/v1/account/notifications/read-all', (route) => {
      markedAll = true;
      return fulfillJson(route, {
        updatedCount: 1,
        readAt: '2026-08-22T09:10:00.000Z',
      });
    });
    await page.route('**/api/v1/account/notifications?**', (route) => {
      const url = new URL(route.request().url());
      const category = url.searchParams.get('category') ?? 'ALL';
      const item =
        category === 'PROMOTIONS'
          ? {
              ...notification,
              id: '00000000-0000-4000-8000-000000000202',
              category: 'PROMOTIONS',
              type: 'VOUCHER_ASSIGNED',
              title: 'Voucher mới',
              body: 'Bạn có mã giảm giá mới.',
              isRead: true,
              readAt: timestamp,
            }
          : { ...notification, isRead: markedAll, readAt: markedAll ? timestamp : null };
      return fulfillJson(route, {
        notificationVersion: 'notifications-v1',
        items: category === 'SYSTEM' ? [] : [item],
        nextCursor: null,
        unreadCount: markedAll ? 0 : 1,
      });
    });

    await page.goto('/account/notifications');
    await expect(page.getByText('Đơn hàng đã giao')).toBeVisible();
    await page.getByRole('tab', { name: /Khuyến mãi/i }).click();
    await expect(page.getByText('Voucher mới')).toBeVisible();
    await page.getByRole('tab', { name: /Tất cả/i }).click();
    await page.getByRole('button', { name: /Đánh dấu tất cả đã đọc/i }).click();
    await expect(page.getByText('Đơn hàng đã giao')).toBeVisible();
  });
});

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
        updatedCount: 1,
      }),
    );
    await page.route(`**/api/v1/account/orders/${orderId}`, (route) =>
      fulfillJson(route, {
        orderHistoryVersion: 'order-history-v1',
        currency: 'VND',
        order: {
          purchaseReference: '00000000-0000-4000-8000-000000000302',
          status: 'PENDING_CONFIRMATION',
          paymentStatus: 'UNPAID',
          version: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
          shops: [
            {
              orderReference: orderId,
              purchaseReference: '00000000-0000-4000-8000-000000000302',
              status: 'PENDING_CONFIRMATION',
              paymentStatus: 'UNPAID',
              version: 0,
              createdAt: timestamp,
              updatedAt: timestamp,
              shop: { id: '00000000-0000-0000-0000-000000000010', slug: 'shop', name: 'Shop' },
              note: '',
              lines: [
                {
                  lineId: '00000000-0000-0000-0000-000000000311',
                  productId: '00000000-0000-0000-0000-000000000312',
                  variantId: null,
                  quantity: 1,
                  unitWeightGrams: 500,
                  shipmentWeightGrams: 500,
                  listUnitPriceMinor: 150000,
                  sellingUnitPriceMinor: 150000,
                  listSubtotalMinor: 150000,
                  productDiscountMinor: 0,
                  merchandiseSubtotalMinor: 150000,
                  shopVoucherDiscountMinor: 0,
                  platformVoucherDiscountMinor: 0,
                  merchandiseVoucherDiscountMinor: 0,
                  payableMerchandiseMinor: 150000,
                  productName: 'Sản phẩm thông báo',
                  productImageUrl: null,
                  productAvailable: true,
                  variantName: 'Mặc định',
                  variantSku: 'NOTICE-1',
                },
              ],
              shipping: {
                provider: 'MOCK',
                version: 'mock-v1',
                shopId: '00000000-0000-0000-0000-000000000010',
                originProvince: 'Hà Nội',
                destinationProvince: 'Hà Nội',
                zone: 'SAME_PROVINCE',
                shipmentWeightGrams: 500,
                service: 'STANDARD',
                estimatedDaysMin: 1,
                estimatedDaysMax: 2,
                baseFeeMinor: 0,
                zoneSurchargeMinor: 0,
                weightSurchargeMinor: 0,
                shippingFeeMinor: 0,
              },
              listSubtotalMinor: 150000,
              productDiscountMinor: 0,
              merchandiseSubtotalMinor: 150000,
              shopVoucherDiscountMinor: 0,
              platformVoucherDiscountMinor: 0,
              merchandiseVoucherDiscountMinor: 0,
              shippingVoucherDiscountMinor: 0,
              voucherDiscountMinor: 0,
              shippingPayableMinor: 0,
              payableTotalMinor: 150000,
              cancellation: {
                allowed: true,
                reasonCodes: [
                  'CHANGE_ADDRESS',
                  'CHANGE_PRODUCT',
                  'FOUND_BETTER_PRICE',
                  'NO_LONGER_NEEDED',
                  'OTHER',
                ],
              },
            },
          ],
          listSubtotalMinor: 150000,
          productDiscountMinor: 0,
          merchandiseSubtotalMinor: 150000,
          shippingTotalMinor: 0,
          shopVoucherDiscountMinor: 0,
          platformVoucherDiscountMinor: 0,
          merchandiseVoucherDiscountMinor: 0,
          shippingVoucherDiscountMinor: 0,
          voucherDiscountMinor: 0,
          shippingPayableMinor: 0,
          payableTotalMinor: 150000,
          cancellation: {
            allowed: true,
            reasonCodes: [
              'CHANGE_ADDRESS',
              'CHANGE_PRODUCT',
              'FOUND_BETTER_PRICE',
              'NO_LONGER_NEEDED',
              'OTHER',
            ],
          },
        },
        address: {
          id: '00000000-0000-0000-0000-000000000313',
          recipientName: 'Buyer Example',
          phoneNumber: '0900000000',
          province: 'Hà Nội',
          district: 'Quận 1',
          ward: 'Phường Bến Nghé',
          addressLine: '1 Test',
          label: null,
        },
        vouchers: [],
        timeline: [
          {
            orderReference: orderId,
            events: [
              {
                id: '00000000-0000-0000-0000-000000000314',
                previousStatus: null,
                status: 'PENDING_CONFIRMATION',
                orderVersion: 0,
                actorType: 'SYSTEM',
                actorUserId: null,
                reasonCode: 'ORDER_CREATED',
                reasonNote: null,
                occurredAt: timestamp,
              },
            ],
          },
        ],
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

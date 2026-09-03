import AxeBuilder from '@axe-core/playwright';
import type { BuyerOrderDetailResponse } from '@shopee-clone/contracts';
import { expect, test, type Page, type Route } from '@playwright/test';

const ids = {
  buyer: '20000000-0000-4000-8000-000000000001',
  order: '20000000-0000-4000-8000-000000000002',
  purchase: '20000000-0000-4000-8000-000000000003',
  shop: '20000000-0000-4000-8000-000000000004',
  line: '20000000-0000-4000-8000-000000000005',
  product: '20000000-0000-4000-8000-000000000006',
  variant: '20000000-0000-4000-8000-000000000007',
  address: '20000000-0000-4000-8000-000000000008',
  createdEvent: '20000000-0000-4000-8000-000000000009',
  cancelledEvent: '20000000-0000-4000-8000-000000000010',
};

const pendingShop = {
  orderReference: ids.order,
  purchaseReference: ids.purchase,
  status: 'PENDING_CONFIRMATION',
  paymentStatus: 'UNPAID',
  version: 0,
  createdAt: '2026-08-14T06:00:00.000Z',
  updatedAt: '2026-08-14T06:00:00.000Z',
  shop: { id: ids.shop, slug: 'space-t', name: 'Space T' },
  note: '',
  lines: [
    {
      lineId: ids.line,
      productId: ids.product,
      variantId: ids.variant,
      quantity: 1,
      unitWeightGrams: 500,
      shipmentWeightGrams: 500,
      listUnitPriceMinor: 1_000_000,
      sellingUnitPriceMinor: 900_000,
      listSubtotalMinor: 1_000_000,
      productDiscountMinor: 100_000,
      merchandiseSubtotalMinor: 900_000,
      shopVoucherDiscountMinor: 0,
      platformVoucherDiscountMinor: 0,
      merchandiseVoucherDiscountMinor: 0,
      payableMerchandiseMinor: 900_000,
      productName: 'Ghế công thái học Space T',
      productImageUrl: null,
      variantName: 'Đen',
      variantSku: 'SPACE-T-BLACK',
      productAvailable: true,
    },
  ],
  shipping: {
    provider: 'MOCK',
    version: 'mock-v1',
    shopId: ids.shop,
    originProvince: 'Hà Nội',
    destinationProvince: 'Thành phố Hồ Chí Minh',
    zone: 'CROSS_REGION',
    shipmentWeightGrams: 500,
    service: 'STANDARD',
    estimatedDaysMin: 2,
    estimatedDaysMax: 4,
    baseFeeMinor: 30_000,
    zoneSurchargeMinor: 10_000,
    weightSurchargeMinor: 0,
    shippingFeeMinor: 40_000,
  },
  listSubtotalMinor: 1_000_000,
  productDiscountMinor: 100_000,
  merchandiseSubtotalMinor: 900_000,
  shopVoucherDiscountMinor: 0,
  platformVoucherDiscountMinor: 0,
  merchandiseVoucherDiscountMinor: 0,
  shippingVoucherDiscountMinor: 0,
  voucherDiscountMinor: 0,
  shippingPayableMinor: 40_000,
  payableTotalMinor: 940_000,
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
} as const;

const pending: BuyerOrderDetailResponse = {
  orderHistoryVersion: 'order-history-v1',
  currency: 'VND',
  order: {
    purchaseReference: ids.purchase,
    status: 'PENDING_CONFIRMATION',
    paymentStatus: 'UNPAID',
    version: 0,
    createdAt: '2026-08-14T06:00:00.000Z',
    updatedAt: '2026-08-14T06:00:00.000Z',
    shops: [pendingShop],
    listSubtotalMinor: 1_000_000,
    productDiscountMinor: 100_000,
    merchandiseSubtotalMinor: 900_000,
    shippingTotalMinor: 40_000,
    shopVoucherDiscountMinor: 0,
    platformVoucherDiscountMinor: 0,
    merchandiseVoucherDiscountMinor: 0,
    shippingVoucherDiscountMinor: 0,
    voucherDiscountMinor: 0,
    shippingPayableMinor: 40_000,
    payableTotalMinor: 940_000,
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
    id: ids.address,
    recipientName: 'Nguyễn Văn An',
    phoneNumber: '0900000000',
    province: 'Thành phố Hồ Chí Minh',
    district: 'Quận 1',
    ward: 'Phường Bến Nghé',
    addressLine: '1 Nguyễn Huệ',
    label: 'Nhà',
  },
  vouchers: [],
  timeline: [
    {
      orderReference: ids.order,
      events: [
        {
          id: ids.createdEvent,
          previousStatus: null,
          status: 'PENDING_CONFIRMATION',
          orderVersion: 0,
          actorType: 'SYSTEM',
          actorUserId: null,
          reasonCode: 'ORDER_CREATED',
          reasonNote: null,
          occurredAt: '2026-08-14T06:00:00.000Z',
        },
      ],
    },
  ],
};

const cancelled: BuyerOrderDetailResponse = {
  ...pending,
  order: {
    ...pending.order,
    status: 'CANCELLED',
    version: 1,
    updatedAt: '2026-08-14T06:01:00.000Z',
    shops: [
      {
        ...pendingShop,
        status: 'CANCELLED',
        version: 1,
        updatedAt: '2026-08-14T06:01:00.000Z',
        cancellation: { allowed: false, reasonCodes: [] },
      },
    ],
    cancellation: { allowed: false, reasonCodes: [] },
  },
  timeline: [
    {
      orderReference: ids.order,
      events: [
        ...pending.timeline[0]!.events,
        {
          id: ids.cancelledEvent,
          previousStatus: 'PENDING_CONFIRMATION',
          status: 'CANCELLED',
          orderVersion: 1,
          actorType: 'BUYER',
          actorUserId: ids.buyer,
          reasonCode: 'CHANGE_ADDRESS',
          reasonNote: null,
          occurredAt: '2026-08-14T06:01:00.000Z',
        },
      ],
    },
  ],
};

async function json(
  route: Route,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  });
}

async function installOrders(page: Page) {
  let current = pending;
  let cancellations = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname === '/api/v1/auth/refresh') {
      await json(route, {
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-14T00:00:00.000Z',
        user: {
          id: ids.buyer,
          email: 'buyer@example.test',
          displayName: 'Buyer',
          status: 'active',
          roles: ['buyer'],
        },
      });
    } else if (request.method() === 'GET' && url.pathname === '/api/v1/cart') {
      await route.fulfill({ status: 404 });
    } else if (request.method() === 'GET' && url.pathname === '/api/v1/account/orders') {
      await json(route, {
        orderHistoryVersion: 'order-history-v1',
        items: [current.order],
        page: { limit: 20, nextCursor: null },
      });
    } else if (
      request.method() === 'GET' &&
      [ids.order, ids.purchase].some(
        (reference) => url.pathname === `/api/v1/account/orders/${reference}`,
      )
    ) {
      await json(route, current, 200, { ETag: `"order-${current.order.version}"` });
    } else if (
      request.method() === 'POST' &&
      url.pathname === `/api/v1/account/orders/${ids.order}/cancel`
    ) {
      cancellations += 1;
      expect(request.headers()['if-match']).toBe('"order-0"');
      expect(request.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
      await new Promise((resolve) => setTimeout(resolve, 150));
      current = cancelled;
      await json(route, current, 200, { ETag: '"order-1"' });
    } else {
      await route.fulfill({ status: 404 });
    }
  });
  return { cancellations: () => cancellations };
}

test.describe('buyer order lifecycle', () => {
  test('lists, opens, cancels once, and reloads the authoritative timeline', async ({ page }) => {
    const calls = await installOrders(page);
    await page.goto('/account/orders?filter=PENDING_CONFIRMATION');
    await expect(page.getByRole('heading', { name: 'Đơn mua' })).toBeVisible();
    await expect(page.getByText('Ghế công thái học Space T')).toBeVisible();
    await page.getByRole('link', { name: 'Xem chi tiết' }).click();
    await expect(page).toHaveURL(`/account/orders/${ids.purchase}`);
    await expect(page.getByRole('heading', { name: 'Hành trình · Space T' })).toBeVisible();
    await page.getByRole('button', { name: 'Hủy nhóm hàng của shop này' }).click();
    const confirm = page.getByRole('button', { name: 'Xác nhận hủy' });
    await confirm.dblclick();
    await expect(page.getByText('Đơn hàng đã được hủy.')).toBeVisible();
    await expect(page.getByText('Đã hủy').first()).toBeVisible();
    expect(calls.cancellations()).toBe(1);
    await page.reload();
    await expect(page.getByText('Đã hủy').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hủy nhóm hàng của shop này' })).toHaveCount(0);
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(
      accessibility.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });
});

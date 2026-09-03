import AxeBuilder from '@axe-core/playwright';
import type { BuyerOrderDetailResponse } from '@shopee-clone/contracts';
import { expect, test, type Page, type Route } from '@playwright/test';

const ids = {
  buyer: '20000000-0000-4000-8000-000000000001',
  order: '20000000-0000-4000-8000-000000000002',
  line: '20000000-0000-4000-8000-000000000003',
  product: '20000000-0000-4000-8000-000000000004',
  variant: '20000000-0000-4000-8000-000000000005',
  shop: '20000000-0000-4000-8000-000000000006',
  purchase: '20000000-0000-4000-8000-000000000007',
  address: '20000000-0000-4000-8000-000000000008',
};

const deliveredShop = {
  orderReference: ids.order,
  purchaseReference: ids.purchase,
  status: 'DELIVERED' as const,
  paymentStatus: 'UNPAID' as const,
  version: 3,
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
  shop: { id: ids.shop, slug: 'shop', name: 'Shop' },
  note: '',
  lines: [
    {
      lineId: ids.line,
      productId: ids.product,
      variantId: ids.variant,
      quantity: 1,
      unitWeightGrams: 500,
      shipmentWeightGrams: 500,
      listUnitPriceMinor: 100_000,
      sellingUnitPriceMinor: 100_000,
      listSubtotalMinor: 100_000,
      productDiscountMinor: 0,
      merchandiseSubtotalMinor: 100_000,
      shopVoucherDiscountMinor: 0,
      platformVoucherDiscountMinor: 0,
      merchandiseVoucherDiscountMinor: 0,
      payableMerchandiseMinor: 100_000,
      productName: 'Sản phẩm đã giao',
      productImageUrl: null,
      productAvailable: true,
      variantName: 'Mặc định',
      variantSku: 'REVIEW-1',
      review: { state: 'ELIGIBLE' as const, reviewId: null },
    },
  ],
  shipping: {
    provider: 'MOCK' as const,
    version: 'mock-v1',
    shopId: ids.shop,
    originProvince: 'Hà Nội',
    destinationProvince: 'Hà Nội',
    zone: 'SAME_PROVINCE' as const,
    shipmentWeightGrams: 500,
    service: 'STANDARD' as const,
    estimatedDaysMin: 1,
    estimatedDaysMax: 2,
    baseFeeMinor: 1,
    zoneSurchargeMinor: 0,
    weightSurchargeMinor: 0,
    shippingFeeMinor: 1,
  },
  listSubtotalMinor: 100_000,
  productDiscountMinor: 0,
  merchandiseSubtotalMinor: 100_000,
  shopVoucherDiscountMinor: 0,
  platformVoucherDiscountMinor: 0,
  merchandiseVoucherDiscountMinor: 0,
  shippingVoucherDiscountMinor: 0,
  voucherDiscountMinor: 0,
  shippingPayableMinor: 1,
  payableTotalMinor: 100_001,
  cancellation: { allowed: false, reasonCodes: [] },
};

const delivered: BuyerOrderDetailResponse = {
  orderHistoryVersion: 'order-history-v1',
  currency: 'VND',
  order: {
    purchaseReference: ids.purchase,
    status: 'DELIVERED',
    paymentStatus: 'UNPAID',
    version: 3,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    shops: [deliveredShop],
    listSubtotalMinor: 100_000,
    productDiscountMinor: 0,
    merchandiseSubtotalMinor: 100_000,
    shippingTotalMinor: 1,
    shopVoucherDiscountMinor: 0,
    platformVoucherDiscountMinor: 0,
    merchandiseVoucherDiscountMinor: 0,
    shippingVoucherDiscountMinor: 0,
    voucherDiscountMinor: 0,
    shippingPayableMinor: 1,
    payableTotalMinor: 100_001,
    cancellation: { allowed: false, reasonCodes: [] },
  },
  address: {
    id: ids.address,
    recipientName: 'Buyer',
    phoneNumber: '0900000000',
    province: 'Hà Nội',
    district: 'Quận Ba Đình',
    ward: 'Phường Điện Biên',
    addressLine: '1 Test',
    label: null,
  },
  vouchers: [],
  timeline: [
    {
      orderReference: ids.order,
      events: [
        {
          id: '20000000-0000-4000-8000-000000000009',
          previousStatus: null,
          status: 'PENDING_CONFIRMATION',
          orderVersion: 0,
          actorType: 'SYSTEM',
          actorUserId: null,
          reasonCode: 'ORDER_CREATED',
          reasonNote: null,
          occurredAt: '2026-08-14T20:00:00.000Z',
        },
        {
          id: '20000000-0000-4000-8000-000000000012',
          previousStatus: 'PENDING_CONFIRMATION',
          status: 'AWAITING_PICKUP',
          orderVersion: 1,
          actorType: 'SYSTEM',
          actorUserId: null,
          reasonCode: 'CONFIRMED',
          reasonNote: null,
          occurredAt: '2026-08-14T21:00:00.000Z',
        },
        {
          id: '20000000-0000-4000-8000-000000000013',
          previousStatus: 'AWAITING_PICKUP',
          status: 'SHIPPING',
          orderVersion: 2,
          actorType: 'SYSTEM',
          actorUserId: null,
          reasonCode: 'SHIPPED',
          reasonNote: null,
          occurredAt: '2026-08-14T22:00:00.000Z',
        },
        {
          id: '20000000-0000-4000-8000-000000000014',
          previousStatus: 'SHIPPING',
          status: 'DELIVERED',
          orderVersion: 3,
          actorType: 'SYSTEM',
          actorUserId: null,
          reasonCode: 'DELIVERED',
          reasonNote: null,
          occurredAt: '2026-08-15T00:00:00.000Z',
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

async function installReviews(page: Page) {
  let creates = 0;
  let stages = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh')
      return json(route, {
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-15T00:00:00.000Z',
        user: {
          id: ids.buyer,
          email: 'buyer@example.test',
          displayName: 'Buyer',
          status: 'active',
          roles: ['buyer'],
        },
      });
    if (request.method() === 'GET' && path === '/api/v1/cart')
      return route.fulfill({ status: 404 });
    if (request.method() === 'GET' && path === '/api/v1/account/orders')
      return json(route, {
        orderHistoryVersion: 'order-history-v1',
        items: [delivered.order],
        page: { limit: 20, nextCursor: null },
      });
    if (request.method() === 'GET' && path === `/api/v1/account/orders/${ids.order}`)
      return json(route, delivered, 200, { ETag: '"order-3"' });
    if (request.method() === 'POST' && path === '/api/v1/account/review-media') {
      stages += 1;
      return json(
        route,
        {
          id: '20000000-0000-4000-8000-000000000010',
          mimeType: 'image/png',
          width: 1,
          height: 1,
          expiresAt: '2026-08-16T00:00:00.000Z',
        },
        201,
      );
    }
    if (
      request.method() === 'POST' &&
      path === `/api/v1/account/orders/${ids.order}/lines/${ids.line}/review`
    ) {
      creates += 1;
      expect(request.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
      return json(
        route,
        {
          id: '20000000-0000-4000-8000-000000000011',
          orderLineId: ids.line,
          rating: 5,
          text: 'Tốt',
          authorName: 'Buyer',
          verifiedPurchase: true,
          media: [],
          updatedAt: '2026-08-15T00:00:00.000Z',
          visibility: 'VISIBLE',
          version: 0,
        },
        201,
        { ETag: '"review-0"' },
      );
    }
    return route.fulfill({ status: 404 });
  });
  return { creates: () => creates, stages: () => stages };
}

test('buyer stages media and reviews a delivered line across configured mobile, tablet, and desktop viewports', async ({
  page,
}) => {
  const calls = await installReviews(page);
  await page.goto(`/account/orders/${ids.order}`);
  await expect(page.getByText('Sản phẩm đã giao')).toBeVisible();
  await page.getByRole('button', { name: 'Đánh giá' }).click();
  await page.getByLabel('5 sao').check();
  await page.getByLabel('Đúng với mô tả:').fill('Tốt');
  await page.getByLabel(/Ảnh đánh giá/).setInputFiles({
    name: 'review.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71]),
  });
  await page.getByRole('button', { name: 'Hoàn thành' }).click();
  await expect(page.getByText('Đánh giá đã được lưu.')).toBeVisible();
  expect(calls.creates()).toBe(1);
  expect(calls.stages()).toBe(1);
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((item) =>
      ['serious', 'critical'].includes(item.impact ?? ''),
    ),
  ).toEqual([]);
});

import { expect, test } from '@playwright/test';

const orderReference = '00000000-0000-4000-8000-000000000001';
const shopId = '00000000-0000-4000-8000-000000000003';
const line = {
  lineId: 'line-1',
  productId: '00000000-0000-4000-8000-000000000004',
  variantId: '00000000-0000-4000-8000-000000000005',
  productName: 'Bình nước seller',
  productImageUrl: null,
  variantName: 'Mặc định',
  variantSku: 'SKU-1',
  quantity: 1,
  unitPriceMinor: 10000,
  payableLineMinor: 10000,
  weightGrams: 100,
};

function response(
  state:
    | 'PENDING_CONFIRMATION'
    | 'CONFIRMED'
    | 'PREPARING'
    | 'READY_FOR_PICKUP'
    | 'HANDED_OFF' = 'PENDING_CONFIRMATION',
  version = 0,
) {
  const status =
    state === 'HANDED_OFF'
      ? 'SHIPPING'
      : state === 'PENDING_CONFIRMATION'
        ? 'PENDING_CONFIRMATION'
        : 'AWAITING_PICKUP';
  const actions =
    state === 'PENDING_CONFIRMATION'
      ? [
          { action: 'CONFIRM', reasonCodes: [] },
          { action: 'REJECT', reasonCodes: ['OUT_OF_STOCK', 'OTHER'] },
        ]
      : state === 'CONFIRMED'
        ? [{ action: 'START_PREPARING', reasonCodes: [] }]
        : state === 'PREPARING'
          ? [{ action: 'MARK_READY_FOR_PICKUP', reasonCodes: [] }]
          : state === 'READY_FOR_PICKUP'
            ? [{ action: 'HAND_OFF', reasonCodes: [] }]
            : [];
  const summary = {
    orderReference,
    purchaseReference: '00000000-0000-4000-8000-000000000002',
    shopId,
    status,
    paymentStatus: 'UNPAID',
    fulfillmentState: state,
    orderVersion: state === 'PENDING_CONFIRMATION' ? 0 : 1,
    fulfillmentVersion: version,
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    lineCount: 1,
    itemQuantity: 1,
    payableTotalMinor: 10000,
    shippingService: 'STANDARD',
    deadline: {
      confirmationAt: '2026-08-19T00:00:00.000Z',
      handoffAt: state === 'PENDING_CONFIRMATION' ? null : '2026-08-20T00:00:00.000Z',
      confirmationOverdue: false,
      handoffOverdue: false,
    },
    lines: [line],
    availableActions: actions,
  };
  return {
    sellerOrderVersion: 'seller-orders-v1',
    currency: 'VND',
    order: {
      summary,
      shop: { id: shopId, slug: 'shop', name: 'Shop', pickupAddress: null },
      buyerNote: '',
      address: {
        recipientName: 'Người nhận',
        phoneNumber: '0912345678',
        province: 'Hà Nội',
        district: 'Quận 1',
        ward: 'Phường 1',
        addressLine: 'Số 1',
      },
      shipping: {
        provider: 'MOCK',
        version: 'mock-v1',
        shopId,
        originProvince: 'Hà Nội',
        destinationProvince: 'Hà Nội',
        zone: 'SAME_PROVINCE',
        shipmentWeightGrams: 100,
        service: 'STANDARD',
        estimatedDaysMin: 1,
        estimatedDaysMax: 2,
        baseFeeMinor: 0,
        zoneSurchargeMinor: 0,
        weightSurchargeMinor: 0,
        shippingFeeMinor: 0,
      },
      listSubtotalMinor: 10000,
      productDiscountMinor: 0,
      merchandiseSubtotalMinor: 10000,
      voucherDiscountMinor: 0,
      shippingPayableMinor: 0,
      payableTotalMinor: 10000,
      fulfillmentTimeline: [
        {
          id: 'event-1',
          previousState: null,
          state,
          version,
          actorType: 'SELLER',
          actorUserId: null,
          action:
            state === 'PENDING_CONFIRMATION'
              ? 'ORDER_CREATED'
              : state === 'HANDED_OFF'
                ? 'HAND_OFF'
                : state,
          reasonCode: 'TEST',
          reasonNote: null,
          late: false,
          occurredAt: '2026-08-18T00:00:00.000Z',
        },
      ],
      orderTimeline: [],
      shipment: null,
    },
  };
}

test('seller can progress an order through the fulfillment journey', async ({ page }) => {
  let state:
    'PENDING_CONFIRMATION' | 'CONFIRMED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'HANDED_OFF' =
    'PENDING_CONFIRMATION';
  let fulfillmentVersion = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-18T00:00:00.000Z',
        user: {
          id: '00000000-0000-4000-8000-000000000010',
          email: 'seller@example.test',
          displayName: 'Seller',
          status: 'active',
          roles: ['buyer', 'seller'],
        },
      }),
    });
    if (!path.startsWith('/api/v1/seller/orders')) return route.continue();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.endsWith('/seller/orders'))
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sellerOrderVersion: 'seller-orders-v1',
          items: [response(state, fulfillmentVersion).order.summary],
          page: { limit: 20, nextCursor: null },
        }),
      });
    if (request.method() === 'GET')
      return route.fulfill({
        status: 200,
        headers: {
          ETag: `"seller-order-${state === 'PENDING_CONFIRMATION' ? 0 : 1}-${fulfillmentVersion}"`,
        },
        contentType: 'application/json',
        body: JSON.stringify(response(state, fulfillmentVersion)),
      });
    if (request.method() === 'POST') {
      const action = request.postDataJSON().action;
      state =
        action === 'CONFIRM'
          ? 'CONFIRMED'
          : action === 'START_PREPARING'
            ? 'PREPARING'
            : action === 'MARK_READY_FOR_PICKUP'
              ? 'READY_FOR_PICKUP'
              : 'HANDED_OFF';
      fulfillmentVersion += 1;
      return route.fulfill({
        status: 200,
        headers: {
          ETag: `"seller-order-${state === 'CONFIRMED' || state === 'PREPARING' || state === 'READY_FOR_PICKUP' || state === 'HANDED_OFF' ? 1 : 0}-${fulfillmentVersion}"`,
        },
        contentType: 'application/json',
        body: JSON.stringify(response(state, fulfillmentVersion)),
      });
    }
    return route.continue();
  });
  await page.goto('/seller/orders');
  await expect(page.getByText('Bình nước seller')).toBeVisible();
  await page.getByText(/Đơn #/).click();
  await expect(page.getByText('Xác nhận đơn')).toBeVisible();
  for (const action of [
    'Xác nhận đơn',
    'Bắt đầu chuẩn bị',
    'Sẵn sàng lấy hàng',
    'Bàn giao vận chuyển',
  ]) {
    await page.getByRole('button', { name: action }).click();
    await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  }
  await expect(page.getByText('Đã bàn giao', { exact: true }).first()).toBeVisible();
});

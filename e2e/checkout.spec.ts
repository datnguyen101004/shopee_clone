import AxeBuilder from '@axe-core/playwright';
import type {
  CartResponse,
  CheckoutPreviewResponse,
  PurchaseResult,
} from '@shopee-clone/contracts';
import { expect, test, type Page, type Route } from '@playwright/test';

const ids = {
  buyer: '10000000-0000-4000-8000-000000000001',
  address: '10000000-0000-4000-8000-000000000002',
  shopA: '10000000-0000-4000-8000-000000000003',
  shopB: '10000000-0000-4000-8000-000000000004',
  lineA: '10000000-0000-4000-8000-000000000005',
  lineB: '10000000-0000-4000-8000-000000000006',
  productA: '10000000-0000-4000-8000-000000000007',
  productB: '10000000-0000-4000-8000-000000000008',
  variantA: '10000000-0000-4000-8000-000000000009',
  variantB: '10000000-0000-4000-8000-000000000010',
  purchase: '10000000-0000-4000-8000-000000000011',
  orderA: '10000000-0000-4000-8000-000000000012',
  orderB: '10000000-0000-4000-8000-000000000013',
};
const fingerprint = 'a'.repeat(64);
const address = {
  id: ids.address,
  recipientName: 'Nguyễn Văn An',
  phoneNumber: '0900000000',
  province: 'Thành phố Hồ Chí Minh',
  district: 'Quận 1',
  ward: 'Phường Bến Nghé',
  addressLine: '1 Nguyễn Huệ',
  label: 'Nhà',
};
const summary = {
  selectedLineCount: 2,
  selectedQuantity: 2,
  listSubtotalMinor: 300_000,
  productDiscountMinor: 0,
  merchandiseSubtotalMinor: 300_000,
  shippingTotalMinor: 44_000,
  shopVoucherDiscountMinor: 0,
  platformVoucherDiscountMinor: 0,
  merchandiseVoucherDiscountMinor: 0,
  shippingVoucherDiscountMinor: 0,
  voucherDiscountMinor: 0,
  shippingPayableMinor: 44_000,
  payableTotalMinor: 344_000,
};

function shipping(shopId: string) {
  return {
    provider: 'MOCK' as const,
    version: 'mock-v1' as const,
    shopId,
    originProvince: 'Thành phố Hồ Chí Minh',
    destinationProvince: 'Thành phố Hồ Chí Minh',
    zone: 'SAME_PROVINCE' as const,
    shipmentWeightGrams: 500,
    service: 'STANDARD' as const,
    estimatedDaysMin: 2,
    estimatedDaysMax: 4,
    baseFeeMinor: 22_000,
    zoneSurchargeMinor: 0,
    weightSurchargeMinor: 0,
    shippingFeeMinor: 22_000,
  };
}
function line(
  lineId: string,
  productId: string,
  variantId: string,
  price: number,
  productName: string,
) {
  return {
    lineId,
    productId,
    variantId,
    quantity: 1,
    unitWeightGrams: 500,
    shipmentWeightGrams: 500,
    listUnitPriceMinor: price,
    sellingUnitPriceMinor: price,
    listSubtotalMinor: price,
    productDiscountMinor: 0,
    merchandiseSubtotalMinor: price,
    shopVoucherDiscountMinor: 0,
    platformVoucherDiscountMinor: 0,
    merchandiseVoucherDiscountMinor: 0,
    payableMerchandiseMinor: price,
    productName,
    productImageUrl: null,
    variantName: 'Mặc định',
    variantSku: `SKU-${variantId.slice(-2)}`,
  };
}
function shop(shopId: string, slug: string, name: string, orderLine: ReturnType<typeof line>) {
  return {
    shop: { id: shopId, slug, name },
    note: '',
    lines: [orderLine],
    shipping: shipping(shopId),
    listSubtotalMinor: orderLine.listSubtotalMinor,
    productDiscountMinor: 0,
    merchandiseSubtotalMinor: orderLine.merchandiseSubtotalMinor,
    shopVoucherDiscountMinor: 0,
    platformVoucherDiscountMinor: 0,
    merchandiseVoucherDiscountMinor: 0,
    shippingVoucherDiscountMinor: 0,
    voucherDiscountMinor: 0,
    shippingPayableMinor: 22_000,
    payableTotalMinor: orderLine.merchandiseSubtotalMinor + 22_000,
  };
}
const shopA = shop(
  ids.shopA,
  'bach-hoa-xanh',
  'Bách Hóa Xanh',
  line(ids.lineA, ids.productA, ids.variantA, 100_000, 'Nước khoáng La Vie'),
);
const shopB = shop(
  ids.shopB,
  'thiet-bi-hay',
  'Thiết Bị Hay',
  line(ids.lineB, ids.productB, ids.variantB, 200_000, 'Tai nghe Bluetooth'),
);
const preview: CheckoutPreviewResponse = {
  checkoutVersion: 'checkout-v1',
  pricingVersion: 'pricing-v2',
  voucherVersion: 'voucher-v1',
  shippingVersion: 'mock-v1',
  currency: 'VND',
  evaluatedAt: '2026-08-14T05:00:00.000Z',
  cartVersion: 7,
  ready: true,
  checkoutFingerprint: fingerprint,
  address,
  shops: [shopA, shopB],
  vouchers: [],
  exclusions: [],
  blockers: [],
  summary,
};
const purchase: PurchaseResult = {
  checkoutVersion: 'checkout-v1',
  pricingVersion: 'pricing-v2',
  voucherVersion: 'voucher-v1',
  shippingVersion: 'mock-v1',
  currency: 'VND',
  purchaseReference: ids.purchase,
  createdAt: '2026-08-14T05:01:00.000Z',
  sourceCartVersion: 7,
  paymentMethod: 'COD',
  paymentStatus: 'UNPAID',
  address,
  orders: [
    {
      ...shopA,
      orderReference: ids.orderA,
      status: 'PENDING_CONFIRMATION',
      paymentStatus: 'UNPAID',
    },
    {
      ...shopB,
      orderReference: ids.orderB,
      status: 'PENDING_CONFIRMATION',
      paymentStatus: 'UNPAID',
    },
  ],
  vouchers: [],
  summary,
};
const cart: CartResponse = {
  owner: 'authenticated',
  version: 7,
  groups: [
    {
      shop: { ...shopA.shop, href: `/shops/${shopA.shop.slug}` },
      lines: [
        {
          id: ids.lineA,
          product: {
            id: ids.productA,
            name: shopA.lines[0]!.productName,
            href: `/products/${ids.productA}`,
            imageUrl: null,
            imageAlt: shopA.lines[0]!.productName,
          },
          variant: { id: ids.variantA, name: 'Mặc định' },
          unitPriceMinor: 100_000,
          previousUnitPriceMinor: null,
          availableQuantity: 10,
          maxPurchaseQuantity: 10,
          quantity: 1,
          selected: true,
          effectivelySelected: true,
          eligible: true,
          lineSubtotalMinor: 100_000,
          issues: [],
        },
      ],
      eligibleLineCount: 1,
      selectedEligibleLineCount: 1,
    },
    {
      shop: { ...shopB.shop, href: `/shops/${shopB.shop.slug}` },
      lines: [
        {
          id: ids.lineB,
          product: {
            id: ids.productB,
            name: shopB.lines[0]!.productName,
            href: `/products/${ids.productB}`,
            imageUrl: null,
            imageAlt: shopB.lines[0]!.productName,
          },
          variant: { id: ids.variantB, name: 'Mặc định' },
          unitPriceMinor: 200_000,
          previousUnitPriceMinor: null,
          availableQuantity: 10,
          maxPurchaseQuantity: 10,
          quantity: 1,
          selected: true,
          effectivelySelected: true,
          eligible: true,
          lineSubtotalMinor: 200_000,
          issues: [],
        },
      ],
      eligibleLineCount: 1,
      selectedEligibleLineCount: 1,
    },
  ],
  summary: {
    distinctLineCount: 2,
    selectedValidLineCount: 2,
    selectedValidQuantity: 2,
    selectedMerchandiseSubtotalMinor: 300_000,
  },
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

async function installCheckout(page: Page) {
  let confirmations = 0;
  let purchaseReads = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') {
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
    } else if (request.method() === 'GET' && path === '/api/v1/cart') {
      await json(route, cart, 200, { ETag: '"cart-7"' });
    } else if (request.method() === 'GET' && path === '/api/v1/account/addresses') {
      await json(route, {
        items: [
          {
            ...address,
            isDefault: true,
            createdAt: '2026-08-14T00:00:00.000Z',
            updatedAt: '2026-08-14T00:00:00.000Z',
          },
        ],
      });
    } else if (request.method() === 'POST' && path === '/api/v1/checkout/preview') {
      expect(request.headers()['if-match']).toBe('"cart-7"');
      expect(request.postData()).not.toContain('TotalMinor');
      await json(route, preview, 200, { ETag: '"cart-7"' });
    } else if (request.method() === 'POST' && path === '/api/v1/checkout/cod') {
      confirmations += 1;
      expect(request.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
      await new Promise((resolve) => setTimeout(resolve, 180));
      await json(route, { replayed: false, purchase }, 201, { ETag: '"cart-8"' });
    } else if (
      request.method() === 'GET' &&
      path === `/api/v1/checkout/purchases/${ids.purchase}`
    ) {
      purchaseReads += 1;
      await json(route, purchase);
    } else {
      await route.fulfill({ status: 404 });
    }
  });
  return { confirmations: () => confirmations, purchaseReads: () => purchaseReads };
}

async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
}

test.describe('authenticated COD checkout', () => {
  test('reviews two shops, prevents duplicate submit, and reloads confirmation', async ({
    page,
  }) => {
    const calls = await installCheckout(page);
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Thanh toán', exact: true })).toBeVisible();
    await expect(page.getByText('Bách Hóa Xanh')).toBeVisible();
    await expect(page.getByText('Thiết Bị Hay')).toBeVisible();
    await expect(page.getByText('344.000₫').last()).toBeVisible();
    await page
      .getByPlaceholder('Ví dụ: Giao trong giờ hành chính')
      .first()
      .fill('Giao giờ hành chính');
    const orderButton = page.getByRole('button', { name: 'Đặt hàng' });
    await orderButton.dblclick();
    await expect(page).toHaveURL(`/checkout/success/${ids.purchase}`);
    await expect(page.getByRole('heading', { name: 'Cảm ơn bạn đã mua hàng' })).toBeVisible();
    expect(calls.confirmations()).toBe(1);
    await expect(page.getByText(/Mã đơn shop:/)).toHaveCount(2);
    await expectNoOverflow(page);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    await page.reload();
    await expect(page.getByText(ids.purchase, { exact: false })).toBeVisible();
    expect(calls.purchaseReads()).toBeGreaterThanOrEqual(2);
  });
});

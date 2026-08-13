import AxeBuilder from '@axe-core/playwright';
import type {
  CartResponse,
  PricingQuoteResponse,
  ShippingServiceCode,
} from '@shopee-clone/contracts';
import { expect, test, type Page, type Route } from '@playwright/test';

const ids = {
  shopOne: '10000000-0000-4000-8000-000000000011',
  shopTwo: '10000000-0000-4000-8000-000000000012',
  productOne: '20000000-0000-4000-8000-000000000011',
  productTwo: '20000000-0000-4000-8000-000000000012',
  lineOne: '30000000-0000-4000-8000-000000000011',
  lineTwo: '30000000-0000-4000-8000-000000000012',
  variantOne: '40000000-0000-4000-8000-000000000011',
  variantTwo: '40000000-0000-4000-8000-000000000012',
  addressSouth: '50000000-0000-4000-8000-000000000011',
  addressNorth: '50000000-0000-4000-8000-000000000012',
};

const cart: CartResponse = {
  owner: 'authenticated',
  version: 7,
  groups: [
    {
      shop: {
        id: ids.shopOne,
        slug: 'bach-hoa-xanh',
        name: 'Bách Hóa Xanh',
        href: '/shops/bach-hoa-xanh',
      },
      lines: [
        {
          id: ids.lineOne,
          product: {
            id: ids.productOne,
            name: 'Nước khoáng La Vie',
            href: `/products/${ids.productOne}`,
            imageUrl: null,
            imageAlt: 'Nước khoáng La Vie',
          },
          variant: { id: ids.variantOne, name: 'Thùng 24 chai' },
          unitPriceMinor: 200_000,
          previousUnitPriceMinor: null,
          availableQuantity: 8,
          maxPurchaseQuantity: 8,
          quantity: 2,
          selected: true,
          effectivelySelected: true,
          eligible: true,
          lineSubtotalMinor: 400_000,
          issues: [],
        },
      ],
      selectedEligibleLineCount: 1,
      eligibleLineCount: 1,
    },
    {
      shop: {
        id: ids.shopTwo,
        slug: 'thiet-bi-hay',
        name: 'Thiết Bị Hay',
        href: '/shops/thiet-bi-hay',
      },
      lines: [
        {
          id: ids.lineTwo,
          product: {
            id: ids.productTwo,
            name: 'Tai nghe Bluetooth',
            href: `/products/${ids.productTwo}`,
            imageUrl: null,
            imageAlt: 'Tai nghe Bluetooth',
          },
          variant: { id: ids.variantTwo, name: 'Màu đen' },
          unitPriceMinor: 100_000,
          previousUnitPriceMinor: null,
          availableQuantity: 5,
          maxPurchaseQuantity: 5,
          quantity: 1,
          selected: true,
          effectivelySelected: true,
          eligible: true,
          lineSubtotalMinor: 100_000,
          issues: [],
        },
      ],
      selectedEligibleLineCount: 1,
      eligibleLineCount: 1,
    },
  ],
  summary: {
    distinctLineCount: 2,
    selectedValidLineCount: 2,
    selectedValidQuantity: 3,
    selectedMerchandiseSubtotalMinor: 500_000,
  },
};

const addresses = [
  {
    id: ids.addressSouth,
    recipientName: 'Nguyễn Văn An',
    phoneNumber: '0900000000',
    province: 'Thành phố Hồ Chí Minh',
    district: 'Quận 1',
    ward: 'Phường Bến Nghé',
    addressLine: '1 Nguyễn Huệ',
    label: 'Nhà',
    isDefault: true,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  },
  {
    id: ids.addressNorth,
    recipientName: 'Nguyễn Văn An',
    phoneNumber: '0900000000',
    province: 'Hà Nội',
    district: 'Ba Đình',
    ward: 'Phúc Xá',
    addressLine: '1 Hồng Hà',
    label: 'Văn phòng',
    isDefault: false,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  },
];

const serviceRules: Record<
  ShippingServiceCode,
  { base: number; block: number; min: number; max: number }
> = {
  ECONOMY: { base: 15_000, block: 3_000, min: 4, max: 6 },
  STANDARD: { base: 22_000, block: 4_000, min: 2, max: 4 },
  EXPRESS: { base: 35_000, block: 6_000, min: 1, max: 2 },
};

function buildQuote(
  addressId: string,
  selectedServices: Array<{ shopId: string; service: ShippingServiceCode }>,
): PricingQuoteResponse {
  const destinationNorth = addressId === ids.addressNorth;
  const address = destinationNorth ? addresses[1]! : addresses[0]!;
  const serviceFor = (shopId: string) =>
    selectedServices.find((selection) => selection.shopId === shopId)?.service ?? 'STANDARD';
  const shopInput = [
    {
      id: ids.shopOne,
      slug: 'bach-hoa-xanh',
      name: 'Bách Hóa Xanh',
      origin: 'Thành phố Hồ Chí Minh',
      lineId: ids.lineOne,
      productId: ids.productOne,
      variantId: ids.variantOne,
      quantity: 2,
      weight: 600,
      list: 220_000,
      selling: 200_000,
      zone: destinationNorth ? ('CROSS_REGION' as const) : ('SAME_PROVINCE' as const),
    },
    {
      id: ids.shopTwo,
      slug: 'thiet-bi-hay',
      name: 'Thiết Bị Hay',
      origin: 'Đà Nẵng',
      lineId: ids.lineTwo,
      productId: ids.productTwo,
      variantId: ids.variantTwo,
      quantity: 1,
      weight: 300,
      list: 120_000,
      selling: 100_000,
      zone: 'CROSS_REGION' as const,
    },
  ];
  const shops = shopInput.map((input) => {
    const service = serviceFor(input.id);
    const rule = serviceRules[service];
    const shipmentWeight = input.weight * input.quantity;
    const zoneSurcharge = input.zone === 'SAME_PROVINCE' ? 0 : 12_000;
    const extraBlocks = Math.ceil(Math.max(0, shipmentWeight - 500) / 500);
    const weightSurcharge = extraBlocks * rule.block;
    const shippingFee = rule.base + zoneSurcharge + weightSurcharge;
    const listSubtotal = input.list * input.quantity;
    const merchandiseSubtotal = input.selling * input.quantity;
    return {
      shop: { id: input.id, slug: input.slug, name: input.name },
      lines: [
        {
          lineId: input.lineId,
          productId: input.productId,
          variantId: input.variantId,
          quantity: input.quantity,
          unitWeightGrams: input.weight,
          shipmentWeightGrams: shipmentWeight,
          listUnitPriceMinor: input.list,
          sellingUnitPriceMinor: input.selling,
          listSubtotalMinor: listSubtotal,
          productDiscountMinor: listSubtotal - merchandiseSubtotal,
          merchandiseSubtotalMinor: merchandiseSubtotal,
        },
      ],
      shipping: {
        provider: 'MOCK' as const,
        version: 'mock-v1' as const,
        shopId: input.id,
        originProvince: input.origin,
        destinationProvince: address.province,
        zone: input.zone,
        shipmentWeightGrams: shipmentWeight,
        service,
        estimatedDaysMin: rule.min,
        estimatedDaysMax: rule.max,
        baseFeeMinor: rule.base,
        zoneSurchargeMinor: zoneSurcharge,
        weightSurchargeMinor: weightSurcharge,
        shippingFeeMinor: shippingFee,
      },
      listSubtotalMinor: listSubtotal,
      productDiscountMinor: listSubtotal - merchandiseSubtotal,
      merchandiseSubtotalMinor: merchandiseSubtotal,
      payableTotalMinor: merchandiseSubtotal + shippingFee,
    };
  });
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const listSubtotal = sum(shops.map((shop) => shop.listSubtotalMinor));
  const merchandiseSubtotal = sum(shops.map((shop) => shop.merchandiseSubtotalMinor));
  const shippingTotal = sum(shops.map((shop) => shop.shipping.shippingFeeMinor));
  return {
    pricingVersion: 'pricing-v1',
    shippingVersion: 'mock-v1',
    currency: 'VND',
    cartVersion: cart.version,
    address: { id: address.id, province: address.province, district: address.district },
    shops,
    exclusions: [],
    summary: {
      selectedLineCount: 2,
      selectedQuantity: 3,
      listSubtotalMinor: listSubtotal,
      productDiscountMinor: listSubtotal - merchandiseSubtotal,
      merchandiseSubtotalMinor: merchandiseSubtotal,
      shippingTotalMinor: shippingTotal,
      payableTotalMinor: merchandiseSubtotal + shippingTotal,
    },
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function routePricingJourney(
  page: Page,
  options: { addresses?: typeof addresses; staleOnce?: boolean } = {},
) {
  let cartReads = 0;
  let quoteRequests: Array<Record<string, unknown>> = [];
  let stalePending = Boolean(options.staleOnce);
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') {
      await fulfillJson(route, {
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-13T03:00:00.000Z',
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          email: 'buyer@example.test',
          displayName: 'Buyer Example',
          status: 'active',
          roles: ['buyer'],
        },
      });
      return;
    }
    if (request.method() === 'GET' && path === '/api/v1/cart') {
      cartReads += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: `"cart-${cart.version}"` },
        body: JSON.stringify(cart),
      });
      return;
    }
    if (request.method() === 'GET' && path === '/api/v1/account/addresses') {
      await fulfillJson(route, { items: options.addresses ?? addresses });
      return;
    }
    if (request.method() === 'POST' && path === '/api/v1/cart/quote') {
      const body = request.postDataJSON() as {
        shippingAddressId: string;
        services: Array<{ shopId: string; service: ShippingServiceCode }>;
      };
      quoteRequests.push(body);
      expect(Object.keys(body).sort()).toEqual(['services', 'shippingAddressId']);
      expect(request.headers()['if-match']).toBe(`"cart-${cart.version}"`);
      if (stalePending) {
        stalePending = false;
        await fulfillJson(
          route,
          {
            type: 'https://shopee-clone.local/problems/pricing-conflict',
            title: 'Cart changed',
            status: 409,
            detail: 'Reload the cart before requesting another quote.',
          },
          409,
        );
        return;
      }
      if (body.services.some(({ service }) => service === 'EXPRESS')) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      try {
        await fulfillJson(route, buildQuote(body.shippingAddressId, body.services));
      } catch {
        // An intentionally superseded request may already have been aborted by the browser.
      }
      return;
    }
    await route.fallback();
  });
  return {
    cartReads: () => cartReads,
    quoteRequests: () => quoteRequests,
  };
}

async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
}

test.describe('authoritative pricing and mock shipping', () => {
  test('does not access a private quote before login', async ({ page }) => {
    let privateRequests = 0;
    await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 401 }));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/v1/cart/quote') privateRequests += 1;
    });

    await page.goto('/cart');
    await expect(
      page.getByRole('heading', { name: 'Đăng nhập để sử dụng giỏ hàng' }),
    ).toBeVisible();
    expect(privateRequests).toBe(0);
  });

  test('shows a validated multi-shop quote and keeps the newest service/address choice', async ({
    page,
  }) => {
    const journey = await routePricingJourney(page);
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Địa chỉ và vận chuyển' })).toBeVisible();
    await expect(page.getByText('Tổng shop: 430.000₫')).toBeVisible();
    await expect(page.getByText('Tổng shop: 134.000₫')).toBeVisible();
    await expect(page.getByText('564.000₫', { exact: true })).toBeVisible();
    expect(journey.quoteRequests()[0]).toEqual({
      shippingAddressId: ids.addressSouth,
      services: [
        { shopId: ids.shopOne, service: 'STANDARD' },
        { shopId: ids.shopTwo, service: 'STANDARD' },
      ],
    });

    const firstService = page.getByLabel('Dịch vụ giao hàng Bách Hóa Xanh');
    await firstService.selectOption('EXPRESS');
    await firstService.selectOption('ECONOMY');
    await expect(page.getByText('555.000₫', { exact: true })).toBeVisible();
    await page.waitForTimeout(200);
    await expect(page.getByText('555.000₫', { exact: true })).toBeVisible();

    await page.getByLabel('Địa chỉ nhận hàng').selectOption(ids.addressNorth);
    await expect(page.getByText('567.000₫', { exact: true })).toBeVisible();
    await expect(page.getByText('MOCK · 4–6 ngày · 33.000₫')).toBeVisible();
    await expectNoOverflow(page);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(
      accessibility.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });

  test('hands off safely to address management when no address exists', async ({ page }) => {
    const journey = await routePricingJourney(page, { addresses: [] });
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Cần địa chỉ nhận hàng' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Quản lý địa chỉ' })).toHaveAttribute(
      'href',
      '/account/addresses',
    );
    expect(journey.quoteRequests()).toHaveLength(0);
    await expectNoOverflow(page);
  });

  test('reloads the cart and recovers after a stale quote conflict', async ({ page }) => {
    const journey = await routePricingJourney(page, { staleOnce: true });
    await page.goto('/cart');
    await expect(page.getByText('564.000₫', { exact: true })).toBeVisible();
    expect(journey.quoteRequests()).toHaveLength(2);
    expect(journey.cartReads()).toBeGreaterThanOrEqual(2);
  });
});

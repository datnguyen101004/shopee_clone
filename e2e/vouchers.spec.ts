import AxeBuilder from '@axe-core/playwright';
import type {
  CartResponse,
  PricingQuoteRequest,
  PricingQuoteResponse,
  VoucherSelectionResult,
} from '@shopee-clone/contracts';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';

const ids = {
  shop: '10000000-0000-4000-8000-000000000011',
  product: '20000000-0000-4000-8000-000000000011',
  line: '30000000-0000-4000-8000-000000000011',
  variant: '40000000-0000-4000-8000-000000000011',
  address: '50000000-0000-4000-8000-000000000011',
};

const cart: CartResponse = {
  owner: 'authenticated',
  version: 18,
  groups: [
    {
      shop: {
        id: ids.shop,
        slug: 'bach-hoa-xanh',
        name: 'Bách Hóa Xanh',
        href: '/shops/bach-hoa-xanh',
      },
      lines: [
        {
          id: ids.line,
          product: {
            id: ids.product,
            name: 'Nước khoáng La Vie',
            href: `/products/${ids.product}`,
            imageUrl: null,
            imageAlt: 'Nước khoáng La Vie',
          },
          variant: { id: ids.variant, name: 'Thùng 24 chai' },
          unitPriceMinor: 200_000,
          previousUnitPriceMinor: null,
          availableQuantity: 8,
          maxPurchaseQuantity: 8,
          quantity: 1,
          selected: true,
          effectivelySelected: true,
          eligible: true,
          lineSubtotalMinor: 200_000,
          issues: [],
        },
      ],
      selectedEligibleLineCount: 1,
      eligibleLineCount: 1,
    },
  ],
  summary: {
    distinctLineCount: 1,
    selectedValidLineCount: 1,
    selectedValidQuantity: 1,
    selectedMerchandiseSubtotalMinor: 200_000,
  },
};

function selectionResult(
  code: string,
  slot: 'PLATFORM' | 'SHOP' | 'FREE_SHIPPING',
  discountMinor: number,
): VoucherSelectionResult {
  if (code === 'EXPIRED-10K') {
    return {
      code,
      slot,
      shopId: slot === 'SHOP' ? ids.shop : null,
      status: 'REJECTED',
      name: 'Mã đã hết hạn',
      issuer: slot === 'SHOP' ? 'SHOP' : 'PLATFORM',
      benefitType: slot === 'FREE_SHIPPING' ? 'FREE_SHIPPING' : 'FIXED_AMOUNT',
      rejectionReason: 'EXPIRED',
      discountMinor: 0,
      merchandiseDiscountMinor: 0,
      shippingDiscountMinor: 0,
      allocations: [],
    };
  }
  const shipping = slot === 'FREE_SHIPPING';
  return {
    code,
    slot,
    shopId: slot === 'SHOP' ? ids.shop : null,
    status: 'APPLIED',
    name:
      slot === 'SHOP'
        ? 'Giảm 15% sản phẩm La Vie'
        : slot === 'PLATFORM'
          ? 'Shopee giảm 10%'
          : 'Miễn phí vận chuyển',
    issuer: slot === 'SHOP' ? 'SHOP' : 'PLATFORM',
    benefitType: shipping ? 'FREE_SHIPPING' : 'PERCENTAGE',
    rejectionReason: null,
    discountMinor,
    merchandiseDiscountMinor: shipping ? 0 : discountMinor,
    shippingDiscountMinor: shipping ? discountMinor : 0,
    allocations: [
      { shopId: ids.shop, lineId: shipping ? null : ids.line, amountMinor: discountMinor },
    ],
  };
}

function buildQuote(request: PricingQuoteRequest): PricingQuoteResponse {
  const shopCode = request.vouchers?.shopCodes?.find(({ shopId }) => shopId === ids.shop)?.code;
  const platformCode = request.vouchers?.platformCode;
  const freeShippingCode = request.vouchers?.freeShippingCode;
  const shopDiscount = shopCode === 'SHOP-15' ? 30_000 : 0;
  const platformDiscount = platformCode === 'PLATFORM-10' ? 17_000 : 0;
  const service = request.services?.[0]?.service ?? 'STANDARD';
  const shippingRule = {
    ECONOMY: { fee: 15_000, min: 4, max: 6 },
    STANDARD: { fee: 22_000, min: 2, max: 4 },
    EXPRESS: { fee: 35_000, min: 1, max: 2 },
  }[service];
  const shippingDiscount =
    freeShippingCode === 'FREESHIP-30K' ? Math.min(30_000, shippingRule.fee) : 0;
  const shippingPayable = shippingRule.fee - shippingDiscount;
  const payableMerchandise = 200_000 - shopDiscount - platformDiscount;
  const vouchers = [
    ...(shopCode ? [selectionResult(shopCode, 'SHOP', shopDiscount)] : []),
    ...(platformCode ? [selectionResult(platformCode, 'PLATFORM', platformDiscount)] : []),
    ...(freeShippingCode
      ? [selectionResult(freeShippingCode, 'FREE_SHIPPING', shippingDiscount)]
      : []),
  ];
  return {
    pricingVersion: 'pricing-v2',
    voucherVersion: 'voucher-v1',
    shippingVersion: 'mock-v1',
    currency: 'VND',
    evaluatedAt: '2026-08-14T00:00:00.000Z',
    cartVersion: cart.version,
    address: { id: ids.address, province: 'Thành phố Hồ Chí Minh', district: 'Quận 1' },
    shops: [
      {
        shop: { id: ids.shop, slug: 'bach-hoa-xanh', name: 'Bách Hóa Xanh' },
        lines: [
          {
            lineId: ids.line,
            productId: ids.product,
            variantId: ids.variant,
            quantity: 1,
            unitWeightGrams: 500,
            shipmentWeightGrams: 500,
            listUnitPriceMinor: 220_000,
            sellingUnitPriceMinor: 200_000,
            listSubtotalMinor: 220_000,
            productDiscountMinor: 20_000,
            merchandiseSubtotalMinor: 200_000,
            shopVoucherDiscountMinor: shopDiscount,
            platformVoucherDiscountMinor: platformDiscount,
            merchandiseVoucherDiscountMinor: shopDiscount + platformDiscount,
            payableMerchandiseMinor: payableMerchandise,
          },
        ],
        shipping: {
          provider: 'MOCK',
          version: 'mock-v1',
          shopId: ids.shop,
          originProvince: 'Thành phố Hồ Chí Minh',
          destinationProvince: 'Thành phố Hồ Chí Minh',
          zone: 'SAME_PROVINCE',
          shipmentWeightGrams: 500,
          service,
          estimatedDaysMin: shippingRule.min,
          estimatedDaysMax: shippingRule.max,
          baseFeeMinor: shippingRule.fee,
          zoneSurchargeMinor: 0,
          weightSurchargeMinor: 0,
          shippingFeeMinor: shippingRule.fee,
        },
        listSubtotalMinor: 220_000,
        productDiscountMinor: 20_000,
        merchandiseSubtotalMinor: 200_000,
        shopVoucherDiscountMinor: shopDiscount,
        platformVoucherDiscountMinor: platformDiscount,
        merchandiseVoucherDiscountMinor: shopDiscount + platformDiscount,
        shippingVoucherDiscountMinor: shippingDiscount,
        voucherDiscountMinor: shopDiscount + platformDiscount + shippingDiscount,
        shippingPayableMinor: shippingPayable,
        payableTotalMinor: payableMerchandise + shippingPayable,
      },
    ],
    vouchers,
    exclusions: [],
    summary: {
      selectedLineCount: 1,
      selectedQuantity: 1,
      listSubtotalMinor: 220_000,
      productDiscountMinor: 20_000,
      merchandiseSubtotalMinor: 200_000,
      shippingTotalMinor: shippingRule.fee,
      shopVoucherDiscountMinor: shopDiscount,
      platformVoucherDiscountMinor: platformDiscount,
      merchandiseVoucherDiscountMinor: shopDiscount + platformDiscount,
      shippingVoucherDiscountMinor: shippingDiscount,
      voucherDiscountMinor: shopDiscount + platformDiscount + shippingDiscount,
      shippingPayableMinor: shippingPayable,
      payableTotalMinor: payableMerchandise + shippingPayable,
    },
  };
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installJourney(page: Page) {
  const quoteRequests: PricingQuoteRequest[] = [];
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { ETag: `"cart-${cart.version}"` },
        body: JSON.stringify(cart),
      });
      return;
    }
    if (request.method() === 'GET' && path === '/api/v1/account/addresses') {
      await fulfillJson(route, {
        items: [
          {
            id: ids.address,
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
        ],
      });
      return;
    }
    if (request.method() === 'POST' && path === '/api/v1/cart/quote') {
      expect(request.headers()['if-match']).toBe(`"cart-${cart.version}"`);
      const body = request.postDataJSON() as PricingQuoteRequest;
      quoteRequests.push(body);
      await fulfillJson(route, buildQuote(body));
      return;
    }
    await route.fallback();
  });
  return quoteRequests;
}

async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
}

async function applyCode(input: Locator, code: string) {
  await input.fill(code);
  await input.locator('xpath=ancestor::form').getByRole('button', { name: 'Áp dụng' }).click();
}

test('applies, stacks, rejects, removes and requotes vouchers from server totals', async ({
  page,
}) => {
  const requests = await installJourney(page);
  await page.goto('/cart');
  await expect(page.getByText('222.000₫', { exact: true })).toBeVisible();

  const shopInput = page.getByRole('textbox', { name: /Mã giảm giá của Bách Hóa Xanh/ });
  await applyCode(shopInput, ' shop-15 ');
  await expect(page.getByText(/Đã áp dụng Giảm 15% sản phẩm La Vie/)).toBeVisible();

  const platformInput = page.getByRole('textbox', { name: /Mã Shopee/ });
  await applyCode(platformInput, 'platform-10');
  await expect(page.getByText(/Đã áp dụng Shopee giảm 10%/)).toBeVisible();
  const shippingInput = page.getByRole('textbox', { name: /Mã miễn phí vận chuyển/ });
  await applyCode(shippingInput, 'freeship-30k');

  await expect(page.getByText('153.000₫', { exact: true })).toBeVisible();
  expect(requests.at(-1)?.vouchers).toEqual({
    platformCode: 'PLATFORM-10',
    shopCodes: [{ shopId: ids.shop, code: 'SHOP-15' }],
    freeShippingCode: 'FREESHIP-30K',
  });

  await applyCode(platformInput, 'expired-10k');
  await expect(page.getByText('Mã giảm giá đã hết hạn.')).toBeVisible();
  await expect(page.getByText('170.000₫', { exact: true })).toBeVisible();

  await platformInput
    .locator('xpath=ancestor::form')
    .getByRole('button', { name: 'Bỏ mã' })
    .click();
  await expect(page.getByText('170.000₫', { exact: true })).toBeVisible();
  expect(requests.at(-1)?.vouchers).toEqual({
    shopCodes: [{ shopId: ids.shop, code: 'SHOP-15' }],
    freeShippingCode: 'FREESHIP-30K',
  });

  await page.getByLabel('Dịch vụ giao hàng Bách Hóa Xanh').selectOption('EXPRESS');
  await expect.poll(() => requests.at(-1)?.services?.[0]?.service).toBe('EXPRESS');
  expect(requests.at(-1)?.vouchers).toEqual({
    shopCodes: [{ shopId: ids.shop, code: 'SHOP-15' }],
    freeShippingCode: 'FREESHIP-30K',
  });

  await expectNoOverflow(page);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

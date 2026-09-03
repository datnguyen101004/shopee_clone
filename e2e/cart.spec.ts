import AxeBuilder from '@axe-core/playwright';
import type { CartLine, CartResponse } from '@shopee-clone/contracts';
import { expect, test, type Page, type Route } from '@playwright/test';

const ids = {
  shopOne: '10000000-0000-4000-8000-000000000001',
  shopTwo: '10000000-0000-4000-8000-000000000002',
  productOne: '20000000-0000-4000-8000-000000000001',
  productTwo: '20000000-0000-4000-8000-000000000002',
  lineOne: '30000000-0000-4000-8000-000000000001',
  lineTwo: '30000000-0000-4000-8000-000000000002',
  variantOne: '40000000-0000-4000-8000-000000000001',
  variantTwo: '40000000-0000-4000-8000-000000000002',
};

function createCart(): CartResponse {
  return recalculate({
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
            previousUnitPriceMinor: 120_000,
            availableQuantity: 5,
            maxPurchaseQuantity: 5,
            quantity: 1,
            selected: false,
            effectivelySelected: false,
            eligible: true,
            lineSubtotalMinor: 100_000,
            issues: [
              {
                code: 'price-changed',
                message: 'Giá sản phẩm đã thay đổi.',
                previousUnitPriceMinor: 120_000,
                currentUnitPriceMinor: 100_000,
                availableQuantity: null,
              },
            ],
          },
        ],
        selectedEligibleLineCount: 0,
        eligibleLineCount: 1,
      },
    ],
    summary: {
      distinctLineCount: 0,
      selectedValidLineCount: 0,
      selectedValidQuantity: 0,
      selectedMerchandiseSubtotalMinor: 0,
    },
  });
}

function recalculate(cart: CartResponse): CartResponse {
  for (const group of cart.groups) {
    for (const line of group.lines) {
      line.lineSubtotalMinor = line.unitPriceMinor * line.quantity;
      line.effectivelySelected = line.selected && line.eligible;
    }
    group.eligibleLineCount = group.lines.filter((line) => line.eligible).length;
    group.selectedEligibleLineCount = group.lines.filter((line) => line.effectivelySelected).length;
  }
  const lines = cart.groups.flatMap((group) => group.lines);
  const selected = lines.filter((line) => line.effectivelySelected);
  cart.summary = {
    distinctLineCount: lines.length,
    selectedValidLineCount: selected.length,
    selectedValidQuantity: selected.reduce((total, line) => total + line.quantity, 0),
    selectedMerchandiseSubtotalMinor: selected.reduce(
      (total, line) => total + line.lineSubtotalMinor,
      0,
    ),
  };
  return cart;
}

async function fulfillCart(
  route: Route,
  body: CartResponse | { cart: CartResponse; adjustments: unknown[] },
) {
  const cart = 'cart' in body ? body.cart : body;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'private, no-store', ETag: `"cart-${cart.version}"` },
    body: JSON.stringify(body),
  });
}

async function routeAuthenticatedCart(page: Page, initial: CartResponse) {
  let cart = initial;
  await page.route('**/api/v1/cart**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET' && path === '/api/v1/cart') {
      await fulfillCart(route, cart);
      return;
    }

    const body = request.postDataJSON() as {
      variantId?: string;
      quantity?: number;
      selected?: boolean;
    } | null;
    if (request.method() === 'POST' && path === '/api/v1/cart/items') {
      const quantity = body?.quantity ?? 1;
      const added: CartLine = {
        id: '30000000-0000-4000-8000-000000000003',
        product: {
          id: '20000000-0000-4000-8000-000000000003',
          name: 'Sản phẩm vừa thêm',
          href: '/products/20000000-0000-4000-8000-000000000003',
          imageUrl: null,
          imageAlt: 'Sản phẩm vừa thêm',
        },
        variant: { id: body?.variantId ?? ids.variantOne, name: 'Lựa chọn hiện tại' },
        unitPriceMinor: 50_000,
        previousUnitPriceMinor: null,
        availableQuantity: 10,
        maxPurchaseQuantity: 10,
        quantity,
        selected: true,
        effectivelySelected: true,
        eligible: true,
        lineSubtotalMinor: 50_000 * quantity,
        issues: [],
      };
      cart.groups[0]!.lines.push(added);
    } else if (request.method() === 'PATCH' && /\/items\/[^/]+$/.test(path)) {
      const lineId = path.split('/').at(-1);
      const line = cart.groups.flatMap((group) => group.lines).find((item) => item.id === lineId);
      if (line && body?.quantity) line.quantity = body.quantity;
    } else if (request.method() === 'DELETE' && /\/items\/[^/]+$/.test(path)) {
      const lineId = path.split('/').at(-1);
      for (const group of cart.groups)
        group.lines = group.lines.filter((line) => line.id !== lineId);
      cart.groups = cart.groups.filter((group) => group.lines.length > 0);
    } else if (request.method() === 'PUT' && path.endsWith('/selection')) {
      if (path === '/api/v1/cart/selection') {
        for (const line of cart.groups.flatMap((group) => group.lines))
          line.selected = Boolean(body?.selected);
      } else if (path.includes('/shops/')) {
        const shopId = path.split('/').at(-2);
        for (const line of cart.groups.find((group) => group.shop.id === shopId)?.lines ?? [])
          line.selected = Boolean(body?.selected);
      } else {
        const lineId = path.split('/').at(-2);
        const line = cart.groups.flatMap((group) => group.lines).find((item) => item.id === lineId);
        if (line) line.selected = Boolean(body?.selected);
      }
    } else {
      await route.fulfill({ status: 404 });
      return;
    }

    cart = recalculate({ ...cart, version: cart.version + 1 });
    await fulfillCart(route, { cart, adjustments: [] });
  });
  return () => cart;
}

async function restoreBuyer(page: Page) {
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-13T03:00:00.000Z',
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          email: 'buyer@example.test',
          displayName: 'Buyer Example',
          status: 'active',
          roles: ['buyer'],
        },
      }),
    });
  });
}

async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
}

test.describe('authenticated multi-shop cart', () => {
  test('requires login for product add and cart access without calling private cart APIs', async ({
    page,
    request,
  }) => {
    await page.route('**/api/v1/auth/refresh', async (route) => route.fulfill({ status: 401 }));
    let cartRequestCount = 0;
    page.on('request', (incoming) => {
      if (new URL(incoming.url()).pathname.startsWith('/api/v1/cart')) cartRequestCount += 1;
    });

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001';
    const catalog = await request.get(`${apiBaseUrl}/api/v1/catalog/products?pageSize=1`);
    expect(catalog.ok()).toBe(true);
    const product = (await catalog.json()).items[0] as { id: string };
    await page.goto(`/products/${product.id}`);
    const handoff = page.getByRole('link', { name: 'Thêm vào giỏ · Đăng nhập' });
    await expect(handoff).toHaveAttribute('href', /\/login\?intent=add-to-cart/);
    await handoff.click();
    await expect(page).toHaveURL(/\/login\?intent=add-to-cart/);

    await page.goto('/cart');
    await expect(
      page.getByRole('heading', { name: 'Đăng nhập để sử dụng giỏ hàng' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fcart',
    );
    expect(cartRequestCount).toBe(0);
    await expectNoOverflow(page);
  });

  test('adds and manages an authenticated cart using confirmed server responses', async ({
    page,
    request,
  }) => {
    await restoreBuyer(page);
    const currentCart = await routeAuthenticatedCart(page, createCart());
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001';
    const catalog = await request.get(`${apiBaseUrl}/api/v1/catalog/products?pageSize=1`);
    expect(catalog.ok()).toBe(true);
    const product = (await catalog.json()).items[0] as { id: string };

    await page.goto(`/products/${product.id}`);
    await page.getByRole('button', { name: 'Thêm vào giỏ hàng' }).click();
    await expect(page.getByText(/Đã thêm 1 sản phẩm vào giỏ hàng/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Giỏ hàng, 3 sản phẩm' })).toBeVisible();

    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Giỏ hàng của bạn' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bách Hóa Xanh' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Thiết Bị Hay' })).toBeVisible();
    await expect(page.getByText('Giá sản phẩm đã thay đổi.')).toBeVisible();

    const quantity = page.getByLabel('Nhập số lượng Nước khoáng La Vie');
    await quantity.fill('3');
    await quantity.press('Enter');
    await expect.poll(() => currentCart().groups[0]!.lines[0]!.quantity).toBe(3);

    const shopSelection = page.getByLabel('Chọn sản phẩm của Thiết Bị Hay');
    await expect(shopSelection).toBeEnabled();
    await shopSelection.evaluate((element: HTMLInputElement) => element.click());
    await expect.poll(() => currentCart().summary.selectedValidLineCount).toBe(3);
    await expect(shopSelection).toBeChecked();
    await expectNoOverflow(page);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(
      accessibility.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });

  test('buy now adds the product then navigates to cart', async ({ page, request }) => {
    await restoreBuyer(page);
    await routeAuthenticatedCart(page, createCart());
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001';
    const catalog = await request.get(`${apiBaseUrl}/api/v1/catalog/products?pageSize=1`);
    expect(catalog.ok()).toBe(true);
    const product = (await catalog.json()).items[0] as { id: string };

    await page.goto(`/products/${product.id}`);
    await page.getByRole('button', { name: 'Mua ngay' }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole('heading', { name: 'Giỏ hàng của bạn' })).toBeVisible();
  });
});

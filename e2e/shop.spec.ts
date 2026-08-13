import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';

const timestamp = '2026-08-14T03:00:00.000Z';
const unavailableTimestamp = '2026-08-13T03:00:00.000Z';
const unavailableShopId = '00000000-0000-4000-8000-000000000099';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer Example',
  status: 'active',
  roles: ['buyer'],
};

async function canonicalShop(request: APIRequestContext) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001';
  const catalog = await request.get(`${apiBaseUrl}/api/v1/catalog/products?pageSize=1`);
  expect(catalog.ok()).toBe(true);
  const item = (await catalog.json()).items[0] as { id: string; name: string };
  const detail = await request.get(`${apiBaseUrl}/api/v1/catalog/products/${item.id}`);
  expect(detail.ok()).toBe(true);
  const product = (await detail.json()) as {
    id: string;
    name: string;
    shop: { id: string; slug: string; name: string };
  };
  return product;
}

async function accessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(({ impact }) => ['serious', 'critical'].includes(impact ?? '')),
  ).toEqual([]);
}

function fulfillJson(route: Route, body: unknown) {
  const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    },
    body: JSON.stringify(body),
  });
}

function fulfillProblem(route: Route, status = 503) {
  const origin = route.request().headers().origin ?? 'http://127.0.0.1:3000';
  return route.fulfill({
    status,
    contentType: 'application/problem+json',
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify({
      type: 'https://shopee-clone.local/problems/shop-storefront-unavailable',
      title: 'Shop storefront temporarily unavailable',
      status,
      detail: 'The requested shop operation is temporarily unavailable.',
    }),
  });
}

function followedPage(
  shop: { id: string; slug: string; name: string },
  options: { items?: 'populated' | 'empty'; page?: number; totalItems?: number } = {},
) {
  const page = options.page ?? 1;
  const items =
    options.items === 'empty'
      ? []
      : [
          {
            availability: 'available',
            shopId: shop.id,
            followedAt: timestamp,
            shop: {
              id: shop.id,
              slug: shop.slug,
              name: shop.name,
              href: `/shops/${shop.slug}`,
              location: 'Hà Nội',
              followerCount: 12,
            },
          },
          ...(page === 1
            ? [
                {
                  availability: 'unavailable',
                  shopId: unavailableShopId,
                  followedAt: unavailableTimestamp,
                  shop: { id: unavailableShopId, name: 'Shop đã dừng', href: null },
                },
              ]
            : []),
        ];
  const totalItems = options.totalItems ?? items.length;
  return {
    items,
    pagination: { page, pageSize: 20, totalItems, totalPages: Math.ceil(totalItems / 20) },
  };
}

async function authenticate(page: Page) {
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-14T03:00:00.000Z',
        user,
      }),
    }),
  );
}

test.describe('public shop storefront and following', () => {
  test('navigates product-to-shop and renders scoped profile/catalog controls', async ({
    page,
    request,
  }) => {
    const product = await canonicalShop(request);
    await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 401 }));
    await page.goto(`/products/${product.id}`);
    await page.getByRole('link', { name: product.shop.name }).click();
    await expect(page).toHaveURL(new RegExp(`/shops/${product.shop.slug}$`));
    await expect(page.getByRole('heading', { name: product.shop.name, level: 1 })).toBeVisible();
    await expect(page.getByRole('search', { name: 'Tìm sản phẩm trong shop' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Đăng nhập để theo dõi' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Từ khóa' }).fill(product.name.split(' ')[0]!);
    await page.getByRole('button', { name: 'Áp dụng' }).click();
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByRole('heading', { name: 'Sản phẩm của shop' })).toBeVisible();
  });

  test('uses mocked buyer follow state and mutation without changing the developer database', async ({
    page,
    request,
  }) => {
    const product = await canonicalShop(request);
    await authenticate(page);
    let statusCalls = 0;
    let mutationCalls = 0;
    await page.route('**/api/v1/account/followed-shops/status?*', async (route) => {
      statusCalls += 1;
      const ids = new URL(route.request().url()).searchParams.get('shopIds')?.split(',') ?? [];
      expect(ids).toEqual([product.shop.id]);
      await fulfillJson(route, { items: [{ shopId: product.shop.id, isFollowing: false }] });
    });
    await page.route('**/api/v1/account/followed-shops/*', async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      mutationCalls += 1;
      await fulfillJson(route, {
        shopId: product.shop.id,
        isFollowing: true,
        followedAt: timestamp,
        followerCount: 12,
      });
    });
    await page.goto(`/shops/${product.shop.slug}`);
    const follow = page.getByRole('button', { name: 'Theo dõi' });
    await expect(follow).toBeEnabled();
    await follow.click();
    await expect(page.getByRole('button', { name: 'Đang theo dõi' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(statusCalls).toBe(1);
    expect(mutationCalls).toBe(1);
  });

  test('keeps guest handoff private, keyboard-operable, responsive, and accessible', async ({
    page,
    request,
  }) => {
    const product = await canonicalShop(request);
    await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 401 }));
    let mutations = 0;
    await page.route('**/api/v1/account/followed-shops/*', (route) => {
      mutations += 1;
      return route.abort();
    });
    await page.goto(`/shops/${product.shop.slug}`);
    const handoff = page.getByRole('link', { name: 'Đăng nhập để theo dõi' });
    await handoff.focus();
    await expect(handoff).toBeFocused();
    expect((await handoff.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
    expect(`${dimensions.local}${dimensions.session}`).not.toContain(product.shop.id);
    await accessible(page);
    await handoff.click();
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe(
      `/shops/${product.shop.slug}?sort=newest&page=1&pageSize=12`,
    );
    expect(mutations).toBe(0);
    expect(page.url()).not.toMatch(/shopId|followed-shops/);
  });

  test('navigates to the paginated account list and protects unavailable shop details', async ({
    page,
    request,
  }) => {
    const product = await canonicalShop(request);
    await authenticate(page);
    const requestedPages: number[] = [];
    await page.route('**/api/v1/account/followed-shops?*', async (route) => {
      const requestedPage = Number(new URL(route.request().url()).searchParams.get('page'));
      requestedPages.push(requestedPage);
      await fulfillJson(route, followedPage(product.shop, { page: requestedPage, totalItems: 21 }));
    });
    await page.goto('/');
    await page.getByRole('link', { name: 'Shop đang theo dõi' }).first().click();
    await expect(page).toHaveURL(/\/account\/followed-shops/);
    await expect(page.getByRole('heading', { name: 'Shop đang theo dõi', level: 1 })).toBeVisible();
    await expect(
      page.getByRole('link', { name: `Xem gian hàng ${product.shop.name}` }),
    ).toHaveAttribute('href', `/shops/${product.shop.slug}`);
    const unavailable = page.locator(`[data-shop-id="${unavailableShopId}"]`);
    await expect(unavailable).toContainText('Shop hiện không còn khả dụng');
    await expect(unavailable.getByRole('link')).toHaveCount(0);
    await expect(unavailable).not.toContainText('người theo dõi');
    await page.getByRole('link', { name: 'Trang 2' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByLabel('Trang 2')).toHaveAttribute('aria-current', 'page');
    expect(requestedPages.at(0)).toBe(1);
    expect(requestedPages.at(-1)).toBe(2);
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
    await accessible(page);
  });

  test('renders the authenticated empty followed-shops state', async ({ page }) => {
    await authenticate(page);
    await page.route('**/api/v1/account/followed-shops?*', (route) =>
      fulfillJson(route, {
        items: [],
        pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      }),
    );
    await page.goto('/account/followed-shops');
    await expect(page.getByRole('heading', { name: 'Chưa theo dõi shop nào' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Khám phá sản phẩm' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  test('confirms unfollow before removing the card and refetches the list', async ({
    page,
    request,
  }) => {
    const product = await canonicalShop(request);
    await authenticate(page);
    let removed = false;
    let listCalls = 0;
    await page.route('**/api/v1/account/followed-shops?*', async (route) => {
      listCalls += 1;
      await fulfillJson(
        route,
        removed
          ? followedPage(product.shop, { items: 'empty' })
          : followedPage(product.shop, { totalItems: 2 }),
      );
    });
    await page.route('**/api/v1/account/followed-shops/*', async (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      removed = true;
      await fulfillJson(route, {
        shopId: product.shop.id,
        isFollowing: false,
        followedAt: null,
        followerCount: 11,
      });
    });
    await page.goto('/account/followed-shops');
    const card = page.locator(`[data-shop-id="${product.shop.id}"]`);
    await card.getByRole('button', { name: `Bỏ theo dõi ${product.shop.name}` }).click();
    await expect(card).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Chưa theo dõi shop nào' })).toBeVisible();
    expect(listCalls).toBe(2);
  });

  test('retains the followed shop after a recoverable unfollow failure', async ({
    page,
    request,
  }) => {
    const product = await canonicalShop(request);
    await authenticate(page);
    await page.route('**/api/v1/account/followed-shops?*', (route) =>
      fulfillJson(route, followedPage(product.shop, { totalItems: 2 })),
    );
    await page.route('**/api/v1/account/followed-shops/*', (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      return fulfillProblem(route);
    });
    await page.goto('/account/followed-shops');
    const card = page.locator(`[data-shop-id="${product.shop.id}"]`);
    await card.getByRole('button', { name: `Bỏ theo dõi ${product.shop.name}` }).click();
    await expect(page.getByRole('status')).toContainText('Vui lòng thử lại');
    await expect(card).toBeVisible();
  });
});

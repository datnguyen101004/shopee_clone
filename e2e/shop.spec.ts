import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';

const timestamp = '2026-08-14T03:00:00.000Z';
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
});

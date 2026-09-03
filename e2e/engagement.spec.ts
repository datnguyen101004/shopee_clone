import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

const productId = '00000000-0000-4000-8000-000000000101';
const timestamp = '2026-08-13T03:00:00.000Z';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer Example',
  status: 'active',
  roles: ['buyer'],
};
const product = {
  id: productId,
  name: 'Sản phẩm yêu thích mẫu',
  href: `/products/${productId}`,
  imageUrl: null,
  imageAlt: 'Sản phẩm yêu thích mẫu',
  priceMinor: 129000,
  ratingAverageBasisPoints: 450,
  ratingCount: 12,
  soldCount: 34,
  shop: { name: 'Shopee Test Shop', location: 'Hà Nội' },
  category: { slug: 'thiet-bi-dien-tu', name: 'Thiết bị điện tử' },
};

async function accessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(({ impact }) => ['serious', 'critical'].includes(impact ?? '')),
  ).toEqual([]);
}

async function authenticate(page: Page) {
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-13T03:00:00.000Z',
        user,
      }),
    }),
  );
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

test.describe('favorites and recently viewed', () => {
  test('renders both protected account collections without behavioral URL or storage data', async ({
    page,
  }) => {
    await authenticate(page);
    await page.route('**/api/v1/account/favorites?page=1&pageSize=20', (route) =>
      fulfillJson(route, {
        items: [
          { availability: 'available', productId, favoritedAt: timestamp, product },
          {
            availability: 'unavailable',
            productId: '00000000-0000-4000-8000-000000000102',
            favoritedAt: '2026-08-13T02:00:00.000Z',
            product: {
              id: '00000000-0000-4000-8000-000000000102',
              name: 'Sản phẩm ngừng bán',
              href: null,
              imageUrl: null,
              imageAlt: 'Sản phẩm ngừng bán',
            },
          },
        ],
        pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
      }),
    );
    await page.route('**/api/v1/account/recently-viewed?page=1&pageSize=20', (route) =>
      fulfillJson(route, {
        items: [{ productId, lastViewedAt: timestamp, product }],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      }),
    );
    await page.goto('/account/favorites');
    await expect(page.getByRole('heading', { name: 'Sản phẩm yêu thích' })).toBeVisible();
    await expect(page.getByText('Sản phẩm ngừng bán')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Xóa khỏi yêu thích' })).toHaveCount(2);
    await accessible(page);
    await page.goto('/account/recently-viewed');
    await expect(page.getByRole('heading', { name: 'Sản phẩm đã xem' })).toBeVisible();
    await expect(page.getByText(/Đã xem/)).toBeVisible();
    const privacy = await page.evaluate(() => ({
      url: location.href,
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(`${privacy.url}${privacy.local}${privacy.session}`).not.toContain(productId);
    expect(privacy.scrollWidth).toBeLessThanOrEqual(privacy.width);
    await accessible(page);
  });

  test('batches visible favorite state and mocks mutations without changing the developer database', async ({
    page,
  }) => {
    await authenticate(page);
    let statusCalls = 0;
    let mutationCalls = 0;
    await page.route('**/api/v1/account/favorites/status?*', async (route) => {
      statusCalls += 1;
      const ids = new URL(route.request().url()).searchParams.get('productIds')?.split(',') ?? [];
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.length).toBeLessThanOrEqual(48);
      expect(ids.every((id) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id))).toBe(
        true,
      );
      expect(new Set(ids).size).toBe(ids.length);
      await fulfillJson(route, { items: ids.map((id) => ({ productId: id, isFavorite: false })) });
    });
    await page.route('**/api/v1/account/favorites/*', async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      mutationCalls += 1;
      const id = route.request().url().split('/').at(-1)!;
      expect(id).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
      await fulfillJson(route, { productId: id, isFavorite: true, favoritedAt: timestamp });
    });
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Thêm vào yêu thích' }).first();
    await expect(button).toBeVisible();
    await expect.poll(() => statusCalls).toBe(1);
    await expect(button).toBeEnabled();
    await button.click();
    await expect.poll(() => mutationCalls).toBe(1);
    await expect(page.getByRole('button', { name: 'Bỏ khỏi yêu thích' }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(statusCalls).toBe(1);
    expect(mutationCalls).toBe(1);
    await accessible(page);
  });

  test('sends guests to a safe internal login return path without queuing a mutation', async ({
    page,
  }) => {
    await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({ status: 401 }));
    let mutations = 0;
    await page.route('**/api/v1/account/favorites/*', (route) => {
      mutations += 1;
      return route.abort();
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Đăng nhập để thêm vào yêu thích' }).first().click();
    await expect(page).toHaveURL(/\/login\?returnTo=%2F$/);
    expect(mutations).toBe(0);
    expect(page.url()).not.toMatch(/favorite|productId/);
  });
});

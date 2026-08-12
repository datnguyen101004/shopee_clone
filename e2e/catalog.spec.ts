import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { createPrismaClient } from '../apps/api/prisma/create-prisma-client';

async function expectAccessible(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

test.describe('API-driven product catalogue', () => {
  test('browses seeded pages and categories while preserving supported parameters', async ({
    page,
    request,
  }) => {
    await page.goto('/search?category=electronics&q=phone&pageSize=2&utm_source=ignored');
    await expect(page.getByRole('heading', { name: 'Danh mục sản phẩm' })).toBeVisible();
    await expect(page.getByTestId('catalog-card')).toHaveCount(2);
    await expect(page.getByText(/Từ khóa “phone”/)).toBeVisible();
    await expect(page.getByText(/Đã bán/).first()).toBeVisible();
    await expect(page.getByLabel(/trên 5 sao/).first()).toBeVisible();

    const next = page.getByRole('link', { name: 'Trang sau' });
    await expect(next).toHaveAttribute('href', /category=electronics/);
    await expect(next).toHaveAttribute('href', /q=phone/);
    await expect(next).toHaveAttribute('href', /pageSize=2/);
    await expect(next).not.toHaveAttribute('href', /utm_source/);
    await next.click();
    await expect(page).toHaveURL(/category=electronics/);
    await expect(page).toHaveURL(/q=phone/);
    await expect(page).toHaveURL(/page=2/);

    const productLinks = page.locator('.catalog-card__link');
    for (let index = 0; index < (await productLinks.count()); index += 1) {
      const href = await productLinks.nth(index).getAttribute('href');
      expect(href).toMatch(/^\/products\//);
      expect((await request.get(href!)).status()).toBeLessThan(400);
    }
    await productLinks.first().click();
    await expect(page).toHaveURL(/\/products\//);
    await expect(page.locator('main h1')).toBeVisible();

    const apiBase = process.env.HOMEPAGE_API_BASE_URL ?? 'http://127.0.0.1:3001';
    const parent = await request.get(
      `${apiBase}/api/v1/catalog/products?category=electronics&pageSize=48`,
    );
    const leaf = await request.get(
      `${apiBase}/api/v1/catalog/products?category=mobile-accessories&pageSize=48`,
    );
    expect(parent.ok()).toBe(true);
    expect(leaf.ok()).toBe(true);
    const leafBody = (await leaf.json()) as { items: Array<{ category: { slug: string } }> };
    expect(leafBody.items.length).toBeGreaterThan(1);
    expect(leafBody.items.every((item) => item.category.slug === 'mobile-accessories')).toBe(true);
  });

  test('is responsive, keyboard accessible, and visually stable', async ({ page }) => {
    await page.goto('/search');
    const cards = page.locator('.catalog-card__link');
    await expect(cards).toHaveCount(12);
    expect((await cards.first().boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const next = page.getByRole('link', { name: 'Trang sau' });
    expect((await next.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await next.boundingBox())?.width).toBeGreaterThanOrEqual(44);
    await cards.first().focus();
    await expect(cards.first()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cards.nth(1)).toBeFocused();
    const size = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(size.scrollWidth).toBeLessThanOrEqual(size.width);
    const header = page.locator('.sc-shell-header');
    const initialHeaderTop = (await header.boundingBox())?.y;
    await page.evaluate(() => window.scrollTo(0, 700));
    await expect.poll(async () => (await header.boundingBox())?.y).toBe(initialHeaderTop);
    await expectAccessible(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await cards.first().evaluate((element) => (element as HTMLElement).blur());
    await expect(page).toHaveScreenshot('catalog.png', { fullPage: true, animations: 'disabled' });
  });

  test('keeps empty and data-source failure states actionable and accessible', async ({
    page,
  }, testInfo) => {
    await page.goto('/search?category=unknown-category');
    await expect(
      page.getByRole('heading', { name: 'Chưa tìm thấy sản phẩm phù hợp' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Xem tất cả sản phẩm' })).toBeVisible();
    await expectAccessible(page);

    test.skip(process.env.QUICK_E2E === '1', 'Quick E2E never mutates the local database.');
    test.skip(testInfo.project.name !== 'desktop', 'Data-source mutation runs once in isolation.');
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl)
      throw new Error('DATABASE_URL is required for isolated failure verification.');
    const prisma = createPrismaClient(databaseUrl);
    try {
      await prisma.$executeRawUnsafe('ALTER TABLE "products" RENAME TO "products_unavailable"');
      await page.goto('/search');
      await expect(page.locator('.catalog-state[role="alert"]')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Thử lại' })).toBeVisible();
      await expect(page.getByRole('search')).toBeVisible();
      await expectAccessible(page);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE "products_unavailable" RENAME TO "products"');
      await prisma.$disconnect();
    }
  });
});

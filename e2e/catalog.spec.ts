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

test.describe('API-driven product discovery', () => {
  test('combines search, filters, sorting, copied URL, pagination, and valid product links', async ({
    page,
    request,
  }) => {
    await page.goto('/search?pageSize=2&utm_source=ignored');
    const form = page.getByRole('search', { name: 'Tìm và lọc sản phẩm' });
    await form.getByRole('searchbox', { name: 'Từ khóa' }).fill('nuoc kiem');
    await form.getByRole('combobox', { name: 'Danh mục' }).selectOption('bach-hoa');
    await form.getByRole('spinbutton', { name: 'Giá thấp nhất' }).fill('1000');
    await form.getByRole('spinbutton', { name: 'Giá cao nhất' }).fill('1000000');
    await form.getByRole('combobox', { name: 'Đánh giá' }).selectOption('4');
    await form
      .getByRole('combobox', { name: 'Nơi bán' })
      .selectOption({ label: 'TP. Hồ Chí Minh' });
    await form.getByRole('checkbox', { name: 'Còn hàng' }).check();
    await form.getByRole('checkbox', { name: 'Đang giảm giá' }).check();
    await form.getByRole('combobox', { name: 'Sắp xếp' }).selectOption('price-asc');
    await form.getByRole('button', { name: 'Áp dụng' }).click();
    await expect(page).toHaveURL(/q=nuoc(?:\+|%20)kiem/);
    await expect(page).not.toHaveURL(/utm_source/);
    await expect(page).not.toHaveURL(/page=/);
    await expect(page.getByRole('heading', { name: /Kết quả cho/ })).toBeVisible();

    const copiedUrl = page.url();
    await page.reload();
    expect(page.url()).toBe(copiedUrl);
    await expect(form.getByRole('combobox', { name: 'Sắp xếp' })).toHaveValue('price-asc');

    const productLinks = page.locator('.catalog-card__link');
    for (let index = 0; index < (await productLinks.count()); index += 1) {
      const href = await productLinks.nth(index).getAttribute('href');
      expect(href).toMatch(/^\/products\//);
      expect((await request.get(href!)).status()).toBeLessThan(400);
    }
    const next = page.getByRole('link', { name: 'Trang sau' });
    if (await next.isVisible()) {
      await next.click();
      await expect(page).toHaveURL(/page=2/);
      await expect(page).toHaveURL(/sort=price-asc/);
    }
    await page.getByRole('link', { name: 'Xóa lọc' }).click();
    await expect(page).toHaveURL(/\/search$/);
  });

  test('supports every sort and canonical category without broken discovery state', async ({
    page,
  }) => {
    for (const sort of ['relevance', 'newest', 'best-selling', 'price-asc', 'price-desc']) {
      const keyword = sort === 'relevance' ? '&q=airpods' : '';
      await page.goto(`/search?category=dien-thoai&sort=${sort}${keyword}`);
      await expect(page.getByRole('combobox', { name: 'Sắp xếp' })).toHaveValue(sort);
      await expect(page.getByRole('status')).toContainText('sản phẩm');
    }
  });

  test('is responsive, keyboard accessible, and visually stable', async ({ page }) => {
    await page.goto('/search');
    const form = page.getByRole('search', { name: 'Tìm và lọc sản phẩm' });
    const keyword = form.getByRole('searchbox', { name: 'Từ khóa' });
    expect((await keyword.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await keyword.focus();
    await expect(keyword).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(form.getByRole('combobox', { name: 'Danh mục' })).toBeFocused();
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
    await keyword.evaluate((element) => (element as HTMLElement).blur());
    if (process.env.QUICK_E2E !== '1') {
      await expect(page).toHaveScreenshot('catalog-discovery.png', {
        fullPage: true,
        animations: 'disabled',
      });
    }
  });

  test('keeps no-match and data-source failure recovery actionable', async ({ page }, testInfo) => {
    await page.goto('/search?q=zzzxxyyqqq');
    await expect(
      page.getByRole('heading', { name: 'Chưa tìm thấy sản phẩm phù hợp' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Xóa tất cả bộ lọc' })).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: 'Danh mục' }).locator('option'),
    ).not.toHaveCount(1);
    await expectAccessible(page);

    test.skip(process.env.QUICK_E2E === '1', 'Quick E2E never mutates the local database.');
    test.skip(testInfo.project.name !== 'desktop', 'Data-source mutation runs once in isolation.');
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl)
      throw new Error('DATABASE_URL is required for isolated failure verification.');
    const prisma = createPrismaClient(databaseUrl);
    try {
      await prisma.$executeRawUnsafe('ALTER TABLE "products" RENAME TO "products_unavailable"');
      await page.goto('/search?q=phone');
      await expect(page.locator('.catalog-state[role="alert"]').first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Thử lại' }).first()).toBeVisible();
      await expectAccessible(page);
    } finally {
      await prisma.$executeRawUnsafe('ALTER TABLE "products_unavailable" RENAME TO "products"');
      await prisma.$disconnect();
    }
  });
});

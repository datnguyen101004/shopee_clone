import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { createPrismaClient } from '../apps/api/prisma/create-prisma-client';

test.describe('API-driven marketplace homepage', () => {
  test('renders seeded modules in order and keeps primary buyer links healthy', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    const modules = page.locator('[data-module-type]');
    await expect(modules).toHaveCount(6);
    await expect(modules.first()).toHaveAttribute('data-module-type', 'campaign-banner');
    await expect(
      page.getByRole('heading', { name: 'Mua sắm thả ga, deal về đầy nhà' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Danh mục' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Flash Sale' })).toBeVisible();

    const category = page.getByRole('link', { name: /Xem danh mục Điện thoại/ });
    await category.click();
    await expect(page).toHaveURL(/\/search\?category=mobile-accessories$/);
    await page.goto('/');
    const product = page.getByRole('link', { name: /Xem Smartphone Pro/ }).first();
    const productBox = await product.boundingBox();
    expect(productBox?.height).toBeGreaterThanOrEqual(44);
    await product.click();
    await expect(page).toHaveURL(/\/products\/00000000-/);
    await expect(
      page.getByRole('heading', { name: 'Trang sản phẩm đang được hoàn thiện' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Shopee Clone - Trang chủ' })).toBeVisible();

    await page.goto('/');
    const size = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(size.scrollWidth).toBeLessThanOrEqual(size.width);
    const primary = page.getByRole('link', { name: 'Săn deal ngay' });
    expect((await primary.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await primary.focus();
    await expect(primary).toBeFocused();
    const header = page.locator('.sc-shell-header');
    const initialHeaderTop = (await header.boundingBox())?.y;
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(async () => (await header.boundingBox())?.y).toBe(initialHeaderTop);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
    await expect(page).toHaveScreenshot('homepage.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('keeps empty and data-source failure compositions accessible', async ({
    page,
  }, testInfo) => {
    test.skip(
      process.env.QUICK_E2E === '1',
      'Quick E2E never mutates an already-running local database.',
    );
    test.skip(
      testInfo.project.name !== 'desktop',
      'State mutation runs once against isolated E2E data.',
    );
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl)
      throw new Error('DATABASE_URL is required for full-stack state verification.');
    const prisma = createPrismaClient(databaseUrl);
    const enabledState = await prisma.homepageModule.findMany({
      select: { id: true, isEnabled: true },
    });

    try {
      await prisma.homepageModule.updateMany({ data: { isEnabled: false } });
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: 'Gian hàng đang được cập nhật' }),
      ).toBeVisible();
      let results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.filter((violation) =>
          ['serious', 'critical'].includes(violation.impact ?? ''),
        ),
      ).toEqual([]);

      for (const module of enabledState) {
        await prisma.homepageModule.update({
          where: { id: module.id },
          data: { isEnabled: module.isEnabled },
        });
      }
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "homepage_modules" RENAME TO "homepage_modules_unavailable"',
      );
      try {
        await page.goto('/');
        await expect(
          page.getByRole('heading', { name: 'Chưa thể tải nội dung mua sắm' }),
        ).toBeVisible();
        results = await new AxeBuilder({ page }).analyze();
        expect(
          results.violations.filter((violation) =>
            ['serious', 'critical'].includes(violation.impact ?? ''),
          ),
        ).toEqual([]);
      } finally {
        await prisma.$executeRawUnsafe(
          'ALTER TABLE "homepage_modules_unavailable" RENAME TO "homepage_modules"',
        );
      }
    } finally {
      for (const module of enabledState) {
        await prisma.homepageModule.update({
          where: { id: module.id },
          data: { isEnabled: module.isEnabled },
        });
      }
      await prisma.$disconnect();
    }
  });
});

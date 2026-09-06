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

    const category = page.getByRole('link', { name: /Xem danh mục Bách hóa/ });
    await category.click();
    await expect(page).toHaveURL(/\/search\?category=bach-hoa$/);
    await page.goto('/');
    const product = page.locator('.product-card__link').first();
    const productLabel = await product.getAttribute('aria-label');
    const productName = productLabel?.replace(/^Xem\s+/, '');
    expect(productName).toBeTruthy();
    const productBox = await product.boundingBox();
    expect(productBox?.height).toBeGreaterThanOrEqual(44);
    await product.click();
    await expect(page).toHaveURL(/\/products\/[a-z0-9-]+$/);
    await expect(page.getByRole('heading', { name: productName! })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Biến thể sản phẩm' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Shopee Clone - Trang chủ' })).toBeVisible();

    await page.goto('/');
    const size = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(size.scrollWidth).toBeLessThanOrEqual(size.width);
    const primary = page.getByRole('link', { name: /Mua sắm thả ga|Săn deal/i }).first();
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
    if (process.env.QUICK_E2E !== '1') {
      await expect(page).toHaveScreenshot('homepage.png', {
        fullPage: true,
        animations: 'disabled',
      });
    }
  });

  test('runs the CMS banner carousel and preserves unavailable targets', async ({ page }) => {
    await page.goto('/');
    const carousel = page.locator('[data-module-type="campaign-banner"]');
    const activeLayer = carousel.locator('.hero-banner-slide.is-active');
    const image = activeLayer.locator('.hero-banner-img');
    const track = carousel.locator('.hero-banner-track');
    const indicators = carousel.locator('.hero-banner-indicator');

    await expect(indicators).toHaveCount(3);
    await expect(carousel.locator('a.hero-banner-link').first()).toHaveAttribute(
      'href',
      /\/campaigns\//,
    );

    const next = carousel.getByRole('button', { name: 'Banner tiếp theo' });
    const previous = carousel.getByRole('button', { name: 'Banner trước' });
    await expect(next).toBeHidden();
    await expect(previous).toBeHidden();
    await carousel.hover();
    await expect(next).toBeVisible();
    await expect(previous).toBeVisible();
    const firstAlt = await image.getAttribute('alt');

    await next.click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(0, 0);
    const secondAlt = await image.getAttribute('alt');
    expect(secondAlt).not.toBe(firstAlt);
    await page.waitForTimeout(2_500);
    await expect(image).toHaveAttribute('alt', secondAlt!);
    await page.waitForTimeout(800);
    await expect.poll(() => image.getAttribute('alt')).not.toBe(secondAlt);

    await carousel.hover();
    await next.click();
    await expect(image).toHaveAttribute('alt', firstAlt!);
    await expect.poll(() => track.getAttribute('style')).toContain('translate3d(-400%');
    await page.waitForTimeout(700);
    await expect.poll(() => track.getAttribute('style')).toContain('translate3d(-100%');

    await indicators.nth(2).click();
    await expect(image).toHaveAttribute('alt', 'Banner có mục tiêu không khả dụng');
    await expect(activeLayer.locator('a.hero-banner-link')).toHaveCount(0);
    await expect(activeLayer.locator('.hero-banner-link--static')).toBeVisible();

    await indicators.nth(0).click();
    const hoverAlt = await image.getAttribute('alt');
    await carousel.hover();
    await page.waitForTimeout(3_200);
    await expect.poll(() => image.getAttribute('alt')).not.toBe(hoverAlt);

    await indicators.nth(0).click();
    const focusedAlt = await image.getAttribute('alt');
    await next.focus();
    await page.waitForTimeout(3_200);
    await expect.poll(() => image.getAttribute('alt')).not.toBe(focusedAlt);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    await indicators.nth(0).click();
    const outOfViewportAlt = await image.getAttribute('alt');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.waitForTimeout(3_200);
    await expect(image).toHaveAttribute('alt', outOfViewportAlt!);
    await page.evaluate(() => window.scrollTo(0, 0));

    await indicators.nth(2).click();
    await expect(image).toHaveAttribute('alt', 'Banner có mục tiêu không khả dụng');
    await indicators.nth(0).click();
    await expect(image).toHaveAttribute('alt', 'Shopee Clone Siêu Sale Đại Tiệc');
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

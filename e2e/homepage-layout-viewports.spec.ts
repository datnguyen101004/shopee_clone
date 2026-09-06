import { expect, test } from '@playwright/test';

test.describe('Homepage Layout Composition across Viewports', () => {
  test('Desktop layout composition (1280px)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');

    // Container check
    const container = page.locator('.sc-storefront-container.home-flow');
    await expect(container).toBeVisible();

    // Section primitives
    const sections = page.locator('.sc-storefront-section');
    await expect(sections).toHaveCount(6);

    // Section headers
    const sectionHeaders = page.locator('.sc-section-header');
    await expect(sectionHeaders).toHaveCount(5);
    await expect(page.getByRole('heading', { name: 'Danh mục' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Flash Sale' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Top sản phẩm bán chạy' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Shopee Mall' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gợi ý hôm nay' })).toBeVisible();

    // Order verification
    const moduleTypes = await page.locator('[data-module-type]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-module-type')),
    );
    expect(moduleTypes).toEqual([
      'campaign-banner',
      'category-shortcuts',
      'flash-sale',
      'top-selling',
      'mall',
      'daily-recommendations',
    ]);

    // Carousel check
    const carouselWrapper = page.locator('.carousel-wrapper');
    await expect(carouselWrapper).toBeVisible();
    await expect(page.locator('.carousel-btn--next')).toBeVisible();

    // Grid columns check
    const gridColumns = await page.locator('.product-grid').first().evaluate((el) => {
      return window.getComputedStyle(el).gridTemplateColumns.split(' ').length;
    });
    expect(gridColumns).toBe(6);

    // No horizontal page overflow
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width);

    await page.screenshot({ path: 'test-results/homepage-desktop-1280.png', fullPage: true });
  });

  test('Tablet layout composition (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    const container = page.locator('.sc-storefront-container.home-flow');
    await expect(container).toBeVisible();

    const sections = page.locator('.sc-storefront-section');
    await expect(sections).toHaveCount(6);

    // 4 columns on tablet
    const gridColumns = await page.locator('.product-grid').first().evaluate((el) => {
      return window.getComputedStyle(el).gridTemplateColumns.split(' ').length;
    });
    expect(gridColumns).toBe(4);

    // No horizontal page overflow
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width);

    await page.screenshot({ path: 'test-results/homepage-tablet-768.png', fullPage: true });
  });

  test('Mobile layout composition (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    const container = page.locator('.sc-storefront-container.home-flow');
    await expect(container).toBeVisible();

    const sections = page.locator('.sc-storefront-section');
    await expect(sections).toHaveCount(6);

    // 2 columns on mobile
    const gridColumns = await page.locator('.product-grid').first().evaluate((el) => {
      return window.getComputedStyle(el).gridTemplateColumns.split(' ').length;
    });
    expect(gridColumns).toBe(2);

    // Category horizontal scroll wrapper
    const categoryGrid = page.locator('.category-grid');
    await expect(categoryGrid).toBeVisible();

    // No horizontal page overflow
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width);

    await page.screenshot({ path: 'test-results/homepage-mobile-375.png', fullPage: true });
  });
});

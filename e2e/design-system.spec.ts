import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('responsive marketplace shell', () => {
  test('renders the main commerce landmarks without horizontal overflow', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Mua sắm thả ga/ })).toBeVisible();
    await expect(page.getByRole('search')).toBeVisible();
    await expect(page.locator('main')).toHaveCount(1);
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Bỏ qua đến nội dung chính' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    if (testInfo.project.name === 'mobile') {
      const box = await page.getByRole('button', { name: 'Săn deal ngay' }).boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    if (testInfo.project.name === 'desktop') {
      const box = await page.locator('.home-flow').boundingBox();
      expect(Math.abs((box?.x ?? 0) - (1440 - (box?.width ?? 0)) / 2)).toBeLessThan(1);
    }

    // Reset focus and scroll state so the visual baseline represents the default storefront.
    await page.goto('/');
    await expect(page).toHaveScreenshot('marketplace.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.05,
    });
  });

  test('passes automated accessibility checks', async ({ page }) => {
    await page.goto('/design-system');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    await expect(page).toHaveScreenshot('design-system.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.05,
    });
  });

  test('supports keyboard dialog and toast interactions', async ({ page }) => {
    await page.goto('/design-system');
    await page.getByRole('button', { name: 'Mở dialog' }).click();
    await expect(page.getByRole('dialog', { name: 'Xác nhận đơn hàng' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đóng hộp thoại' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Mở dialog' })).toBeFocused();
    await page.getByRole('button', { name: 'Hiện toast' }).click();
    await expect(page.getByText('Đã thêm vào giỏ', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng thông báo' }).click();
    await expect(page.getByText('Đã thêm vào giỏ', { exact: true })).toBeHidden();
  });
});

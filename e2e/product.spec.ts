import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const productId = '00000000-0000-4000-8000-000000000301';

async function expectAccessible(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

test.describe('API-driven product detail', () => {
  test('resolves gallery, variants, quantity, related products, and anonymous intents', async ({
    page,
  }) => {
    await page.goto(`/products/${productId}`);
    await expect(page.getByRole('heading', { name: 'Smartphone Pro' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Smartphone Pro' })).toBeVisible();
    await page.getByRole('button', { name: /256GB - Silver/ }).click();
    await expect(page.getByText('PHONE-PRO-256-SLV')).toBeVisible();
    await page.getByRole('button', { name: /128GB - Black/ }).click();
    const quantity = page.locator('#product-quantity');
    await quantity.fill('46');
    await expect(page.getByText(/Số lượng tối đa là 45/)).toBeVisible();
    await quantity.fill('2');
    await expect(page.getByRole('link', { name: /Thêm vào giỏ hàng/ })).toHaveAttribute(
      'href',
      /intent=add-to-cart/,
    );
    await expect(page.getByRole('link', { name: /Mua ngay/ })).toHaveAttribute(
      'href',
      /intent=buy-now/,
    );
    expect(await page.locator('.product-detail-related__card').count()).toBeGreaterThan(0);
  });

  test('keeps fallback and invalid routes actionable', async ({ page }) => {
    await page.goto('/products/not-a-uuid');
    await expect(page.getByRole('heading', { name: 'Không tìm thấy sản phẩm' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Khám phá sản phẩm' })).toHaveAttribute(
      'href',
      '/search',
    );
  });

  test('is responsive, keyboard-operable, and accessible', async ({ page }) => {
    await page.goto(`/products/${productId}`);
    const variants = page.getByRole('group', { name: 'Biến thể sản phẩm' });
    await variants.getByRole('button').first().focus();
    await expect(variants.getByRole('button').first()).toBeFocused();
    expect(
      (await page.getByRole('button', { name: 'Tăng số lượng' }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
    await expectAccessible(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await variants
      .getByRole('button')
      .first()
      .evaluate((element) => (element as HTMLElement).blur());
    if (process.env.QUICK_E2E !== '1') {
      await expect(page).toHaveScreenshot('product-detail.png', {
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
});

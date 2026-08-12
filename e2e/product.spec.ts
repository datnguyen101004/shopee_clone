import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';

async function canonicalProduct(request: APIRequestContext) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001';
  const catalog = await request.get(
    `${apiBaseUrl}/api/v1/catalog/products?category=bach-hoa&pageSize=1`,
  );
  expect(catalog.ok()).toBe(true);
  const item = (await catalog.json()).items[0] as { id: string; name: string };
  const detailResponse = await request.get(`${apiBaseUrl}/api/v1/catalog/products/${item.id}`);
  expect(detailResponse.ok()).toBe(true);
  return (await detailResponse.json()) as {
    id: string;
    name: string;
    gallery: Array<{ altText: string }>;
    variants: Array<{ id: string; sku: string; availableQuantity: number }>;
  };
}

async function expectAccessible(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

test.describe('API-driven product detail', () => {
  test('resolves canonical media, inventory, quantity, related products, and anonymous intents', async ({
    page,
    request,
  }) => {
    const product = await canonicalProduct(request);
    const variant = product.variants[0]!;
    await page.goto(`/products/${product.id}`);
    const main = page.locator('#main-content');
    await expect(main.getByRole('heading', { name: product.name })).toBeVisible();
    await expect(main.getByRole('img', { name: product.gallery[0]!.altText })).toBeVisible();
    await expect(main.getByText(variant.sku)).toBeVisible();
    const quantity = main.locator('#product-quantity');
    await quantity.fill(String(variant.availableQuantity + 1));
    await expect(main.getByText(`Số lượng tối đa là ${variant.availableQuantity}.`)).toBeVisible();
    await quantity.fill('2');
    await expect(main.getByRole('link', { name: /Thêm vào giỏ hàng/ })).toHaveAttribute(
      'href',
      /intent=add-to-cart/,
    );
    await expect(main.getByRole('link', { name: /Mua ngay/ })).toHaveAttribute(
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

  test('is responsive, keyboard-operable, and accessible', async ({ page, request }) => {
    const product = await canonicalProduct(request);
    await page.goto(`/products/${product.id}`);
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

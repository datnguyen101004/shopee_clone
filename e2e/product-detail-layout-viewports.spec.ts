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

test.describe('Product Detail Layout & Responsive across Viewports', () => {
  test('Desktop layout composition (1280px)', async ({ page, request }) => {
    const product = await canonicalProduct(request);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/products/${product.id}`);

    // Container and layout
    const container = page.locator('.product-detail-page');
    await expect(container).toBeVisible();

    const offerSection = page.locator('.product-detail-offer');
    await expect(offerSection).toBeVisible();

    // Gallery and offer selection side-by-side on desktop
    const gallery = page.locator('.product-detail-gallery');
    const selection = page.locator('.product-detail-offer__selection');
    await expect(gallery).toBeVisible();
    await expect(selection).toBeVisible();

    // Key components are rendered
    await expect(page.locator('.product-detail-price')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Biến thể sản phẩm' })).toBeVisible();
    await expect(page.locator('.product-detail-quantity')).toBeVisible();
    await expect(page.locator('.product-detail-purchase')).toBeVisible();

    // No horizontal scroll overflow
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width);

    await page.screenshot({ path: 'test-results/product-detail-desktop-1280.png', fullPage: true });
  });

  test('Tablet layout composition (768px)', async ({ page, request }) => {
    const product = await canonicalProduct(request);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`/products/${product.id}`);

    const offerSection = page.locator('.product-detail-offer');
    await expect(offerSection).toBeVisible();

    // Verify responsiveness
    const gallery = page.locator('.product-detail-gallery');
    const selection = page.locator('.product-detail-offer__selection');
    await expect(gallery).toBeVisible();
    await expect(selection).toBeVisible();

    // No horizontal scroll overflow
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width);

    await page.screenshot({ path: 'test-results/product-detail-tablet-768.png', fullPage: true });
  });

  test('Mobile layout composition (375px)', async ({ page, request }) => {
    const product = await canonicalProduct(request);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`/products/${product.id}`);

    const offerSection = page.locator('.product-detail-offer');
    await expect(offerSection).toBeVisible();

    // In mobile, purchase buttons should be stacked or full width
    const purchaseButtons = page.locator('.product-detail-purchase a, .product-detail-purchase button');
    expect(await purchaseButtons.count()).toBeGreaterThanOrEqual(2);

    // No horizontal scroll overflow
    const overflow = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width);

    await page.screenshot({ path: 'test-results/product-detail-mobile-375.png', fullPage: true });
  });
});

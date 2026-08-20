import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Route } from '@playwright/test';

const shop = {
  id: '30000000-0000-4000-8000-000000000101', slug: 'seller-test-shop', name: 'Seller Test Shop', description: 'Gian hàng kiểm thử seller onboarding.', logoUrl: null, bannerUrl: null, location: 'Thành phố Hồ Chí Minh', contactPhone: '0912345678', contactEmail: 'seller@example.test',
  pickupAddress: { recipientName: 'Seller Test', phoneNumber: '0912345678', province: 'Thành phố Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Bến Nghé', addressLine: '1 Nguyễn Huệ' },
  returnAddress: { recipientName: 'Seller Test', phoneNumber: '0912345678', province: 'Thành phố Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Bến Nghé', addressLine: '1 Nguyễn Huệ' },
  status: 'inactive', onboardingStatus: 'pending_approval', onboardingReason: null, canSell: false, createdAt: '2026-08-16T00:00:00.000Z', updatedAt: '2026-08-16T00:00:00.000Z',
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

test('buyer shop registration is responsive and uses intercepted mutations', async ({ page }) => {
  let creates = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') return json(route, { accessToken: 'header.payload.signature', expiresAt: '2099-08-16T00:00:00.000Z', user: { id: '30000000-0000-4000-8000-000000000001', email: 'buyer@example.test', displayName: 'Buyer Test', status: 'active', roles: ['buyer'] } });
    if (request.method() === 'GET' && path === '/api/v1/cart') return route.fulfill({ status: 404 });
    if (request.method() === 'GET' && path === '/api/v1/seller/shop/workspace') return json(route, { shop: null, defaultAddress: null });
    if (request.method() === 'POST' && path === '/api/v1/seller/shop') { creates += 1; return json(route, shop, 201); }
    return route.fulfill({ status: 404 });
  });

  await page.goto('/seller/shop');
  await expect(page.getByRole('heading', { name: 'Đăng ký gian hàng' })).toBeVisible();
  await page.getByLabel('Đường dẫn').fill(shop.slug);
  await page.getByLabel('Tên shop').fill(shop.name);
  await page.getByLabel('Mô tả').fill(shop.description);
  await page.getByRole('textbox', { name: 'Điện thoại', exact: true }).fill(shop.contactPhone);
  await page.getByLabel('Email').fill(shop.contactEmail);
  await page.getByLabel('Khu vực').fill(shop.location);
  for (const index of [0, 1]) {
    await page.getByLabel('Người nhận').nth(index).fill(shop.pickupAddress.recipientName);
    await page.getByLabel('Số điện thoại').nth(index).fill(shop.pickupAddress.phoneNumber);
    await page.getByLabel('Địa chỉ chi tiết').nth(index).fill(shop.pickupAddress.addressLine);
    await page.getByRole('button', { name: 'Tỉnh/Thành phố' }).nth(index).click();
    await page.getByRole('option', { name: shop.pickupAddress.province, exact: true }).click();
    await page.getByRole('button', { name: 'Quận/Huyện' }).nth(index).click();
    await page.getByRole('option', { name: shop.pickupAddress.district, exact: true }).click();
    await page.getByRole('button', { name: 'Phường/Xã' }).nth(index).click();
    await page.getByRole('option', { name: shop.pickupAddress.ward, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Gửi đăng ký' }).click();
  await expect(page.getByRole('status')).toContainText('Đã gửi hồ sơ');
  expect(creates).toBe(1);
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
  ).toEqual([]);
});

test('approved seller can create, publish, then hide a product listing', async ({ page }) => {
  const product = {
    id: '30000000-0000-4000-8000-000000000201', slug: 'seller-product-test', name: 'Seller Product Test', description: 'Sản phẩm kiểm thử cho Seller Center.', categoryId: '30000000-0000-4000-8000-000000000202', attributes: [],
    media: [{ id: '30000000-0000-4000-8000-000000000203', url: 'https://cdn.example.test/product.jpg', altText: null, sortOrder: 0, variantId: null }],
    packageLengthMm: 100, packageWidthMm: 100, packageHeightMm: 100, optionGroups: [], variants: [{ id: '30000000-0000-4000-8000-000000000204', combination: [], sku: 'SELLER-PRODUCT-TEST', priceMinor: 100000, compareAtPriceMinor: null, stock: 5, weightGrams: 500, maxPurchaseQuantity: null, active: true }],
    lifecycle: 'draft', moderationStatus: 'active', moderationReason: null, createdAt: '2026-08-17T00:00:00.000Z', updatedAt: '2026-08-17T00:00:00.000Z',
  };
  let creates = 0;
  let lifecycle: 'draft' | 'published' | 'hidden' = 'draft';
  let deleted = false;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') return json(route, { accessToken: 'header.payload.signature', expiresAt: '2099-08-17T00:00:00.000Z', user: { id: '30000000-0000-4000-8000-000000000002', email: 'seller@example.test', displayName: 'Seller Test', status: 'active', roles: ['buyer', 'seller'] } });
    if (request.method() === 'GET' && path === '/api/v1/cart') return route.fulfill({ status: 404 });
    if (request.method() === 'GET' && path === '/api/v1/seller/products') return json(route, { items: deleted ? [] : [{ id: product.id, slug: product.slug, name: product.name, categoryName: 'Thiết bị điện tử', lifecycle, moderationStatus: 'active', primaryMediaUrl: product.media[0]?.url ?? null, variantCount: 1, stockQuantity: 5, updatedAt: product.updatedAt }], nextCursor: null });
    if (request.method() === 'GET' && path === '/api/v1/seller/products/categories') return json(route, [{ id: product.categoryId, name: 'Thiết bị điện tử', slug: 'thiet-bi-dien-tu', parentId: null, isLeaf: true, attributes: [] }]);
    if (request.method() === 'GET' && path === `/api/v1/seller/products/${product.id}`) return json(route, { ...product, lifecycle });
    if (request.method() === 'POST' && path === '/api/v1/seller/products/media') return json(route, { id: '30000000-0000-4000-8000-000000000205', mimeType: 'image/png', byteSize: 24, width: 1, height: 1, previewUrl: '/api/v1/seller/products/media/30000000-0000-4000-8000-000000000205/preview', expiresAt: '2026-08-18T00:00:00.000Z' }, 201);
    if (request.method() === 'POST' && path === '/api/v1/seller/products') { creates += 1; lifecycle = 'draft'; return json(route, { ...product, lifecycle }, 201); }
    if (request.method() === 'PATCH' && path.endsWith('/lifecycle')) { lifecycle = (request.postDataJSON() as { lifecycle: 'published' | 'hidden' }).lifecycle; return json(route, { ...product, lifecycle }); }
    if (request.method() === 'DELETE' && path === `/api/v1/seller/products/${product.id}`) { deleted = true; return route.fulfill({ status: 204 }); }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/seller/products');
  await page.getByRole('link', { name: 'Thêm sản phẩm' }).click();
  await page.getByLabel('Tên sản phẩm').fill(product.name);
  await page.getByLabel('Danh mục').selectOption(product.categoryId);
  await page.getByLabel('Mô tả').fill(product.description);
  await page.getByLabel('Chọn ảnh từ máy').setInputFiles({ name: 'product.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 82, 0, 0, 0, 1, 0, 0, 0, 1]) });
  await expect(page.getByText('Đã sẵn sàng')).toBeVisible();
  await page.getByLabel('Dài').fill('100'); await page.getByLabel('Rộng').fill('100'); await page.getByLabel('Cao').fill('100');
  await page.getByLabel('Tồn kho mặc định').fill('5');
  await expect(page.getByLabel('Danh mục')).toHaveValue(product.categoryId);
  await expect(page.getByLabel('Mô tả')).toHaveValue(product.description);
  await expect(page.getByLabel('Dài')).toHaveValue('100');
  await expect(page.getByLabel('Rộng')).toHaveValue('100');
  await expect(page.getByLabel('Cao')).toHaveValue('100');
  await expect(page.getByLabel('Tồn kho mặc định')).toHaveValue('5');
  await expect(page.getByText('Slug sẽ được tạo sau khi lưu theo tên sản phẩm và thời điểm đăng.')).toBeVisible();
  await page.getByRole('button', { name: 'Lưu nháp' }).click();
  await expect(page).toHaveURL(/\/seller\/products$/);
  expect(creates).toBe(1);
  await expect(page.getByText(product.name)).toBeVisible();
  await page.getByRole('link', { name: 'Cập nhật sản phẩm' }).click();
  await expect(page).toHaveURL(new RegExp(`/seller/products/${product.id}/edit$`));
  await expect(page.getByLabel('Tên sản phẩm')).toHaveValue(product.name);
  await page.getByRole('link', { name: 'Quay lại danh sách' }).click();
  await expect(page).toHaveURL(/\/seller\/products$/);
  await page.getByRole('button', { name: 'Đăng bán' }).click();
  await expect(page.getByText('Sản phẩm đã được đăng bán.', { exact: true })).toBeVisible();
  await expect(page.locator('b').filter({ hasText: 'Đang bán' })).toBeVisible();
  await page.getByRole('link', { name: 'Cập nhật sản phẩm' }).click();
  await expect(page.getByRole('button', { name: 'Hủy' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cập nhật' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lưu nháp' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ẩn sản phẩm' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hủy' }).click();
  await expect(page).toHaveURL(/\/seller\/products$/);
  await page.getByRole('button', { name: `Ẩn sản phẩm ${product.name}` }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ẩn sản phẩm' }).click();
  await expect(page.getByText('Đã ẩn sản phẩm.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng bán' })).toBeVisible();
  await expect(page).toHaveURL(/\/seller\/products$/);
  await page.getByRole('button', { name: `Xóa sản phẩm ${product.name}` }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xóa sản phẩm' }).click();
  await expect(page.getByText('Đã xóa sản phẩm.')).toBeVisible();
  await expect(page.getByText(product.name)).not.toBeVisible();
});

test('existing shop opens read-only and can cancel or save profile editing', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') return json(route, { accessToken: 'header.payload.signature', expiresAt: '2099-08-17T00:00:00.000Z', user: { id: '30000000-0000-0000-0000-000000000002', email: 'seller@example.test', displayName: 'Seller Test', status: 'active', roles: ['buyer', 'seller'] } });
    if (request.method() === 'GET' && path === '/api/v1/cart') return route.fulfill({ status: 404 });
    if (request.method() === 'GET' && path === '/api/v1/seller/shop/workspace') return json(route, { shop, defaultAddress: null });
    if (request.method() === 'PATCH' && path === '/api/v1/seller/shop/registration') return json(route, { ...shop, onboardingStatus: 'pending_approval', updatedAt: '2026-08-17T01:00:00.000Z' });
    return route.fulfill({ status: 404 });
  });
  await page.goto('/seller/shop');
  await expect(page.getByTestId('seller-shop-profile-view')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cập nhật hồ sơ' })).toBeVisible();
  await page.getByRole('button', { name: 'Cập nhật hồ sơ' }).click();
  await expect(page.getByRole('button', { name: 'Hủy' })).toBeVisible();
  await page.getByRole('button', { name: 'Hủy' }).click();
  await expect(page.getByTestId('seller-shop-profile-view')).toBeVisible();
  await page.getByRole('button', { name: 'Cập nhật hồ sơ' }).click();
  await page.getByRole('button', { name: 'Lưu hồ sơ' }).click();
  await expect(page.getByTestId('seller-shop-profile-view')).toBeVisible();
});

test('seller gets a stock row for every generated classification combination', async ({ page }) => {
  const categoryId = '30000000-0000-4000-8000-000000000302';
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') return json(route, { accessToken: 'header.payload.signature', expiresAt: '2099-08-17T00:00:00.000Z', user: { id: '30000000-0000-4000-8000-000000000002', email: 'seller@example.test', displayName: 'Seller Test', status: 'active', roles: ['buyer', 'seller'] } });
    if (request.method() === 'GET' && path === '/api/v1/cart') return route.fulfill({ status: 404 });
    if (request.method() === 'GET' && path === '/api/v1/seller/products/categories') return json(route, [{ id: categoryId, name: 'Thiết bị điện tử', slug: 'thiet-bi-dien-tu', parentId: null, isLeaf: true, attributes: [] }]);
    return route.fulfill({ status: 404 });
  });
  await page.goto('/seller/products/new');
  await page.getByRole('button', { name: '+ Thêm nhóm phân loại' }).click();
  await page.getByLabel('Tên nhóm phân loại 1').fill('Màu sắc');
  await page.getByRole('textbox', { name: 'Giá trị 1-1', exact: true }).fill('Đỏ');
  await page.getByRole('button', { name: '+ Thêm giá trị' }).click();
  await page.getByRole('textbox', { name: 'Giá trị 1-2', exact: true }).fill('Xanh');
  await page.getByRole('button', { name: '+ Thêm nhóm phân loại' }).click();
  await page.getByLabel('Tên nhóm phân loại 2').fill('Kích cỡ');
  await page.getByRole('textbox', { name: 'Giá trị 2-1', exact: true }).fill('M');
  await page.getByRole('button', { name: '+ Thêm giá trị' }).nth(1).click();
  await page.getByRole('textbox', { name: 'Giá trị 2-2', exact: true }).fill('L');
  await expect(page.getByText('Đỏ · M')).toBeVisible();
  await expect(page.getByText('Đỏ · L')).toBeVisible();
  await expect(page.getByText('Xanh · M')).toBeVisible();
  await expect(page.getByText('Xanh · L')).toBeVisible();
  await expect(page.getByLabel('Tồn kho Đỏ M')).toBeVisible();
  await expect(page.getByLabel('Tồn kho Đỏ L')).toBeVisible();
  await expect(page.getByLabel('Tồn kho Xanh M')).toBeVisible();
  await expect(page.getByLabel('Tồn kho Xanh L')).toBeVisible();
});

test('seller inventory supports adjustment, availability refresh, history, and invalid reduction feedback', async ({ page }) => {
  const variantId = '30000000-0000-4000-8000-000000000402';
  const inventory = {
    variantId,
    productId: '30000000-0000-4000-8000-000000000401',
    productName: 'Tồn kho kiểm thử',
    productImageUrl: null,
    variantName: 'Đỏ · M',
    sku: 'INVENTORY-TEST',
    lifecycle: 'active',
    quantityOnHand: 5,
    quantityReserved: 0,
    quantitySold: 0,
    availableQuantity: 5,
    lowStock: false,
    version: 0,
    updatedAt: '2026-08-18T00:00:00.000Z',
  };
  let current = { ...inventory };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') return json(route, { accessToken: 'header.payload.signature', expiresAt: '2099-08-18T00:00:00.000Z', user: { id: '30000000-0000-4000-8000-000000000002', email: 'seller@example.test', displayName: 'Seller Test', status: 'active', roles: ['buyer', 'seller'] } });
    if (request.method() === 'GET' && path === '/api/v1/cart') return route.fulfill({ status: 404 });
    if (request.method() === 'GET' && path === '/api/v1/seller/inventory') return json(route, { items: [current], nextCursor: null });
    if (request.method() === 'GET' && path === `/api/v1/seller/inventory/${variantId}/adjustments`) return json(route, { items: [{ id: '30000000-0000-4000-8000-000000000403', variantId, actorUserId: '30000000-0000-4000-8000-000000000002', reason: 'RESTOCK', note: 'Bổ sung hàng', delta: 2, quantityOnHandBefore: 5, quantityOnHandAfter: 7, quantityReserved: 0, quantitySold: 0, availableQuantity: 7, inventoryVersion: 1, idempotencyKey: null, occurredAt: '2026-08-18T00:01:00.000Z' }], nextCursor: null });
    if (request.method() === 'POST' && path === `/api/v1/seller/inventory/${variantId}/adjustments`) {
      const body = request.postDataJSON() as { delta: number };
      if (body.delta < 0) return json(route, { type: 'https://shopee-clone.local/problems/inventory-insufficient', title: 'Insufficient inventory', status: 409, detail: 'Available quantity is insufficient.', code: 'INVENTORY_INSUFFICIENT', availableQuantity: 5 }, 409);
      current = { ...current, quantityOnHand: current.quantityOnHand + body.delta, availableQuantity: current.availableQuantity + body.delta, version: current.version + 1 };
      return json(route, { id: '30000000-0000-4000-8000-000000000404', variantId, actorUserId: '30000000-0000-4000-8000-000000000002', reason: 'RESTOCK', note: null, delta: body.delta, quantityOnHandBefore: 5, quantityOnHandAfter: current.quantityOnHand, quantityReserved: 0, quantitySold: 0, availableQuantity: current.availableQuantity, inventoryVersion: current.version, idempotencyKey: null, occurredAt: '2026-08-18T00:02:00.000Z' }, 201);
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/seller/inventory');
  await expect(page.getByText('Tồn kho kiểm thử')).toBeVisible();
  await page.getByRole('button', { name: 'Điều chỉnh' }).click();
  await page.getByLabel('Thay đổi số lượng').fill('2');
  await page.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
  await expect(page.getByRole('cell', { name: '7', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Lịch sử' }).click();
  await expect(page.getByRole('heading', { name: 'Lịch sử điều chỉnh' })).toBeVisible();
  await page.getByRole('button', { name: 'Đóng' }).click();
  await page.getByRole('button', { name: 'Điều chỉnh' }).click();
  await page.getByLabel('Thay đổi số lượng').fill('-10');
  await page.getByRole('button', { name: 'Lưu điều chỉnh' }).click();
  await expect(page.getByText('Available quantity is insufficient.')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
});

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

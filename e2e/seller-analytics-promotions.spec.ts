import { expect, test, type Page } from '@playwright/test';
import { sellerAnalyticsFixture, sellerPromotionFixture } from './fixtures/seller-analytics-promotions';

const id = '30000000-0000-4000-8000-000000000601';
const dashboard = (zero = false) => ({
  sellerAnalyticsVersion: 'seller-analytics-v1', currency: 'VND',
  range: { from: '2026-08-01', to: '2026-08-07', timeZone: 'Asia/Ho_Chi_Minh', fromUtc: '2026-07-31T17:00:00.000Z', toUtcExclusive: '2026-08-07T17:00:00.000Z' },
  generatedAt: '2026-08-19T00:00:00.000Z',
  kpis: zero ? { eligibleOrderCount: 0, unitsSold: 0, merchandiseRevenueMinor: 0 } : { eligibleOrderCount: 2, unitsSold: 3, merchandiseRevenueMinor: 120000 },
  timeSeries: [{ bucket: '2026-08-01', eligibleOrderCount: zero ? 0 : 2, unitsSold: zero ? 0 : 3, merchandiseRevenueMinor: zero ? 0 : 120000 }],
  bestSellers: zero ? [] : [{ productId: id, productName: 'Fixture product', productImageUrl: null, unitsSold: 3, merchandiseRevenueMinor: 120000, currentProductAvailable: true }],
  lowStock: zero ? { threshold: sellerAnalyticsFixture.lowStockThreshold, items: [] } : { threshold: sellerAnalyticsFixture.lowStockThreshold, items: [{ variantId: '30000000-0000-4000-8000-000000000602', productId: id, productName: 'Fixture product', productImageUrl: null, variantName: 'Mặc định', sku: 'FIXTURE-1', availableQuantity: 2, quantityOnHand: 2, quantityReserved: 0 }] },
  conversion: { status: 'NOT_AVAILABLE', rateBasisPoints: null, visits: null },
});

const voucher = { id: '30000000-0000-4000-8000-000000000611', issuer: 'SHOP', code: sellerPromotionFixture.futureVoucherCode, name: 'Fixture voucher', benefitType: 'FIXED_AMOUNT', fixedAmountMinor: 10000, percentageBasisPoints: null, maximumDiscountMinor: null, minimumSpendMinor: 0, startsAt: '2099-08-01T00:00:00.000Z', endsAt: '2099-08-31T00:00:00.000Z', usageLimit: 10, perBuyerLimit: 1, productIds: [], state: 'SCHEDULED', usedCount: 0, version: 1, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' };
const discount = { id: '30000000-0000-4000-8000-000000000612', name: 'Fixture discount', startsAt: sellerPromotionFixture.adjacentCampaignWindows[0]!.startsAt, endsAt: sellerPromotionFixture.adjacentCampaignWindows[0]!.endsAt, products: [{ productId: id, discountBasisPoints: 1500 }], state: 'SCHEDULED', version: 1, archivedAt: null, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' };

async function mockSellerApi(page: Page, options?: { zero?: boolean }) {
  let currentVoucher = voucher;
  let currentDiscount = discount;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: 'header.payload.signature', expiresAt: '2099-08-19T00:00:00.000Z', user: { id: '30000000-0000-0000-0000-000000000001', email: 'seller@example.test', displayName: 'Seller Test', status: 'active', roles: ['buyer', 'seller'] } }) });
    if (request.method() === 'GET' && path === '/api/v1/cart') return route.fulfill({ status: 404 });
    if (request.method() === 'GET' && path === '/api/v1/seller/dashboard') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboard(options?.zero)) });
    if (request.method() === 'GET' && path === '/api/v1/seller/promotions/vouchers') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sellerPromotionVersion: 'seller-promotions-v1', items: [currentVoucher], nextCursor: null }) });
    if (request.method() === 'GET' && path === '/api/v1/seller/promotions/discounts') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sellerPromotionVersion: 'seller-promotions-v1', items: [currentDiscount], nextCursor: null }) });
    if (request.method() === 'POST' && path === '/api/v1/seller/promotions/vouchers') { currentVoucher = { ...currentVoucher, code: JSON.parse(request.postData() ?? '{}').code ?? currentVoucher.code }; return route.fulfill({ status: 201, headers: { ETag: '"seller-promotion-1"' }, contentType: 'application/json', body: JSON.stringify(currentVoucher) }); }
    if (request.method() === 'PATCH' && path.startsWith('/api/v1/seller/promotions/vouchers/')) return route.fulfill({ status: 200, headers: { ETag: '"seller-promotion-2"' }, contentType: 'application/json', body: JSON.stringify({ ...currentVoucher, version: 2 }) });
    if (request.method() === 'POST' && path.includes('/seller/promotions/vouchers/') && path.endsWith('/actions')) { currentVoucher = { ...currentVoucher, state: 'PAUSED', version: currentVoucher.version + 1 }; return route.fulfill({ status: 201, headers: { ETag: '"seller-promotion-2"' }, contentType: 'application/json', body: JSON.stringify(currentVoucher) }); }
    if (request.method() === 'DELETE' && path.startsWith('/api/v1/seller/promotions/vouchers/')) { currentVoucher = { ...currentVoucher, state: 'PAUSED', version: currentVoucher.version + 1 }; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ deleted: true }) }); }
    if (request.method() === 'POST' && path === '/api/v1/seller/promotions/discounts') return route.fulfill({ status: 201, headers: { ETag: '"seller-promotion-1"' }, contentType: 'application/json', body: JSON.stringify(currentDiscount) });
    if (request.method() === 'PATCH' && path.startsWith('/api/v1/seller/promotions/discounts/')) return route.fulfill({ status: 200, headers: { ETag: '"seller-promotion-2"' }, contentType: 'application/json', body: JSON.stringify({ ...currentDiscount, version: 2 }) });
    if (request.method() === 'POST' && path.includes('/seller/promotions/discounts/') && path.endsWith('/actions')) return route.fulfill({ status: 201, headers: { ETag: '"seller-promotion-2"' }, contentType: 'application/json', body: JSON.stringify({ ...currentDiscount, state: 'PAUSED', version: 2 }) });
    return route.fulfill({ status: 404 });
  });
}

test('seller dashboard covers range changes, zero state, navigation and responsive layouts', async ({ page }) => {
  await mockSellerApi(page);
  await page.goto('/seller');
  await expect(page.getByRole('heading', { name: 'Tổng quan shop' })).toBeVisible();
  await expect(page.getByText('120.000 đ', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fixture product' }).first()).toHaveAttribute('href', `/products/${id}`);
  await expect(page.getByRole('link', { name: 'Fixture product' }).last()).toHaveAttribute('href', `/seller/inventory?productId=${id}`);
  await page.getByLabel('Nhóm theo').selectOption('MONTH');
  await page.getByRole('button', { name: 'Cập nhật' }).click();
  await expect(page.getByText(/múi giờ Asia\/Ho_Chi_Minh/)).toBeVisible();
  for (const viewport of [{ width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('heading', { name: 'Tổng quan shop' })).toBeVisible();
  }
});

test('seller dashboard renders deterministic zero analytics state', async ({ page }) => {
  await mockSellerApi(page, { zero: true });
  await page.goto('/seller');
  await expect(page.getByText('Chưa có dữ liệu')).toBeVisible();
  await expect(page.getByText(/Chưa có đơn hợp lệ/)).toBeVisible();
  await expect(page.getByText(/Không có biến thể nào sắp hết hàng/)).toBeVisible();
});

test('seller promotion voucher and discount journeys submit server-authoritative forms', async ({ page }) => {
  await mockSellerApi(page);
  await page.goto('/seller/promotions');
  await expect(page.getByRole('heading', { name: 'Khuyến mãi' })).toBeVisible();
  await page.getByLabel('Mã voucher').fill('E2E-VOUCHER');
  await page.getByLabel('Tên').fill('E2E voucher');
  await page.getByLabel('Mức giảm', { exact: true }).fill('10000');
  await page.getByRole('button', { name: 'Tạo voucher' }).click();
  await expect(page.getByText('E2E-VOUCHER')).toBeVisible();
  await page.getByRole('button', { name: 'Tạm dừng' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByRole('article').getByText('Tạm dừng')).toBeVisible();
  await page.getByRole('button', { name: 'Xóa' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận xóa' }).click();
  await page.getByRole('button', { name: 'Giảm giá sản phẩm' }).click();
  await page.getByLabel('Tên chương trình').fill('E2E discount');
  await page.getByLabel(/Product IDs \(bắt buộc/).fill(id);
  await page.getByRole('button', { name: 'Tạo chương trình' }).click();
  await expect(page.getByText('Fixture discount')).toBeVisible();
});

import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Credentials stay in an ignored local file; the capture report contains no session data.
const credentialsPath = process.env.README_ACCOUNTS_FILE;
if (!credentialsPath)
  throw new Error(
    'Set README_ACCOUNTS_FILE to a local JSON file with buyer, seller and admin email/password pairs.',
  );
const accounts = JSON.parse(await readFile(credentialsPath, 'utf8'));
const baseURL = process.env.README_WEB_URL ?? 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
  throw new Error('This documentation capture script only supports a local application.');
}
const output = path.resolve('docs/images/features');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const previous = await readFile(path.join(output, 'capture-report.json'), 'utf8')
  .then(JSON.parse)
  .catch(() => ({ captures: [] }));
const captures = previous.captures;
const failures = [];
const routes = {
  buyer: [
    ['buyer-home', '/'],
    ['buyer-catalog', '/search?q=iphone'],
    ['buyer-cart', '/cart'],
    ['buyer-orders', '/account/orders'],
    ['buyer-returns', '/account/returns'],
    ['buyer-favorites', '/account/favorites'],
    ['buyer-recently-viewed', '/account/recently-viewed'],
    ['buyer-followed-shops', '/account/followed-shops'],
    ['buyer-profile', '/account/profile'],
    ['buyer-addresses', '/account/addresses'],
    ['buyer-notifications', '/account/notifications'],
    ['buyer-reports', '/account/reports'],
  ],
  seller: [
    ['seller-dashboard', '/seller'],
    ['seller-products', '/seller/products'],
    ['seller-product-new', '/seller/products/new'],
    ['seller-inventory', '/seller/inventory'],
    ['seller-orders', '/seller/orders'],
    ['seller-promotions', '/seller/promotions'],
    ['seller-reviews', '/seller/reviews'],
    ['seller-returns', '/seller/returns'],
    ['seller-shop', '/seller/shop'],
    ['seller-moderation', '/seller/moderation'],
  ],
  admin: [
    ['admin-dashboard', '/admin'],
    ['admin-users', '/admin/users'],
    ['admin-shops', '/admin/shops'],
    ['admin-products', '/admin/products'],
    ['admin-categories', '/admin/categories'],
    ['admin-homepage', '/admin/homepage'],
    ['admin-moderation', '/admin/moderation'],
    ['admin-returns', '/admin/returns'],
    ['admin-audit', '/admin/audit'],
  ],
};

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((image) => image.loading !== 'lazy')
        .map((image) => image.decode().catch(() => {})),
    );
  });
}

async function capture(page, role, name, route, { fullPage = false } = {}) {
  if (route)
    await page.goto(new URL(route, baseURL).href, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
  await settle(page);
  if (new URL(page.url()).pathname !== '/')
    await expect(page.locator('h1, h2').first()).toBeVisible();
  const body = await page.locator('body').innerText();
  if (/Application error|Internal Server Error|Không có quyền truy cập|Cần đăng nhập/.test(body)) {
    throw new Error(`Page unavailable: ${name}`);
  }
  const png = await page.screenshot({
    path: path.join(output, `${name}.png`),
    fullPage,
    animations: 'disabled',
  });
  const existing = captures.findIndex((item) => item.file === `${name}.png`);
  if (existing !== -1) captures.splice(existing, 1);
  captures.push({
    role,
    file: `${name}.png`,
    route: new URL(page.url()).pathname + new URL(page.url()).search,
    capturedAt: new Date().toISOString(),
    viewport: { width: 1440, height: 1000 },
    image: { width: png.readUInt32BE(16), height: png.readUInt32BE(20) },
  });
  console.log(`CAPTURE ${name} (${png.readUInt32BE(16)} × ${png.readUInt32BE(20)})`);
}

try {
  for (const role of (process.env.README_ROLES ?? 'buyer,seller,admin').split(',')) {
    const account = accounts[role];
    if (!account?.email || !account?.password) throw new Error(`Missing ${role} credentials.`);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      locale: 'vi-VN',
    });
    context.setDefaultTimeout(20000);
    const page = await context.newPage();
    page.on('pageerror', (error) =>
      failures.push({ role, type: 'pageerror', message: error.message }),
    );
    await page.goto(new URL('/login', baseURL).href, { waitUntil: 'networkidle' });
    if (role === 'buyer') await capture(page, 'public', 'login', null);
    await page.getByLabel('Email', { exact: true }).fill(account.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
    for (const [name, route] of process.env.README_ONLY_EXTRA === '1' ? [] : routes[role]) {
      await capture(page, role, name, route, {
        fullPage: ['buyer-home', 'seller-product-new', 'seller-promotions'].includes(name),
      });
      if (name === 'buyer-catalog') {
        const product = await page.locator('a[href^="/products/"]').first().getAttribute('href');
        if (product) {
          await capture(page, role, 'buyer-product', product, { fullPage: true });
          const shop = await page.locator('a[href^="/shops/"]').first().getAttribute('href');
          if (shop) await capture(page, role, 'buyer-shop', shop);
        }
      }
      if (name === 'buyer-orders' || name === 'seller-orders') {
        const prefix = role === 'buyer' ? '/account/orders/' : '/seller/orders/';
        const links = page.locator(`a[href^="${prefix}"]`);
        if (await links.count())
          await capture(
            page,
            role,
            `${role}-order-detail`,
            await links.first().getAttribute('href'),
            { fullPage: true },
          );
      }
      if (name === 'seller-products') {
        const links = page
          .locator('a[href^="/seller/products/"]')
          .filter({ hasText: /Sửa|Chỉnh sửa|Chi tiết|Xem|Cập nhật sản phẩm/ });
        if (await links.count())
          await capture(
            page,
            role,
            'seller-product-edit',
            await links.first().getAttribute('href'),
            { fullPage: true },
          );
      }
      if (name === 'admin-products') {
        const product = captures.find((item) => item.file === 'buyer-product.png');
        if (product) {
          await page.getByPlaceholder(/Nhập slug/).fill(product.route.split('/').at(-1));
          await page.getByRole('button', { name: 'Tra cứu', exact: true }).click();
          await expect(page.getByRole('button', { name: 'Tra cứu', exact: true })).toBeEnabled();
          await capture(page, role, name, null, { fullPage: true });
        }
      }
      if (name === 'admin-moderation') {
        const cases = page.getByRole('button', { name: /^Mở hồ sơ/ });
        if (await cases.count()) {
          await cases.first().click();
          await settle(page);
          await capture(page, role, name, null, { fullPage: true });
        }
      }
    }
    if (process.env.README_EXTRA === '1') {
      if (role === 'buyer') {
        await page.goto(new URL('/cart', baseURL).href);
        await settle(page);
        const all = page.getByRole('checkbox', { name: /Chọn tất cả/ });
        const originallySelected = await all.isChecked();
        const originalLines = await page.getByRole('checkbox').evaluateAll((elements) =>
          elements
            .map((element) => ({
              label: element.getAttribute('aria-label'),
              checked: element.checked,
            }))
            .filter(
              (item) =>
                item.label?.startsWith('Chọn ') && !item.label.startsWith('Chọn sản phẩm của'),
            ),
        );
        try {
          if (!originallySelected) await all.click();
          await expect(all).toBeChecked();
          await expect(page.getByRole('button', { name: 'Mua hàng', exact: true })).toBeEnabled({
            timeout: 20000,
          });
          await settle(page);
          await capture(page, role, 'buyer-cart', null, { fullPage: true });
          await page
            .getByRole('button', { name: 'Mua hàng', exact: true })
            .click({ timeout: 20000 });
          await page.waitForURL('**/checkout');
          await expect(page.getByRole('heading', { name: 'Thanh toán', exact: true })).toBeVisible({
            timeout: 20000,
          });
          await expect(
            page
              .getByRole('button', { name: /Đặt hàng|Thanh toán với VNPAY|Thanh toán với MoMo/ })
              .last(),
          ).toBeEnabled({ timeout: 20000 });
          await capture(page, role, 'buyer-checkout', null, { fullPage: true });
        } finally {
          await page.goto(new URL('/cart', baseURL).href);
          await settle(page);
          for (const line of originalLines) {
            const checkbox = page.getByRole('checkbox', { name: line.label, exact: true });
            if ((await checkbox.isChecked()) !== line.checked) {
              await checkbox.click();
              await expect(checkbox).toBeChecked({ checked: line.checked });
            }
          }
        }
        await page.goto(new URL('/account/orders?filter=DELIVERED', baseURL).href);
        await settle(page);
        const delivered = page.locator('a[href^="/account/orders/"]');
        if (await delivered.count())
          await capture(
            page,
            role,
            'buyer-order-detail',
            await delivered.first().getAttribute('href'),
            { fullPage: true },
          );
        await page.goto(new URL('/account/profile/notifications', baseURL).href);
        await capture(page, role, 'buyer-notification-settings', null);
      }
      if (role === 'admin') {
        await page.goto(new URL('/admin/returns', baseURL).href);
        await settle(page);
        const returns = page.locator('a[href^="/admin/returns/"]');
        if (await returns.count())
          await capture(
            page,
            role,
            'admin-return-detail',
            await returns.first().getAttribute('href'),
            { fullPage: true },
          );
      }
      if (role === 'admin') {
        await context.close();
        continue;
      }
      const productRoute = captures.find((item) => item.file === 'buyer-product.png')?.route;
      await page.goto(new URL(role === 'seller' ? '/seller' : (productRoute ?? '/'), baseURL).href);
      await settle(page);
      if (role === 'buyer' && productRoute) {
        await page.getByRole('button', { name: 'Chat ngay', exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Nội dung tin nhắn' })).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
      } else {
        await page.getByRole('button', { name: 'Mở trò chuyện', exact: true }).click();
        const contacts = page.locator('.floating-chat__contact-item');
        await settle(page);
        if (await contacts.count()) {
          await contacts.first().click();
          await expect(page.locator('[aria-label="Đang tải tin nhắn"]')).toBeHidden({
            timeout: 20000,
          });
          await expect(page.getByRole('textbox', { name: 'Nội dung tin nhắn' })).toBeVisible();
        }
      }
      await capture(page, role, `${role}-chat`, null);
    }
    await context.close();
  }
} catch (error) {
  failures.push({ type: 'capture', message: error.message });
  throw error;
} finally {
  await browser.close();
  await writeFile(
    path.join(output, 'capture-report.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        source: 'Local Next.js + NestJS + PostgreSQL, authenticated accounts, no API mocks',
        captures,
        failures,
      },
      null,
      2,
    ) + '\n',
  );
}
if (failures.length) throw new Error(`${failures.length} browser errors; see capture-report.json.`);

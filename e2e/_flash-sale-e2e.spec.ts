import { expect, test, type Page } from '@playwright/test';

test.setTimeout(180_000);

const admin = { email: 'flash-sale-admin@example.test', password: 'ChatE2E-password' };
const seller = { email: 'flash-sale-seller@example.test', password: 'ChatE2E-password' };

function localDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function login(page: Page, account: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

test('Flash Sale campaign reaches seller enrollment and exposes the join-path blocker', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, admin);
  await adminPage.goto('/admin/campaigns');
  await expect(adminPage.getByRole('heading', { name: 'Tạo chiến dịch' })).toBeVisible();

  const title = `Flash Sale E2E ${Date.now()}`;
  const now = Date.now();
  const dates = [
    new Date(now - 120_000),
    new Date(now - 60_000),
    new Date(now + 240_000),
    new Date(now + 300_000),
    new Date(now + 600_000),
  ];
  await adminPage.getByLabel('Loại chiến dịch').selectOption('FLASH_SALE');
  await adminPage.getByLabel('Tiêu đề', { exact: true }).fill(title);
  await adminPage.getByLabel('Mô tả', { exact: true }).fill('Happy path Flash Sale E2E.');
  await adminPage.getByLabel('Nội dung', { exact: true }).fill('Nội dung Flash Sale E2E.');
  await adminPage.getByLabel('Giảm tối thiểu (%)', { exact: true }).fill('10');
  const dateInputs = adminPage.locator('input[type="datetime-local"]');
  for (let index = 0; index < dates.length; index += 1) {
    await dateInputs.nth(index).fill(localDateTime(dates[index]));
  }
  await adminPage.getByRole('button', { name: 'Tạo bản nháp', exact: true }).click();
  await expect(adminPage.getByText(title, { exact: true })).toBeVisible({ timeout: 15_000 });
  await adminPage.once('dialog', (dialog) => dialog.accept());
  await adminPage.getByRole('button', { name: `Đăng chiến dịch ${title}` }).click();
  const campaignRow = adminPage.getByRole('row').filter({ hasText: title });
  await expect(campaignRow.getByText('Đang nhận đăng ký', { exact: true })).toBeVisible({ timeout: 15_000 });
  await adminContext.close();

  const sellerContext = await browser.newContext();
  const sellerPage = await sellerContext.newPage();
  await login(sellerPage, seller);
  await sellerPage.goto('/seller/campaigns');
  await expect(sellerPage.getByText(title, { exact: true })).toBeVisible({ timeout: 15_000 });
  await sellerPage.getByRole('button', { name: `Xem chi tiết chiến dịch ${title}` }).click();
  await expect(sellerPage.getByRole('heading', { name: title })).toBeVisible({ timeout: 15_000 });
  await expect(sellerPage.getByText('Đang nhận đăng ký', { exact: true })).toBeVisible();

  // Flash Sale currently renders SKU registration, but does not render the
  // generic seller participation action required by the registration API.
  await expect(sellerPage.getByRole('button', { name: 'Tham gia chiến dịch', exact: true })).toHaveCount(1);
  await sellerContext.close();
});

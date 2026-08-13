import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const profile = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer Example',
  phoneNumber: '0912345678',
  status: 'active',
  roles: ['buyer'],
};
const address = {
  id: '00000000-0000-4000-8000-000000000801',
  recipientName: 'Nguyen Van A',
  phoneNumber: '0912345678',
  province: 'Ha Noi',
  district: 'Ba Dinh',
  ward: 'Phuc Xa',
  addressLine: '12 Hang Than',
  label: 'Nhà riêng',
  isDefault: true,
  createdAt: '2026-08-12T01:00:00.000Z',
  updatedAt: '2026-08-12T01:00:00.000Z',
};

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

async function routeAuthenticatedAccount(page: Page) {
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-13T03:00:00.000Z',
        user: {
          id: profile.id,
          email: profile.email,
          displayName: profile.displayName,
          status: profile.status,
          roles: profile.roles,
        },
      }),
    });
  });
  await page.route('**/api/v1/account/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(profile),
    });
  });
  await page.route('**/api/v1/account/addresses', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [address] }),
    });
  });
}

test.describe('buyer profile and address management', () => {
  test('keeps guest account routes protected with safe internal login return paths', async ({
    page,
  }) => {
    await page.route('**/api/v1/auth/refresh', async (route) => route.fulfill({ status: 401 }));
    await page.goto('/account/profile');
    await expect(
      page.getByRole('heading', { name: 'Đăng nhập để quản lý tài khoản' }),
    ).toBeVisible();
    const signIn = page.getByRole('link', { name: 'Đăng nhập', exact: true });
    await expect(signIn).toHaveAttribute('href', '/login?returnTo=%2Faccount%2Fprofile');
    await signIn.click();
    await expect(page).toHaveURL('/login?returnTo=%2Faccount%2Fprofile');
    await expect(page.getByRole('link', { name: 'Tiếp tục với Google' })).toHaveAttribute(
      'href',
      /returnTo=%2Faccount%2Fprofile$/,
    );
    expect(page.url()).not.toMatch(/phone|addressLine|recipientName/);
    await expectAccessible(page);
  });

  test('renders authenticated account data without mutations, URL contact data, or browser storage', async ({
    page,
  }) => {
    await routeAuthenticatedAccount(page);
    await page.goto('/account/profile');
    await expect(page.getByRole('heading', { name: 'Hồ sơ cá nhân' })).toBeVisible();
    await expect(page.getByText(profile.email)).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Số điện thoại/ })).toHaveValue(
      profile.phoneNumber,
    );
    await expect(
      page.getByRole('link', { name: 'Địa chỉ nhận hàng', exact: true }),
    ).toHaveAttribute('href', '/account/addresses');
    await expectAccessible(page);

    await page.goto('/account/addresses');
    await expect(page.getByRole('heading', { name: 'Địa chỉ nhận hàng' })).toBeVisible();
    await expect(page.getByText(address.recipientName)).toBeVisible();
    await expect(page.getByText('Địa chỉ mặc định', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Thêm địa chỉ' }).click();
    await page.getByLabel('Tỉnh/Thành phố').click();
    await expect(page.getByRole('dialog', { name: 'Chọn tỉnh/thành phố' })).toBeVisible();
    await page.getByLabel('Tìm kiếm tỉnh/thành phố').fill('ha noi');
    await expect(page.getByRole('option', { name: 'Thành phố Hà Nội' })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('option', { name: 'Thành phố Hà Nội' }).click();
    await page.getByLabel('Quận/Huyện').click();
    await page.getByLabel('Tìm kiếm quận/huyện').fill('ba dinh');
    await expect(page.getByRole('option', { name: 'Quận Ba Đình' })).toBeVisible();
    await page.getByRole('option', { name: 'Quận Ba Đình' }).click();
    const privacy = await page.evaluate(() => ({
      url: location.href,
      local: JSON.stringify(localStorage),
      session: JSON.stringify(sessionStorage),
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(privacy.url).not.toContain(address.phoneNumber);
    expect(privacy.local).not.toContain(address.phoneNumber);
    expect(privacy.session).not.toContain(address.phoneNumber);
    expect(privacy.scrollWidth).toBeLessThanOrEqual(privacy.width);
    await expectAccessible(page);
  });
});

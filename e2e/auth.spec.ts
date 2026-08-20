import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

async function latestResetUrl(email: string): Promise<string> {
  const capturePath = process.env.AUTH_RECOVERY_CAPTURE_PATH;
  if (!capturePath) throw new Error('AUTH_RECOVERY_CAPTURE_PATH is required for full auth E2E.');
  let resetUrl = '';
  await expect
    .poll(
      async () => {
        try {
          const messages = (await readFile(capturePath, 'utf8'))
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line) as { email: string; resetUrl: string });
          resetUrl = messages.filter((message) => message.email === email).at(-1)?.resetUrl ?? '';
          return resetUrl;
        } catch {
          return '';
        }
      },
      { timeout: 10_000 },
    )
    .not.toBe('');
  return resetUrl;
}

test.describe('secure account authentication', () => {
  test('keeps guest and buyer-only operational routes role-aware and accessible', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Kênh người bán' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Quản trị' })).toHaveCount(0);

    await page.goto('/seller');
    await expect(page.getByRole('heading', { name: 'Cần đăng nhập' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true })).toHaveAttribute(
      'href',
      '/login',
    );
    await expectAccessible(page);

    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'header.payload.signature',
          expiresAt: '2099-08-13T03:00:00.000Z',
          user: {
            id: '00000000-0000-4000-8000-000000000001',
            email: 'buyer@example.test',
            displayName: 'Buyer Example',
            status: 'active',
            roles: ['buyer'],
          },
        }),
      });
    });
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible();
    await expect(page.getByText('Tài khoản hiện tại chưa được cấp quyền phù hợp.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Kênh người bán' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Quản trị' })).toHaveCount(0);
    await expectAccessible(page);

    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  });

  test('renders responsive guest account pages with validation and accessibility', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tiếp tục với Google' })).toHaveAttribute(
      'href',
      /\/api\/v1\/auth\/google\/start\?returnTo=%2F$/,
    );
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.locator('.account-form__message[role="alert"]').first()).toContainText(
      'email và mật khẩu hợp lệ',
    );
    await expect(page.getByLabel('Mật khẩu')).toHaveValue('');
    await expectAccessible(page);

    await page.goto('/login/google/complete?outcome=cancelled&returnTo=%2F');
    await expect(page.locator('.account-form__message[role="alert"]')).toContainText(
      'hủy đăng nhập Google',
    );
    await expect(page).toHaveURL('/login/google/complete');
    await expect(page.getByRole('link', { name: 'Quay lại đăng nhập' })).toBeVisible();
    await expectAccessible(page);

    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Tạo tài khoản' })).toBeVisible();
    await expect(page.getByText('Dùng 8–128 ký tự')).toBeVisible();
    await expectAccessible(page);

    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Quên mật khẩu' })).toBeVisible();
    await expectAccessible(page);

    await page.goto('/reset-password');
    await expect(page.locator('.account-form__message[role="alert"]').first()).toContainText(
      'không hợp lệ',
    );
    await expect(page.getByRole('button', { name: 'Đổi mật khẩu' }).first()).toBeDisabled();
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
  });

  test('registers, restores, safely returns, logs out, and recovers an account', async ({
    page,
  }, testInfo) => {
    test.skip(
      process.env.QUICK_E2E === '1',
      'Quick auth E2E never creates credentials against already-running services.',
    );
    const email = `t11-${testInfo.project.name}@example.test`;
    const initialPassword = `T11 initial ${testInfo.project.name} passphrase`;
    const replacementPassword = `T11 replacement ${testInfo.project.name} passphrase`;
    const productId = '62852d61-b95f-53cd-bcac-c832a6c47877';
    const variantId = '0024503e-074e-5e2a-a990-4a51d58bdaa7';

    await page.goto('/register');
    await page.getByLabel('Tên hiển thị').fill(`Buyer ${testInfo.project.name}`);
    await page.getByLabel('Email').fill(email.toUpperCase());
    await page.getByLabel('Mật khẩu', { exact: true }).fill(initialPassword);
    await page.getByLabel('Nhập lại mật khẩu').fill(initialPassword);
    await page.getByRole('button', { name: 'Đăng ký' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByLabel(`Tài khoản Buyer ${testInfo.project.name}`)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(`Tài khoản Buyer ${testInfo.project.name}`)).toBeVisible();
    await page.getByLabel(`Tài khoản Buyer ${testInfo.project.name}`).hover();
    await page.getByRole('menuitem', { name: 'Đăng xuất' }).click();
    await expect(page.getByRole('link', { name: 'Đăng nhập · Chưa đăng nhập' })).toBeVisible();

    const intent = new URLSearchParams({
      intent: 'buy-now',
      productId,
      variantId,
      quantity: '1',
      returnTo: `/products/${productId}`,
    });
    await page.goto(`/login?${intent.toString()}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mật khẩu').fill('not the password');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.locator('.account-form__message[role="alert"]').first()).toContainText(
      'Không thể đăng nhập',
    );
    await expect(page.getByLabel('Mật khẩu')).toHaveValue('');
    await page.getByLabel('Mật khẩu').fill(initialPassword);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page).toHaveURL(`/products/${productId}`);
    await expect(
      page.getByRole('heading', { name: 'Thùng 24 chai nước kiềm có khoáng La Vie + 500ml' }),
    ).toBeVisible();

    await page.goto(
      `/login?intent=buy-now&productId=${productId}&variantId=${variantId}&quantity=1&returnTo=https%3A%2F%2Fattacker.example`,
    );
    await expect(page.getByText(/Thao tác chưa được thực hiện/)).toHaveCount(0);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mật khẩu').fill(initialPassword);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page).toHaveURL('/');

    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Gửi hướng dẫn' }).click();
    await expect(page.getByRole('status')).toContainText('Nếu tài khoản đủ điều kiện');
    const resetUrl = await latestResetUrl(email);
    const reset = new URL(resetUrl);
    await page.goto(`${reset.pathname}${reset.search}`);
    await page.getByLabel('Mật khẩu mới', { exact: true }).fill(replacementPassword);
    await page.getByLabel('Nhập lại mật khẩu mới').fill(replacementPassword);
    await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
    await expect(page).toHaveURL('/login?reset=success');
    await expect(page.getByRole('status')).toContainText('Mật khẩu đã được đổi');
    expect(page.url()).not.toContain('token=');

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mật khẩu').fill(initialPassword);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.locator('.account-form__message[role="alert"]').first()).toContainText(
      'Không thể đăng nhập',
    );
    await page.getByLabel('Mật khẩu').fill(replacementPassword);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page).toHaveURL('/');

    await page.goto('/login');
    if (process.env.QUICK_E2E !== '1') {
      await expect(page).toHaveScreenshot('authentication.png', {
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
});

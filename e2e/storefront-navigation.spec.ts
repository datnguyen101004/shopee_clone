import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('global storefront navigation', () => {
  test('submits a normalized catalogue query through the shared search form', async ({ page }) => {
    await page.goto('/');
    const input = page.getByRole('searchbox', { name: 'Tìm kiếm sản phẩm' });
    await input.fill('  tai nghe bluetooth  ');
    await page.getByRole('button', { name: 'Tìm kiếm' }).click();
    await expect(page).toHaveURL(/\/search\?q=tai\+nghe\+bluetooth$/);
    await expect(page.getByRole('heading', { name: 'Kết quả tìm kiếm' })).toBeVisible();
    await expect(page.getByText(/tai nghe bluetooth/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Đăng nhập · Chưa đăng nhập' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Giỏ hàng, 0 sản phẩm' })).toBeVisible();
  });

  test('validates empty search without leaving the route', async ({ page }) => {
    await page.goto('/');
    const input = page.getByRole('searchbox', { name: 'Tìm kiếm sản phẩm' });
    await input.fill('   ');
    await page.getByRole('button', { name: 'Tìm kiếm' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(input).toHaveAccessibleDescription('Vui lòng nhập từ khoá cần tìm.');
    await expect(input).toBeFocused();
  });

  test('keeps the header keyboard-operable and responsive', async ({ page }, testInfo) => {
    await page.goto('/');
    const documentSize = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(documentSize.scrollWidth).toBeLessThanOrEqual(documentSize.width);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Bỏ qua đến nội dung chính' })).toBeFocused();

    const logo = page.getByRole('link', { name: 'Shopee Clone - Trang chủ' });
    await page.keyboard.press('Tab');
    if (testInfo.project.name === 'mobile') {
      await expect(logo).toBeFocused();
    } else {
      await expect(page.getByRole('link', { name: 'Kênh người bán' })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(logo).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(page.getByRole('searchbox', { name: 'Tìm kiếm sản phẩm' })).toBeFocused();

    for (const buyerAction of [
      page.getByRole('link', { name: 'Đăng nhập · Chưa đăng nhập' }),
      page.getByRole('link', { name: 'Giỏ hàng, 0 sản phẩm' }),
    ]) {
      const box = await buyerAction.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    if (testInfo.project.name === 'mobile') {
      const trigger = page.getByRole('button', { name: 'Danh mục' });
      const firstCategory = page
        .getByRole('navigation', { name: 'Điều hướng chính' })
        .getByRole('link', { name: 'Thiết bị điện tử' });
      await expect(firstCategory).toBeHidden();
      await trigger.focus();
      await page.keyboard.press('Space');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(firstCategory).toBeVisible();
      expect((await trigger.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press('Escape');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(firstCategory).toBeHidden();
      await expect(trigger).toBeFocused();
    } else {
      await expect(
        page
          .getByRole('navigation', { name: 'Điều hướng chính' })
          .getByRole('link', { name: 'Thiết bị điện tử' }),
      ).toBeVisible();
    }
  });

  test('passes accessibility checks on buyer placeholder destinations', async ({ page }) => {
    for (const route of ['/search?q=tai+nghe', '/login', '/cart']) {
      await page.goto(route);
      await expect(page.locator('main')).toHaveCount(1);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, `Accessibility violations at ${route}`).toEqual([]);
    }
  });
});

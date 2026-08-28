import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';

/**
 * This suite intentionally has no route mocks. The release wrapper supplies
 * per-breakpoint refresh cookies and a seeded product/shop, so each browser
 * obtains a real session and the chat widget obtains a real Socket.IO ticket.
 */
const buyerRefreshToken = process.env.CHAT_E2E_BUYER_REFRESH_TOKEN;
const sellerRefreshToken = process.env.CHAT_E2E_SELLER_REFRESH_TOKEN;
const productId = process.env.CHAT_E2E_PRODUCT_ID;
const shopSlug = process.env.CHAT_E2E_SHOP_SLUG;
const shopName = process.env.CHAT_E2E_SHOP_NAME;
const temporaryShopSlug = process.env.CHAT_E2E_TEMPORARY_SHOP_SLUG;
const buyerEmail = process.env.CHAT_E2E_BUYER_EMAIL ?? 'chat-e2e-buyer@example.test';
const buyerPassword = process.env.CHAT_E2E_BUYER_PASSWORD ?? 'ChatE2E-password';
const adminRefreshToken = process.env.CHAT_E2E_ADMIN_REFRESH_TOKEN;
const safetyCaseId = process.env.CHAT_E2E_SAFETY_CASE_ID;

type ProjectTokens = { buyer: string; seller: string };
type TokenMatrix = Record<string, ProjectTokens | undefined>;

function projectTokens(projectName: string, scenario = 'exchange'): ProjectTokens {
  try {
    const parsed = JSON.parse(process.env.CHAT_E2E_REFRESH_TOKENS ?? '{}') as Record<
      string,
      TokenMatrix | ProjectTokens
    >;
    const project = parsed[projectName];
    const pair = project && 'buyer' in project ? project : project?.[scenario];
    if (pair?.buyer && pair.seller) return pair as ProjectTokens;
  } catch {
    // Fall back to the legacy pair below so manually supplied fixtures remain usable.
  }
  return {
    buyer: requireFixture(buyerRefreshToken, 'CHAT_E2E_BUYER_REFRESH_TOKEN'),
    seller: requireFixture(sellerRefreshToken, 'CHAT_E2E_SELLER_REFRESH_TOKEN'),
  };
}

function requireFixture(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required for the real chat Playwright gate.`);
  return value;
}

function projectAdminToken(projectName: string): string {
  try {
    const parsed = JSON.parse(process.env.CHAT_E2E_ADMIN_REFRESH_TOKENS ?? '{}') as Record<string, string>;
    if (parsed[projectName]) return parsed[projectName];
  } catch {
    // Fall back to the manually supplied single token below.
  }
  return requireFixture(adminRefreshToken, 'CHAT_E2E_ADMIN_REFRESH_TOKEN');
}

async function authenticate(context: BrowserContext, refreshToken: string) {
  const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001').origin;
  await context.addCookies([
    {
      name: 'sc_refresh',
      value: refreshToken,
      url: apiOrigin,
    },
  ]);
}

test.describe('floating chat real PostgreSQL + Socket.IO journeys', () => {
  test.beforeEach(() => {
    requireFixture(productId, 'CHAT_E2E_PRODUCT_ID');
    requireFixture(shopSlug, 'CHAT_E2E_SHOP_SLUG');
    requireFixture(shopName, 'CHAT_E2E_SHOP_NAME');
    requireFixture(temporaryShopSlug, 'CHAT_E2E_TEMPORARY_SHOP_SLUG');
  });

  test('resolves an existing conversation outside the first contact page', async ({
    browser,
  }, testInfo) => {
    const buyer = await browser.newContext();
    try {
      await authenticate(buyer, projectTokens(testInfo.project.name, 'existing').buyer);
      const page = await buyer.newPage();
      await page.goto(`/products/${productId}`);
      await page.getByRole('button', { name: 'Chat ngay' }).click();
      await expect(page.getByRole('dialog', { name: 'Trò chuyện' })).toBeVisible();
      await expect(
        page.getByLabel('Nội dung cuộc trò chuyện').getByText('Lịch sử có sẵn'),
      ).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole('button', { name: /Chat E2E Filler 01/ })).toBeVisible();
    } finally {
      await buyer.close();
    }
  });

  test('discards an empty temporary target without creating a conversation', async ({
    browser,
  }, testInfo) => {
    const buyer = await browser.newContext();
    try {
      await authenticate(buyer, projectTokens(testInfo.project.name, 'temporary').buyer);
      const page = await buyer.newPage();
      await page.goto(`/shops/${temporaryShopSlug}`);
      await page.getByRole('button', { name: 'Chat ngay' }).click();
      const dialog = page.getByRole('dialog', { name: 'Trò chuyện' });
      await expect(dialog).toBeVisible();
      await expect(page.getByLabel('Nội dung tin nhắn')).toBeVisible();
      await dialog.getByRole('button', { name: 'Đóng trò chuyện' }).click();
      await page.getByRole('button', { name: 'Mở trò chuyện' }).click();
      await expect(page.getByRole('button', { name: /Chat E2E Temporary Seller/ })).toHaveCount(0);
    } finally {
      await buyer.close();
    }
  });

  test('opens from a public shop and disables chat for the shop owner', async ({
    browser,
  }, testInfo) => {
    const buyer = await browser.newContext();
    const seller = await browser.newContext();
    try {
      const tokens = projectTokens(testInfo.project.name, 'public');
      await authenticate(buyer, tokens.buyer);
      await authenticate(seller, tokens.seller);
      const buyerPage = await buyer.newPage();
      const sellerPage = await seller.newPage();
      await buyerPage.goto(`/shops/${shopSlug}`);
      await expect(
        buyerPage.getByRole('button', { name: /Tài khoản Chat E2E Buyer/ }),
      ).toBeVisible({ timeout: 15_000 });
      await buyerPage.getByRole('button', { name: 'Chat ngay' }).click();
      await expect(buyerPage.getByRole('dialog', { name: 'Trò chuyện' })).toBeVisible();
      await sellerPage.goto(`/products/${productId}`);
      await expect(
        sellerPage.getByRole('button', { name: /Tài khoản/ }),
      ).toBeVisible({ timeout: 15_000 });
      const selfChat = sellerPage.getByRole('button', { name: 'Chat ngay' });
      await expect(selfChat).toBeDisabled();
      await expect(selfChat).toHaveAttribute('title', 'Bạn không thể chat với chính shop của mình');
    } finally {
      await buyer.close();
      await seller.close();
    }
  });

  test('opens checkout with a seeded address and keeps the shop chat action reachable', async ({
    browser,
  }, testInfo) => {
    const buyer = await browser.newContext();
    try {
      await authenticate(buyer, projectTokens(testInfo.project.name, 'checkout').buyer);
      const page = await buyer.newPage();
      await page.goto('/checkout');
      await expect(page.getByRole('heading', { name: 'Thanh toán', exact: true })).toBeVisible({
        timeout: 15_000,
      });
      const chatButton = page.getByRole('button', { name: 'Chat ngay' }).first();
      await expect(chatButton).toBeVisible({ timeout: 15_000 });
      await chatButton.click();
      await expect(page.getByRole('dialog', { name: 'Trò chuyện' })).toBeVisible();
    } finally {
      await buyer.close();
    }
  });

  test('continues a guest shop action through login and returns to the product', async ({
    browser,
  }) => {
    const guest = await browser.newContext();
    try {
      const page = await guest.newPage();
      await page.goto(`/products/${productId}`);
      await page.getByRole('button', { name: 'Chat ngay' }).click();
      await expect(page).toHaveURL(new RegExp(`/login\\?returnTo=%2Fproducts%2F${productId}`));
      await page.getByLabel('Email').fill(buyerEmail);
      await page.getByLabel('Mật khẩu').fill(buyerPassword);
      await page.getByRole('button', { name: 'Đăng nhập' }).click();
      await expect(page).toHaveURL(new RegExp(`/products/${productId}`), { timeout: 15_000 });
      await expect(page.getByRole('dialog', { name: 'Trò chuyện' })).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await guest.close();
    }
  });

  test('keeps the realtime surface accessible at every breakpoint and under reduced motion', async ({
    browser,
  }, testInfo) => {
    const buyer = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      await authenticate(buyer, projectTokens(testInfo.project.name, 'accessibility').buyer);
      const page = await buyer.newPage();
      await page.goto('/account/profile');
      const trigger = page.getByRole('button', { name: 'Mở trò chuyện' });
      await expect(trigger).toBeVisible();
      const triggerBox = await trigger.boundingBox();
      expect(triggerBox?.width).toBeGreaterThanOrEqual(44);
      expect(triggerBox?.height).toBeGreaterThanOrEqual(44);
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Trò chuyện' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/Đang hoạt động|Không hoạt động/).first()).toBeVisible({
        timeout: 15_000,
      });
      const close = dialog.getByRole('button', { name: 'Đóng trò chuyện' });
      const closeBox = await close.boundingBox();
      expect(closeBox?.width).toBeGreaterThanOrEqual(44);
      expect(closeBox?.height).toBeGreaterThanOrEqual(44);
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
      const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      expect(
        axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
      ).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
    } finally {
      await buyer.close();
    }
  });

  test('exchanges a message between two authenticated browser sessions without realtime mocks', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    const tokens = projectTokens(testInfo.project.name, 'exchange');
    const buyer = await browser.newContext();
    const buyerTab = await browser.newContext();
    const seller = await browser.newContext();
    try {
      await authenticate(buyer, tokens.buyer);
      await authenticate(buyerTab, projectTokens(testInfo.project.name, 'multitab').buyer);
      await authenticate(seller, tokens.seller);
      const buyerPage = await buyer.newPage();
      const buyerTabPage = await buyerTab.newPage();
      const sellerPage = await seller.newPage();
      await Promise.all([
        buyerPage.goto(`/products/${productId}`),
        buyerTabPage.goto('/account/profile'),
        sellerPage.goto('/account/profile'),
      ]);

      await expect(
        buyerPage.getByRole('button', { name: /Tài khoản Chat E2E Buyer/ }),
      ).toBeVisible({ timeout: 15_000 });
      await buyerPage.getByRole('button', { name: 'Chat ngay' }).click();
      await expect(buyerPage.getByRole('dialog', { name: 'Trò chuyện' })).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        buyerTabPage.getByRole('button', { name: /Tài khoản Chat E2E Buyer/ }),
      ).toBeVisible({ timeout: 15_000 });
      await buyerTabPage.getByRole('button', { name: 'Mở trò chuyện' }).click();
      await expect(buyerTabPage.getByRole('dialog', { name: 'Trò chuyện' })).toBeVisible({
        timeout: 15_000,
      });
      const firstMessage = `realtime-${Date.now()}`;
      await buyerPage.getByLabel('Nội dung tin nhắn').fill(firstMessage);
      await buyerPage.getByRole('button', { name: 'Gửi' }).click();
      const buyerTabContact = buyerTabPage.getByRole('button', {
        name: new RegExp(shopName!, 'i'),
      });
      await expect(buyerTabContact).toBeVisible({ timeout: 15_000 });
      await buyerTabContact.click();
      await expect(
        buyerTabPage.getByLabel('Nội dung cuộc trò chuyện').getByText(firstMessage),
      ).toBeVisible({ timeout: 15_000 });

      await expect(sellerPage.getByRole('button', { name: /Tài khoản/ })).toBeVisible({
        timeout: 15_000,
      });
      await sellerPage.getByRole('button', { name: 'Mở trò chuyện' }).click();
      await expect(sellerPage.getByRole('dialog', { name: 'Trò chuyện' })).toBeVisible();
      await sellerPage.getByRole('button', { name: /Chat E2E Buyer/ }).click();
      await expect(
        sellerPage.getByLabel('Nội dung cuộc trò chuyện').getByText(firstMessage),
      ).toBeVisible({ timeout: 15_000 });
      const reply = `reply-${Date.now()}`;
      await sellerPage.getByLabel('Nội dung tin nhắn').fill(reply);
      await sellerPage.getByRole('button', { name: 'Gửi' }).click();
      await expect(buyerPage.getByLabel('Nội dung cuộc trò chuyện').getByText(reply)).toBeVisible({
        timeout: 15_000,
      });
      await sellerPage.getByLabel('Nội dung cuộc trò chuyện').click();
      await expect(sellerPage.getByText('Đã xem')).toBeVisible({ timeout: 10_000 });
      await buyerPage.reload();
      const buyerDialog = buyerPage.getByRole('dialog', { name: 'Trò chuyện' });
      const contact = buyerPage.getByRole('button', { name: new RegExp(shopName!, 'i') });
      try {
        await expect(buyerDialog).toBeVisible({ timeout: 15_000 });
      } catch {
        await buyerPage.getByRole('button', { name: 'Mở trò chuyện' }).click();
        await expect(buyerDialog).toBeVisible({ timeout: 15_000 });
      }
      await expect(contact).toBeVisible({ timeout: 15_000 });
      await contact.click();
      await expect(buyerPage.getByLabel('Nội dung cuộc trò chuyện').getByText(reply)).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await buyer.close();
      await buyerTab.close();
      await seller.close();
    }
  });

  test('covers safety actions, report receipt, notification opening, admin action, and reconnect recovery', async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(120_000);
    const adminToken = projectAdminToken(testInfo.project.name);
    requireFixture(safetyCaseId, 'CHAT_E2E_SAFETY_CASE_ID');
    const buyer = await browser.newContext();
    const admin = await browser.newContext();
    try {
      await authenticate(buyer, projectTokens(testInfo.project.name, 'safety').buyer);
      const buyerPage = await buyer.newPage();
      await buyerPage.goto('/account/profile');
      await buyerPage.getByRole('button', { name: 'Mở trò chuyện' }).click();
      const dialog = buyerPage.getByRole('dialog', { name: 'Trò chuyện' });
      await expect(dialog).toBeVisible();

      const contactRow = dialog
        .locator('.floating-chat__contact-row')
        .filter({ hasText: 'Chat E2E Filler 01' })
        .first();
      await expect(contactRow).toBeVisible({ timeout: 15_000 });
      const contactActions = contactRow.getByRole('button', { name: 'Tùy chọn cuộc trò chuyện' });

      await contactActions.click();
      const contactMenu = dialog.getByRole('menu');
      await expect(contactMenu.getByRole('menuitem', { name: 'Bật thông báo' })).toBeVisible();
      await contactMenu.getByRole('menuitem', { name: 'Bật thông báo' }).click();
      await expect(contactRow.getByText(/Đã tắt thông báo/)).toHaveCount(0);

      await contactActions.click();
      await expect(dialog.getByRole('menu').getByRole('menuitem', { name: 'Bỏ chặn' })).toBeVisible();
      await dialog.getByRole('menu').getByRole('menuitem', { name: 'Bỏ chặn' }).click();
      await expect(contactRow.getByText(/Đã chặn/)).toHaveCount(0);

      const contact = contactRow.getByRole('button', { name: /Chat E2E Filler 01/ });
      await contact.click();
      const messages = dialog.getByLabel('Nội dung cuộc trò chuyện');
      await expect(messages.getByText('Tin nhắn filler 1', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

      const firstMessage = dialog
        .locator('.floating-chat__message-line')
        .filter({ hasText: 'Tin nhắn filler 1' })
        .first();
      await firstMessage.getByRole('button', { name: /Tùy chọn tin nhắn lúc/ }).dispatchEvent('click');
      await buyerPage.getByRole('menuitem', { name: 'Trả lời' }).click();
      const replyStatus = dialog.getByRole('status').filter({ hasText: 'Đang trả lời' });
      await expect(replyStatus).toBeVisible();
      await replyStatus.getByRole('button', { name: 'Hủy' }).click();

      await firstMessage.getByRole('button', { name: /Tùy chọn tin nhắn lúc/ }).dispatchEvent('click');
      await buyerPage.getByRole('menuitem', { name: 'Báo cáo' }).click();
      const reportDialog = buyerPage.getByRole('dialog', { name: 'Báo cáo tin nhắn' });
      await expect(reportDialog).toBeVisible();
      await reportDialog.getByRole('combobox').selectOption('SPAM');
      await reportDialog.getByRole('button', { name: 'Gửi báo cáo' }).click();
      await expect(buyerPage.getByRole('status').filter({ hasText: 'Đã gửi báo cáo' })).toBeVisible({
        timeout: 15_000,
      });

      // Restore the seeded state so the same deterministic journey can run at
      // the tablet and desktop projects without sharing mutations.
      await contactActions.click();
      await dialog.getByRole('menu').getByRole('menuitem', { name: 'Tắt thông báo' }).click();
      await contactActions.click();
      await dialog.getByRole('menu').getByRole('menuitem', { name: 'Chặn' }).click();
      const blockDialog = buyerPage.getByRole('alertdialog', { name: 'Xác nhận chặn người dùng' });
      await blockDialog.getByRole('button', { name: 'Chặn' }).click();
      await expect(contactRow.getByText(/Đã chặn/)).toBeVisible();

      await dialog.getByRole('button', { name: 'Đóng trò chuyện' }).click();
      await expect(buyerPage.getByRole('button', { name: 'Mở trò chuyện' })).toBeVisible();
      await buyerPage.goto('/account/notifications');
      await expect(buyerPage.getByRole('heading', { name: 'Thông báo', exact: true })).toBeVisible({ timeout: 15_000 });
      const notification = buyerPage.locator('button').filter({ hasText: 'Tin nhắn fixture chat' }).first();
      await expect(notification).toHaveCount(1, { timeout: 15_000 });
      await notification.click({ force: true });
      await expect(buyerPage.getByRole('dialog', { name: 'Trò chuyện' })).toBeVisible({ timeout: 15_000 });
      const openedContact = buyerPage.getByRole('button', { name: /Chat E2E Filler 01/ });
      await expect(openedContact).toHaveClass(/is-selected/, { timeout: 15_000 });
      await expect(buyerPage.getByLabel('Nội dung cuộc trò chuyện').getByText('Tin nhắn filler 1', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      await dialog.getByRole('button', { name: 'Đóng trò chuyện' }).click();
      await expect(buyerPage.getByRole('button', { name: 'Mở trò chuyện' })).toBeVisible();
      await buyerPage.reload();
      await expect(buyerPage.getByRole('button', { name: 'Mở trò chuyện' })).toBeVisible();

      await authenticate(admin, adminToken);
      const adminPage = await admin.newPage();
      await adminPage.goto('/admin/moderation');
      await expect(adminPage.getByRole('heading', { name: 'Trung tâm Kiểm duyệt & Tố cáo' })).toBeVisible({ timeout: 15_000 });
      await adminPage.getByRole('combobox', { name: 'Trạng thái hồ sơ' }).selectOption('');
      const caseSearch = adminPage.getByLabel('Tìm mã hồ sơ hoặc đối tượng');
      await caseSearch.fill(safetyCaseId!);
      await caseSearch.press('Enter');
      const caseCard = adminPage
        .getByRole('button', { name: /Mở hồ sơ Chat E2E Filler 01/ })
        .filter({ hasText: 'Chờ xử lý' })
        .first();
      await expect(caseCard).toBeVisible({ timeout: 15_000 });
      await caseCard.click();
      await expect(adminPage.getByRole('heading', { name: 'Ngữ cảnh chat giới hạn' })).toBeVisible({ timeout: 15_000 });
      await adminPage.getByLabel('Không xử lý').check();
      await adminPage.getByLabel('Lý do công khai').fill('Đã kiểm tra nội dung báo cáo');
      await adminPage.getByLabel(/Ghi chú nội bộ/).fill('Xác minh luồng xử lý của quản trị viên.');
      await adminPage.getByRole('button', { name: 'Xác nhận áp dụng quyết định' }).click();
      const confirmation = adminPage.getByRole('alertdialog', { name: /Xác nhận/ });
      await expect(confirmation).toBeVisible();
      await confirmation.getByRole('button', { name: 'Xác nhận' }).click();
      await expect(adminPage.locator('.admin-detail-header .admin-badge')).toHaveText('Đã giải quyết', { timeout: 15_000 });
    } finally {
      await buyer.close();
      await admin.close();
    }
  });
});

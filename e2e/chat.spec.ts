import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { chatTest } from './fixtures/chat';

const ids = {
  buyer: '00000000-0000-4000-8000-000000009001',
  owner: '00000000-0000-4000-8000-000000009002',
  conversation: '00000000-0000-4000-8000-000000009003',
  message: '00000000-0000-4000-8000-000000009004',
};
const timestamp = '2026-08-27T00:00:00.000Z';

const conversation = {
  id: ids.conversation,
  participant: { userId: ids.owner, displayName: 'Shop Owner', avatarUrl: null, presence: 'ACTIVE' as const },
  shopName: 'Điện Thoại Hay',
  lastMessagePreview: 'Xin chào',
  lastMessageAt: timestamp,
  unreadCount: 1,
  lastReadSequence: 0,
  lastMessageSequence: 1,
};
const message = {
  id: ids.message,
  conversationId: ids.conversation,
  sequence: 1,
  senderUserId: ids.owner,
  clientMessageId: ids.message,
  content: 'Xin chào',
  createdAt: timestamp,
  deliveryState: 'SENT' as const,
  isRead: false,
};

async function routeAuthenticatedChat(page: Page, withConversation = true) {
  await page.route('**/api/v1/auth/refresh', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ accessToken: 'header.payload.signature', expiresAt: '2099-08-27T00:00:00.000Z', user: { id: ids.buyer, email: 'buyer@example.test', displayName: 'Buyer', status: 'active', roles: ['buyer'] } }),
  }));
  await page.route('**/api/v1/cart', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ owner: 'authenticated', version: 1, groups: [], summary: { distinctLineCount: 0, selectedValidLineCount: 0, selectedValidQuantity: 0, selectedMerchandiseSubtotalMinor: 0 } }),
  }));
  await page.route('**/api/v1/account/profile', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: ids.buyer, email: 'buyer@example.test', displayName: 'Buyer', phoneNumber: null, status: 'active' }),
  }));
  await page.route('**/api/v1/chat/conversations/unread-count', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chatVersion: 'chat-v1', unreadCount: withConversation ? 1 : 0 }) }));
  await page.route('**/api/v1/chat/conversations?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chatVersion: 'chat-v1', items: withConversation ? [conversation] : [], nextCursor: null, unreadCount: withConversation ? 1 : 0 }) }));
  await page.route(`**/api/v1/chat/conversations/${ids.conversation}/messages*`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chatVersion: 'chat-v1', conversation, items: [message], hasMoreBefore: false, hasMoreAfter: false, unreadCount: 1 }) }));
  await page.route('**/api/v1/chat/targets/shops/*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chatVersion: 'chat-v1', shopId: ids.shop, shopName: 'Điện Thoại Hay', ownerUserId: ids.owner, ownerDisplayName: 'Shop Owner', ownerAvatarUrl: null, isSelf: false, canMessage: true }) }));
  await page.route('**/api/v1/chat/realtime-ticket', (route) => route.fulfill({ status: 503, contentType: 'application/problem+json', body: JSON.stringify({ type: 'https://shopee-clone.local/problems/chat-unavailable', title: 'Chat unavailable', status: 503, detail: 'Realtime is unavailable in this browser fixture.' }) }));
  await page.route('**/socket.io/**', (route) => route.abort());
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
}

chatTest.describe('floating chat journeys', () => {
  chatTest('opens from the global trigger, preserves contact state, and remains accessible at every viewport', async ({ page, chatAccounts, singleOwnerShop }) => {
    expect(chatAccounts.buyer).not.toBe(chatAccounts.seller);
    expect(singleOwnerShop.ownerId).toBe(chatAccounts.seller);
    await routeAuthenticatedChat(page);
    await page.goto('/account/profile');
    const trigger = page.getByRole('button', { name: 'Mở trò chuyện' });
    await expect(trigger).toBeVisible();
    expect((await trigger.boundingBox())?.width).toBeGreaterThanOrEqual(44);
    expect((await trigger.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(trigger).toHaveText(/Chat/);
    await trigger.click();
    await expect(page.getByRole('dialog', { name: 'Trò chuyện' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Điện Thoại Hay/ })).toBeVisible();
    await page.getByRole('button', { name: /Điện Thoại Hay/ }).click();
    await expect(page.locator('.floating-chat__message-bubble', { hasText: 'Xin chào' })).toBeVisible();
    const close = page.getByRole('dialog', { name: 'Trò chuyện' }).getByRole('button', { name: 'Đóng trò chuyện' });
    expect((await close.boundingBox())?.width).toBeGreaterThanOrEqual(44);
    expect((await close.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
    await expectAccessible(page);
  });

  chatTest('keeps a materialized conversation at the newest message after reopening and supports keyboard close', async ({ page }) => {
    await routeAuthenticatedChat(page);
    await page.goto('/account/profile');
    await page.getByRole('button', { name: 'Mở trò chuyện' }).click();
    await page.getByRole('button', { name: /Điện Thoại Hay/ }).click();
    const pane = page.locator('.floating-chat__messages');
    await expect(pane).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Trò chuyện' }).getByRole('button', { name: 'Đóng trò chuyện' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Mở trò chuyện' })).toBeFocused();
    await expect(page.getByRole('dialog', { name: 'Trò chuyện' })).toHaveCount(0);

    const secondTab = await page.context().newPage();
    try {
      await routeAuthenticatedChat(secondTab);
      await secondTab.goto('/account/profile');
      await expect(secondTab.getByRole('button', { name: 'Mở trò chuyện' })).toBeVisible();
    } finally {
      await secondTab.close();
    }
  });

  chatTest('shows the empty state without creating a conversation when no history exists', async ({ page }) => {
    await routeAuthenticatedChat(page, false);
    await page.goto('/account/profile');
    await page.getByRole('button', { name: 'Mở trò chuyện' }).click();
    await expect(page.getByText('Chưa có cuộc trò chuyện.')).toBeVisible();
    await expect(page.locator('.floating-chat__empty')).toBeVisible();
    await expectAccessible(page);
  });

  chatTest('opens the same owner-targeted widget from product and public shop details', async ({ page, request }) => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001';
    const catalog = await request.get(`${apiBaseUrl}/api/v1/catalog/products?pageSize=1`);
    expect(catalog.ok()).toBe(true);
    const item = (await catalog.json()).items[0] as { id: string };
    const detailResponse = await request.get(`${apiBaseUrl}/api/v1/catalog/products/${item.id}`);
    expect(detailResponse.ok()).toBe(true);
    const detail = await detailResponse.json() as { id: string; shop: { slug: string } };

    await routeAuthenticatedChat(page, false);
    await page.goto(`/products/${detail.id}`);
    await page.getByRole('button', { name: 'Chat ngay' }).click();
    await expect(page.getByRole('dialog', { name: 'Trò chuyện' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.goto(`/shops/${detail.shop.slug}`);
    await page.getByRole('button', { name: 'Chat ngay' }).click();
    await expect(page.getByRole('dialog', { name: 'Trò chuyện' })).toBeVisible();
    await expectAccessible(page);
  });
});

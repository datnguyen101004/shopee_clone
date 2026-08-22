import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

import {
  adminReturnDetail,
  returnDetail,
  returnIds,
  returnSummary,
} from './fixtures/returns';

async function json(
  route: Route,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'private, no-store', ...headers },
    body: JSON.stringify(body),
  });
}

type Actor = 'buyer' | 'seller' | 'admin';

async function installReturns(page: Page, initial: {
  actor: Actor;
  status: 'REQUESTED' | 'AWAITING_RETURN' | 'IN_TRANSIT' | 'ESCALATED' | 'REFUNDED';
  version: number;
}) {
  let actor = initial.actor;
  let status = initial.status;
  let version = initial.version;

  const rolesFor = (role: Actor) =>
    role === 'admin' ? ['buyer', 'admin'] : role === 'seller' ? ['buyer', 'seller'] : ['buyer'];

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') {
      return json(route, {
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-22T00:00:00.000Z',
        user: {
          id: returnIds[actor],
          email: `${actor}@example.test`,
          displayName: actor,
          status: 'active',
          roles: rolesFor(actor),
        },
      });
    }
    if (request.method() === 'GET' && path === '/api/v1/cart') {
      return route.fulfill({ status: 404 });
    }
    if (path.startsWith('/api/v1/return-evidence/')) {
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      });
    }

    if (path === '/api/v1/account/returns' && request.method() === 'GET') {
      return json(route, {
        returnVersion: 'returns-v1',
        items: [
          returnSummary(
            status,
            status === 'AWAITING_RETURN'
              ? [{ action: 'SUBMIT_SHIPMENT', requiresPublicReason: false }]
              : status === 'REQUESTED'
                ? [{ action: 'CANCEL', requiresPublicReason: false }]
                : [],
            version,
          ),
        ],
        page: { limit: 20, nextCursor: null },
      });
    }
    if (path === `/api/v1/account/returns/${returnIds.returnRequest}` && request.method() === 'GET') {
      return json(
        route,
        returnDetail(
          status,
          status === 'AWAITING_RETURN'
            ? [{ action: 'SUBMIT_SHIPMENT', requiresPublicReason: false }]
            : status === 'REQUESTED'
              ? [{ action: 'CANCEL', requiresPublicReason: false }]
              : [],
          version,
        ),
        200,
        { ETag: `"return-${version}"` },
      );
    }
    if (
      path === `/api/v1/account/returns/${returnIds.returnRequest}/actions` &&
      request.method() === 'POST'
    ) {
      expect(request.headers()['if-match']).toBe(`"return-${version}"`);
      const body = request.postDataJSON() as { action: string };
      if (body.action === 'SUBMIT_SHIPMENT') {
        status = 'IN_TRANSIT';
        version += 1;
      }
      return json(route, returnDetail(status, [], version), 200, { ETag: `"return-${version}"` });
    }

    if (path === '/api/v1/seller/returns' && request.method() === 'GET') {
      return json(route, {
        returnVersion: 'returns-v1',
        items: [
          returnSummary(
            status,
            status === 'IN_TRANSIT'
              ? [
                  { action: 'CONFIRM_RECEIPT', requiresPublicReason: false },
                  { action: 'ESCALATE', requiresPublicReason: true },
                ]
              : status === 'REQUESTED'
                ? [
                    { action: 'ACCEPT_RETURN', requiresPublicReason: false },
                    { action: 'REJECT_AND_ESCALATE', requiresPublicReason: true },
                  ]
                : [],
            version,
          ),
        ],
        page: { limit: 20, nextCursor: null },
      });
    }
    if (path === `/api/v1/seller/returns/${returnIds.returnRequest}` && request.method() === 'GET') {
      return json(
        route,
        returnDetail(
          status,
          status === 'IN_TRANSIT'
            ? [
                { action: 'CONFIRM_RECEIPT', requiresPublicReason: false },
                { action: 'ESCALATE', requiresPublicReason: true },
              ]
            : status === 'REQUESTED'
              ? [
                  { action: 'ACCEPT_RETURN', requiresPublicReason: false },
                  { action: 'REJECT_AND_ESCALATE', requiresPublicReason: true },
                ]
              : [],
          version,
          status === 'ESCALATED'
            ? { sellerPublicReason: 'Không đủ điều kiện đổi trả theo chính sách' }
            : {},
        ),
        200,
        { ETag: `"return-${version}"` },
      );
    }
    if (
      path === `/api/v1/seller/returns/${returnIds.returnRequest}/actions` &&
      request.method() === 'POST'
    ) {
      const body = request.postDataJSON() as { action: string };
      if (body.action === 'CONFIRM_RECEIPT') {
        status = 'REFUNDED';
        version += 1;
      }
      if (body.action === 'ACCEPT_RETURN') {
        status = 'AWAITING_RETURN';
        version += 1;
      }
      if (body.action === 'REJECT_AND_ESCALATE') {
        status = 'ESCALATED';
        version += 1;
      }
      return json(route, returnDetail(status, [], version), 200, { ETag: `"return-${version}"` });
    }

    if (path === '/api/v1/admin/returns' && request.method() === 'GET') {
      return json(route, {
        returnVersion: 'returns-v1',
        items: [
          returnSummary(
            status,
            status === 'ESCALATED'
              ? [
                  { action: 'APPROVE_REFUND', requiresPublicReason: true },
                  { action: 'REJECT', requiresPublicReason: true },
                ]
              : [],
            version,
          ),
        ],
        page: { limit: 20, nextCursor: null },
      });
    }
    if (path === `/api/v1/admin/returns/${returnIds.returnRequest}` && request.method() === 'GET') {
      return json(
        route,
        adminReturnDetail(
          status === 'REFUNDED' ? 'REFUNDED' : status === 'ESCALATED' ? 'ESCALATED' : 'ESCALATED',
          status === 'ESCALATED'
            ? [
                { action: 'APPROVE_REFUND', requiresPublicReason: true },
                { action: 'REJECT', requiresPublicReason: true },
                { action: 'APPROVE_RETURN', requiresPublicReason: true },
              ]
            : [],
          version,
        ),
        200,
        { ETag: `"return-${version}"` },
      );
    }
    if (
      path === `/api/v1/admin/returns/${returnIds.returnRequest}/decisions` &&
      request.method() === 'POST'
    ) {
      const body = request.postDataJSON() as { decision: string; publicReason: string };
      expect(body.decision).toBe('APPROVE_REFUND');
      expect(body.publicReason.length).toBeGreaterThanOrEqual(8);
      status = 'REFUNDED';
      version += 1;
      return json(route, adminReturnDetail('REFUNDED', [], version), 200, {
        ETag: `"return-${version}"`,
      });
    }

    return route.fulfill({ status: 404 });
  });

  return {
    as(next: Actor) {
      actor = next;
    },
    set(nextStatus: typeof status, nextVersion = version) {
      status = nextStatus;
      version = nextVersion;
    },
    snapshot: () => ({ status, version, actor }),
  };
}

test.describe('accepted return journey', () => {
  test('buyer ships after accept and seller confirms receipt to refund', async ({ page }) => {
    const scenario = await installReturns(page, {
      actor: 'buyer',
      status: 'AWAITING_RETURN',
      version: 1,
    });

    await page.goto('/account/returns');
    await expect(page.getByRole('heading', { name: 'Trả hàng / Hoàn tiền' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Chờ gửi hàng trả/i })).toBeVisible();
    await page.goto(`/account/returns/${returnIds.returnRequest}`);
    await page.getByRole('button', { name: 'Xác nhận đã gửi hàng' }).click();
    await expect(page.getByRole('status')).toHaveText(/Trạng thái đã được cập nhật/);

    scenario.as('seller');
    scenario.set('IN_TRANSIT', scenario.snapshot().version);
    await page.goto('/seller/returns');
    await expect(page.getByRole('heading', { name: 'Yêu cầu trả hàng' })).toBeVisible();
    await page.goto(`/seller/returns/${returnIds.returnRequest}`);
    await expect(page.locator('.return-detail__heading')).toContainText('Đang gửi hàng trả');
    await page.locator('.return-detail__actions select').selectOption('CONFIRM_RECEIPT');
    await page.getByRole('button', { name: 'Xác nhận' }).click();
    await expect(page.getByRole('status')).toHaveText(/Trạng thái đã được cập nhật/);

    scenario.as('buyer');
    scenario.set('REFUNDED', scenario.snapshot().version);
    await page.goto(`/account/returns/${returnIds.returnRequest}`);
    await expect(page.locator('.return-detail__heading')).toContainText('Đã hoàn tiền');

    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
    const accessibility = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
    expect(
      accessibility.violations.filter((item) =>
        ['serious', 'critical'].includes(item.impact ?? ''),
      ),
    ).toEqual([]);
  });
});

test.describe('dispute return journey', () => {
  test('admin decides escalated case and buyer sees refund without internal notes', async ({
    page,
  }) => {
    const scenario = await installReturns(page, {
      actor: 'admin',
      status: 'ESCALATED',
      version: 1,
    });

    await page.goto('/admin/returns');
    await expect(page.getByRole('heading', { name: 'Tranh chấp trả hàng' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Cần quản trị viên xử lý/i })).toBeVisible();
    await page.goto(`/admin/returns/${returnIds.returnRequest}`);
    await page.locator('.return-detail__actions select').selectOption('APPROVE_REFUND');
    await page
      .getByPlaceholder(/Lý do hiển thị cho người mua và người bán/i)
      .fill('Bằng chứng đủ để hoàn tiền cho người mua');
    await page.getByLabel(/Tôi xác nhận quyết định này/i).check();
    await page.getByRole('button', { name: 'Ra quyết định' }).click();
    await expect(page.getByRole('status')).toHaveText(/Trạng thái đã được cập nhật/);

    scenario.as('buyer');
    scenario.set('REFUNDED', scenario.snapshot().version);
    await page.goto(`/account/returns/${returnIds.returnRequest}`);
    await expect(page.locator('.return-detail__heading')).toContainText('Đã hoàn tiền');
    await expect(page.getByText(/Ghi chú nội bộ/i)).toHaveCount(0);

    const accessibility = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
    expect(
      accessibility.violations.filter((item) =>
        ['serious', 'critical'].includes(item.impact ?? ''),
      ),
    ).toEqual([]);
  });
});

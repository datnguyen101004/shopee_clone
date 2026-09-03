import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';

const ids = {
  buyer: '40000000-0000-4000-8000-000000000001',
  seller: '40000000-0000-4000-8000-000000000002',
  admin: '40000000-0000-4000-8000-000000000003',
  product: '40000000-0000-4000-8000-000000000004',
  report: '40000000-0000-4000-8000-000000000005',
  case: '40000000-0000-4000-8000-000000000006',
  review: '40000000-0000-4000-8000-000000000007',
  notice: '40000000-0000-4000-8000-000000000008',
} as const;

type Role = 'buyer' | 'seller' | 'admin';

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'private, no-store' },
    body: JSON.stringify(body),
  });
}

async function expectNoSeriousOrCriticalAxeViolations(page: Page, selector?: string) {
  const builder = new AxeBuilder({ page });
  if (selector) builder.include(selector);
  const result = await builder.analyze();
  expect(result.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))).toEqual([]);
}

async function canonicalProductAndShop(request: APIRequestContext) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001';
  const catalog = await request.get(`${apiBaseUrl}/api/v1/catalog/products?pageSize=1`);
  expect(catalog.ok()).toBe(true);
  const item = (await catalog.json()).items[0] as { id: string };
  const detail = await request.get(`${apiBaseUrl}/api/v1/catalog/products/${item.id}`);
  expect(detail.ok()).toBe(true);
  return (await detail.json()) as { id: string; name: string; shop: { id: string; slug: string; name: string } };
}

async function installBuyerReportInterceptor(page: Page, reportId: string, onSubmit: (body: Record<string, unknown>) => void) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') {
      return json(route, {
        accessToken: 'header.payload.signature',
        expiresAt: '2099-08-21T00:00:00.000Z',
        user: { id: ids.buyer, email: 'buyer@example.test', displayName: 'Buyer Test', status: 'active', roles: ['buyer'] },
      });
    }
    if (request.method() === 'GET' && path === '/api/v1/cart') return route.fulfill({ status: 404 });
    if (request.method() === 'POST' && path === '/api/v1/reports') {
      const body = request.postDataJSON() as Record<string, unknown>;
      onSubmit(body);
      expect(request.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
      return json(route, {
        reportId,
        targetType: body.targetType,
        targetId: body.targetId,
        reasonCode: body.reasonCode,
        status: 'SUBMITTED',
        createdAt: '2026-08-21T00:00:00.000Z',
      }, 201);
    }
    return route.continue();
  });
}

async function submitVisibleReport(page: Page, targetButtonName: string) {
  await page.getByRole('button', { name: targetButtonName }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual((viewport?.width ?? Number.MAX_SAFE_INTEGER) + 1);
  await page.getByLabel(/Mô tả chi tiết/).fill('Nội dung báo cáo có đủ chi tiết để đội ngũ kiểm duyệt xác minh.');
  await page.getByLabel('Link bằng chứng 1').fill('https://example.test/evidence');
  await expectNoSeriousOrCriticalAxeViolations(page, '[role="dialog"]');
  await dialog.getByRole('button', { name: 'Gửi báo cáo' }).click();
  await expect(dialog.getByRole('heading', { name: 'Đã gửi báo cáo thành công' })).toBeVisible();
}

async function installModerationScenario(page: Page) {
  let activeRole: Role = 'buyer';
  let caseVersion = 0;
  let caseStatus: 'OPEN' | 'IN_REVIEW' | 'RESOLVED' = 'OPEN';
  let targetStatus = 'ACTIVE';
  let reviewVisibility: 'VISIBLE' | 'HIDDEN' = 'VISIBLE';
  let sellerReviewReported = false;
  let noticeReadAt: string | null = null;
  const events: Array<{ id: string; eventType: string; actorUserId: string | null; actorName: string | null; note: string | null; metadata: Record<string, unknown> | null; createdAt: string }> = [];
  const decisions: Array<{ id: string; outcome: 'SUSPEND_TARGET'; publicReason: string; privateNote: string | null; previousTargetStatus: string; nextTargetStatus: string; reversesDecisionId: string | null; actorUserId: string; actorName: string; createdAt: string }> = [];
  let assignedAdminId: string | null = null;

  const user = () => ({
    id: ids[activeRole],
    email: `${activeRole}@example.test`,
    displayName: activeRole === 'admin' ? 'Admin Test' : activeRole === 'seller' ? 'Seller Test' : 'Buyer Test',
    status: 'active',
    roles: activeRole === 'admin' ? ['buyer', 'admin'] : activeRole === 'seller' ? ['buyer', 'seller'] : ['buyer'],
  });

  const detail = () => ({
    id: ids.case,
    targetType: 'PRODUCT',
    targetId: ids.product,
    targetName: 'Sản phẩm cần kiểm duyệt',
    targetStatus,
    status: caseStatus,
    reportCount: 1,
    primaryReasonCode: 'COUNTERFEIT',
    assignedAdminId,
    assignedAdminName: assignedAdminId ? 'Admin Test' : null,
    currentOutcome: caseStatus === 'RESOLVED' ? 'SUSPEND_TARGET' : null,
    version: caseVersion,
    createdAt: '2026-08-21T00:00:00.000Z',
    lastActivityAt: '2026-08-21T00:00:00.000Z',
    resolvedAt: caseStatus === 'RESOLVED' ? '2026-08-21T00:10:00.000Z' : null,
    targetDetails: {
      id: ids.product,
      targetType: 'PRODUCT',
      name: 'Sản phẩm cần kiểm duyệt',
      slug: null,
      currentStatus: targetStatus,
      moderationStatus: targetStatus,
      shopId: '40000000-0000-4000-8000-000000000009',
      shopName: 'Shop kiểm thử',
    },
    reports: [{
      id: ids.report,
      reporterOpaqueId: 'reporter-opaque-1',
      reasonCode: 'COUNTERFEIT',
      details: 'Sản phẩm có dấu hiệu giả mạo thương hiệu và mô tả không chính xác.',
      evidenceUrls: ['https://example.test/evidence'],
      createdAt: '2026-08-21T00:00:00.000Z',
    }],
    events,
    decisions,
  });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === 'POST' && path === '/api/v1/auth/refresh') {
      return json(route, { accessToken: 'header.payload.signature', expiresAt: '2099-08-21T00:00:00.000Z', user: user() });
    }
    if (request.method() === 'GET' && path === '/api/v1/cart') return route.fulfill({ status: 404 });
    if (request.method() === 'GET' && path === '/api/v1/account/reports') {
      return json(route, {
        items: [{
          id: ids.report,
          targetType: 'PRODUCT',
          targetId: ids.product,
          targetName: 'Sản phẩm cần kiểm duyệt',
          reasonCode: 'COUNTERFEIT',
          status: caseStatus === 'RESOLVED' ? 'REVIEWED' : 'SUBMITTED',
          createdAt: '2026-08-21T00:00:00.000Z',
          resolvedAt: caseStatus === 'RESOLVED' ? '2026-08-21T00:10:00.000Z' : null,
        }],
        nextCursor: null,
      });
    }
    if (request.method() === 'GET' && path === '/api/v1/seller/reviews') {
      return json(route, {
        items: [{
          id: ids.review,
          productId: ids.product,
          productName: 'Sản phẩm cần kiểm duyệt',
          rating: 1,
          comment: 'Nội dung đánh giá cần kiểm tra.',
          visibility: reviewVisibility,
          reportStatus: sellerReviewReported ? 'OPEN' : 'NOT_REPORTED',
          createdAt: '2026-08-21T00:00:00.000Z',
          updatedAt: '2026-08-21T00:04:00.000Z',
        }],
      });
    }
    if (request.method() === 'POST' && path === `/api/v1/seller/reviews/${ids.review}/reports`) {
      sellerReviewReported = true;
      return json(route, { id: '40000000-0000-4000-8000-000000000012', reviewId: ids.review, status: 'SUBMITTED', createdAt: '2026-08-21T00:06:00.000Z' }, 201);
    }
    if (request.method() === 'GET' && path === '/api/v1/admin/moderation/cases') {
      const cases = caseStatus === 'OPEN' ? [{
        id: ids.case,
        targetType: 'PRODUCT',
        targetId: ids.product,
        targetName: 'Sản phẩm cần kiểm duyệt',
        targetStatus,
        status: caseStatus,
        reportCount: 1,
        primaryReasonCode: 'COUNTERFEIT',
        assignedAdminId,
        assignedAdminName: assignedAdminId ? 'Admin Test' : null,
        currentOutcome: null,
        version: caseVersion,
        createdAt: '2026-08-21T00:00:00.000Z',
        lastActivityAt: '2026-08-21T00:00:00.000Z',
        resolvedAt: null,
      }] : [];
      return json(route, { items: cases, nextCursor: null });
    }
    if (request.method() === 'GET' && path === `/api/v1/admin/moderation/cases/${ids.case}`) return json(route, detail());
    if (request.method() === 'POST' && path === `/api/v1/admin/moderation/cases/${ids.case}/assign`) {
      const body = request.postDataJSON() as { assignedAdminId: string | null };
      assignedAdminId = body.assignedAdminId;
      caseStatus = 'IN_REVIEW';
      caseVersion += 1;
      events.push({ id: `event-${caseVersion}`, eventType: assignedAdminId ? 'ASSIGNED' : 'UNASSIGNED', actorUserId: ids.admin, actorName: 'Admin Test', note: null, metadata: null, createdAt: '2026-08-21T00:01:00.000Z' });
      return json(route, { caseDetail: detail() });
    }
    if (request.method() === 'POST' && path === `/api/v1/admin/moderation/cases/${ids.case}/notes`) {
      const body = request.postDataJSON() as { note: string };
      caseVersion += 1;
      events.push({ id: `event-${caseVersion}`, eventType: 'NOTE_ADDED', actorUserId: ids.admin, actorName: 'Admin Test', note: body.note, metadata: null, createdAt: '2026-08-21T00:02:00.000Z' });
      return json(route, { caseDetail: detail() });
    }
    if (request.method() === 'POST' && path === `/api/v1/admin/moderation/cases/${ids.case}/decisions`) {
      const body = request.postDataJSON() as { publicReason: string; privateNote?: string };
      caseVersion += 1;
      caseStatus = 'RESOLVED';
      targetStatus = 'SUSPENDED';
      decisions.unshift({ id: '40000000-0000-4000-8000-000000000010', outcome: 'SUSPEND_TARGET', publicReason: body.publicReason, privateNote: body.privateNote ?? null, previousTargetStatus: 'ACTIVE', nextTargetStatus: 'SUSPENDED', reversesDecisionId: null, actorUserId: ids.admin, actorName: 'Admin Test', createdAt: '2026-08-21T00:03:00.000Z' });
      events.push({ id: `event-${caseVersion}`, eventType: 'DECISION', actorUserId: ids.admin, actorName: 'Admin Test', note: null, metadata: null, createdAt: '2026-08-21T00:03:00.000Z' });
      return json(route, { caseId: ids.case, outcome: 'SUSPEND_TARGET', version: caseVersion, targetStatus, resolvedAt: '2026-08-21T00:03:00.000Z' });
    }
    if (request.method() === 'GET' && path === `/api/v1/admin/reviews/${ids.review}`) {
      return json(route, { id: ids.review, productId: ids.product, productName: 'Sản phẩm cần kiểm duyệt', authorUserId: ids.buyer, authorDisplayName: 'Buyer Test', rating: 1, comment: 'Nội dung đánh giá cần kiểm tra.', visibility: reviewVisibility, version: reviewVisibility === 'VISIBLE' ? 0 : 1, sellerReportCount: sellerReviewReported ? 1 : 0, sellerReports: sellerReviewReported ? [{ id: '40000000-0000-4000-8000-000000000012', reasonCode: 'SPAM_OR_FRAUD', details: 'Dẫn người mua đến trang thanh toán không liên quan.', createdAt: '2026-08-21T00:06:00.000Z' }] : [], createdAt: '2026-08-21T00:00:00.000Z', updatedAt: '2026-08-21T00:04:00.000Z' });
    }
    if (request.method() === 'GET' && path === '/api/v1/admin/reviews/reported') {
      return json(route, {
        items: sellerReviewReported ? [{ reviewId: ids.review, productId: ids.product, productName: 'Sản phẩm cần kiểm duyệt', shopId: '40000000-0000-4000-8000-000000000009', shopName: 'Shop kiểm thử', rating: 1, comment: 'Nội dung đánh giá cần kiểm tra.', visibility: reviewVisibility, reportCount: 1, latestReportedAt: '2026-08-21T00:06:00.000Z' }] : [],
      });
    }
    if (request.method() === 'POST' && path === `/api/v1/admin/reviews/${ids.review}/actions`) {
      const body = request.postDataJSON() as { action: 'HIDE' | 'KEEP_VISIBLE' | 'RESTORE' };
      if (body.action === 'HIDE') reviewVisibility = 'HIDDEN';
      if (body.action === 'RESTORE') reviewVisibility = 'VISIBLE';
      sellerReviewReported = false;
      return json(route, { reviewId: ids.review, visibility: reviewVisibility, version: reviewVisibility === 'VISIBLE' ? 0 : 1, updatedAt: '2026-08-21T00:04:00.000Z' });
    }
    if (request.method() === 'GET' && path === '/api/v1/seller/moderation-notices') {
      return json(route, {
        items: caseStatus === 'RESOLVED' ? [{ id: ids.notice, targetType: 'PRODUCT', targetId: ids.product, targetName: 'Sản phẩm cần kiểm duyệt', targetSlug: null, action: 'PRODUCT_SUSPENDED', reason: 'Sản phẩm vi phạm chính sách hàng giả.', effectiveAt: '2026-08-21T00:03:00.000Z', readAt: noticeReadAt }] : [],
        unreadCount: noticeReadAt ? 0 : caseStatus === 'RESOLVED' ? 1 : 0,
        nextCursor: null,
      });
    }
    if (request.method() === 'POST' && path === `/api/v1/seller/moderation-notices/${ids.notice}/read`) {
      noticeReadAt = '2026-08-21T00:05:00.000Z';
      return json(route, { noticeId: ids.notice, readAt: noticeReadAt });
    }
    return route.fulfill({ status: 404 });
  });

  return {
    as(role: Role) {
      activeRole = role;
    },
  };
}

test('buyer report history, admin moderation, review hide, and seller notice remain operable and accessible', async ({ page }) => {
  const scenario = await installModerationScenario(page);

  await page.goto('/account/reports');
  await expect(page.getByRole('heading', { name: 'Báo cáo đã gửi' })).toBeVisible();
  await expect(page.getByText('Sản phẩm cần kiểm duyệt')).toBeVisible();
  await expectNoSeriousOrCriticalAxeViolations(page);

  scenario.as('admin');
  await page.goto('/admin/moderation');
  await expect(page.getByRole('heading', { name: 'Trung tâm Kiểm duyệt & Tố cáo' })).toBeVisible();
  await expect(page.getByText(`Mã hồ sơ: ${ids.case}`)).toBeVisible();
  await expect(page.locator('.admin-case-card__target-link')).toHaveAttribute('href', `/products/${ids.product}`);
  await page.getByLabel('Tìm mã hồ sơ hoặc đối tượng').fill(ids.case);
  const targetSearchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/api/v1/admin/moderation/cases' && url.searchParams.get('searchId') === ids.case && url.searchParams.get('status') === null;
  });
  await page.getByLabel('Tìm mã hồ sơ hoặc đối tượng').press('Enter');
  await targetSearchRequest;
  await page.getByRole('button', { name: 'Mở hồ sơ Sản phẩm cần kiểm duyệt' }).click();
  await expect(page.getByRole('heading', { name: 'Sản phẩm cần kiểm duyệt' })).toBeVisible();
  await expect(page.locator('.admin-detail-header')).toContainText(`Mã đối tượng: ${ids.product}`);
  await expect(page.locator('.admin-case-detail__target-link')).toHaveAttribute('href', `/products/${ids.product}`);
  await expect(page.locator('.admin-detail-header')).not.toContainText('Phiên bản hồ sơ');
  await page.getByRole('button', { name: 'Đóng chi tiết hồ sơ' }).click();
  await expect(page.getByRole('heading', { name: 'Sản phẩm cần kiểm duyệt' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Mở hồ sơ Sản phẩm cần kiểm duyệt' })).toBeFocused();
  await page.getByRole('button', { name: 'Mở hồ sơ Sản phẩm cần kiểm duyệt' }).click();

  await page.getByLabel(/Lý do công khai cho người bán/).fill('Sản phẩm vi phạm chính sách hàng giả đã được xác minh.');
  await page.getByLabel(/Ghi chú nội bộ \(tùy chọn\)/).fill('Đã đối chiếu chứng cứ nội bộ.');
  await page.getByRole('button', { name: 'Xác nhận áp dụng quyết định' }).click();
  const decisionConfirmation = page.getByRole('alertdialog');
  await expect(decisionConfirmation).toContainText('đình chỉ đối tượng');
  await decisionConfirmation.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByText('Đã giải quyết').last()).toBeVisible();

  await page.getByRole('tab', { name: 'Kiểm duyệt đánh giá' }).click();
  await page.getByLabel('Mã đánh giá').fill(ids.review);
  await page.getByRole('button', { name: 'Tra cứu' }).click();
  await expect(page.getByText(/Đánh giá trên sản phẩm/)).toBeVisible();
  await page.getByLabel(/Lý do kiểm duyệt/).fill('Đánh giá có nội dung lạm dụng cần được ẩn.');
  await page.getByRole('button', { name: 'Ẩn đánh giá vi phạm' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByText(/Đang ẩn/)).toBeVisible();
  await page.getByRole('button', { name: 'Khôi phục hiển thị đánh giá' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByText(/Trạng thái: Hiển thị/)).toBeVisible();
  await expectNoSeriousOrCriticalAxeViolations(page);

  scenario.as('seller');
  await page.goto('/seller/moderation');
  await expect(page.getByRole('heading', { name: 'Thông báo kiểm duyệt' })).toBeVisible();
  await expect(page.getByText('Sản phẩm vi phạm chính sách hàng giả.')).toBeVisible();
  await page.getByRole('button', { name: 'Đánh dấu đã đọc' }).click();
  await expect(page.getByText(/Đã đọc/)).toBeVisible();
  await expectNoSeriousOrCriticalAxeViolations(page);

  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);
});

test('buyer submits a product report from the public product page', async ({ page, request }) => {
  const product = await canonicalProductAndShop(request);
  let submitted: Record<string, unknown> | null = null;
  await installBuyerReportInterceptor(page, '40000000-0000-4000-8000-000000000011', (body) => {
    submitted = body;
  });

  await page.goto(`/products/${product.id}`);
  await submitVisibleReport(page, 'Tố cáo sản phẩm');
  expect(submitted).toMatchObject({
    targetType: 'PRODUCT',
    targetId: product.id,
    evidenceUrls: ['https://example.test/evidence'],
  });
});

test('buyer submits a shop report from the public storefront', async ({ page, request }) => {
  const product = await canonicalProductAndShop(request);
  let submitted: Record<string, unknown> | null = null;
  await installBuyerReportInterceptor(page, '40000000-0000-4000-8000-000000000012', (body) => {
    submitted = body;
  });

  await page.goto(`/shops/${product.shop.slug}`);
  await submitVisibleReport(page, 'Tố cáo shop');
  expect(submitted).toMatchObject({
    targetType: 'SHOP',
    targetId: product.shop.id,
    evidenceUrls: ['https://example.test/evidence'],
  });
});

test('seller reports an owned review and admin keeps it visible with private report context', async ({ page }) => {
  const scenario = await installModerationScenario(page);

  scenario.as('seller');
  await page.goto('/seller/reviews');
  await expect(page.getByRole('heading', { name: 'Đánh giá sản phẩm' })).toBeVisible();
  await expect(page.getByText('Nội dung đánh giá cần kiểm tra.')).toBeVisible();
  await page.getByRole('button', { name: 'Báo cáo đánh giá' }).click();
  const dialog = page.getByRole('dialog', { name: 'Báo cáo đánh giá' });
  await expect(dialog).toBeVisible();
  await page.getByLabel('Lý do báo cáo').selectOption('SPAM_OR_FRAUD');
  await page.getByLabel('Mô tả thêm (không bắt buộc)').fill('Dẫn người mua đến trang thanh toán không liên quan.');
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await page.getByRole('button', { name: 'Xác nhận gửi báo cáo' }).click();
  await expect(page.getByRole('button', { name: 'Đã báo cáo' })).toBeDisabled();
  await expectNoSeriousOrCriticalAxeViolations(page);

  scenario.as('admin');
  await page.goto('/admin/moderation');
  await page.getByRole('tab', { name: 'Kiểm duyệt đánh giá' }).click();
  await expect(page.getByText(/Đánh giá được người bán báo cáo \(1\)/)).toBeVisible();
  await page.locator('.admin-reported-review-card').click();
  await expect(page.getByText(/Ngữ cảnh báo cáo từ người bán \(1\)/)).toBeVisible();
  await expect(page.getByText('Spam, lừa đảo hoặc liên kết đáng ngờ')).toBeVisible();
  await page.getByLabel(/Lý do kiểm duyệt/).fill('Đánh giá là phản hồi hợp lệ và được giữ nguyên hiển thị.');
  await page.getByRole('button', { name: 'Giữ nguyên hiển thị' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByText('Chưa có đánh giá nào đang chờ xử lý từ người bán.')).toBeVisible();
  await expectNoSeriousOrCriticalAxeViolations(page);
});

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '.runtime', 'returns-ui-preview');
const base = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';

const returnIds = {
  buyer: '50000000-0000-4000-8000-000000000001',
  order: '50000000-0000-4000-8000-000000000004',
  returnRequest: '50000000-0000-4000-8000-000000000005',
  line: '50000000-0000-4000-8000-000000000006',
  evidence: '50000000-0000-4000-8000-000000000007',
};

const summary = {
  returnReference: returnIds.returnRequest,
  orderReference: returnIds.order,
  status: 'REQUESTED',
  version: 0,
  reasonCode: 'DAMAGED',
  refundAmountMinor: 100_000,
  deadline: {
    eligibilityAt: '2026-08-27T00:00:00.000Z',
    sellerResponseAt: '2026-08-22T00:00:00.000Z',
    shipmentAt: null,
    receiptAt: null,
  },
  updatedAt: '2026-08-20T00:00:00.000Z',
  availableActions: [{ action: 'CANCEL', requiresPublicReason: false }],
};

const detail = {
  returnVersion: 'returns-v1',
  return: {
    ...summary,
    currency: 'VND',
    description: 'Sản phẩm bị hư hỏng khi nhận hàng',
    lines: [
      {
        lineReference: returnIds.line,
        productName: 'Ghế công thái học',
        variantName: 'Đen',
        productImageUrl: null,
        purchasedQuantity: 1,
        requestedQuantity: 1,
        payableMerchandiseMinor: 100_000,
        refundMinor: 100_000,
      },
    ],
    evidence: [
      {
        evidenceId: returnIds.evidence,
        mimeType: 'image/png',
        bytes: 68,
        width: 1,
        height: 1,
        url: `/api/v1/return-evidence/${returnIds.evidence}`,
      },
    ],
    timeline: [
      {
        id: '50000000-0000-4000-8000-000000000010',
        version: 0,
        previousStatus: null,
        status: 'REQUESTED',
        actorType: 'BUYER',
        occurredAt: '2026-08-20T00:00:00.000Z',
        reasonCode: 'RETURN_CREATE',
        publicReason: null,
      },
    ],
    shipment: null,
    refund: null,
    sellerPublicReason: null,
  },
};

async function install(page) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const urlPath = new URL(request.url()).pathname;
    if (request.method() === 'POST' && urlPath === '/api/v1/auth/refresh') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'header.payload.signature',
          expiresAt: '2099-08-22T00:00:00.000Z',
          user: {
            id: returnIds.buyer,
            email: 'buyer@example.test',
            displayName: 'buyer',
            status: 'active',
            roles: ['buyer'],
          },
        }),
      });
    }
    if (urlPath === '/api/v1/cart') return route.fulfill({ status: 404 });
    if (urlPath === '/api/v1/account/returns') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          returnVersion: 'returns-v1',
          items: [summary],
          page: { limit: 20, nextCursor: null },
        }),
      });
    }
    if (urlPath === `/api/v1/account/returns/${returnIds.returnRequest}`) {
      return route.fulfill({
        status: 200,
        headers: { ETag: '"return-0"' },
        contentType: 'application/json',
        body: JSON.stringify(detail),
      });
    }
    if (urlPath.startsWith('/api/v1/return-evidence/')) {
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          'base64',
        ),
      });
    }
    return route.fulfill({ status: 404 });
  });
}

await mkdir(outDir, { recursive: true });
const css = await readFile(path.join(root, 'apps/web/app/globals.css'), 'utf8');
const formHtml = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { margin: 0; background: #f5f5f5; font-family: system-ui, sans-serif; color: #111827; }
.wrap { max-width: 720px; margin: 24px auto; padding: 0 16px; }
${css}
</style></head>
<body><div class="wrap">
<section class="return-form" aria-labelledby="return-form-title">
  <h2 id="return-form-title">Trả hàng / Hoàn tiền</h2>
  <p>Chọn sản phẩm cần trả. Số tiền hiển thị là ước tính từ phần hàng đã thanh toán; kết quả cuối cùng do hệ thống xác nhận.</p>
  <div class="return-form__lines">
    <label>
      <span><strong>Ghế công thái học</strong><small>Đen</small></span>
      <input type="number" value="1" min="0" max="2" aria-label="Số lượng trả: Ghế công thái học" />
    </label>
  </div>
  <div class="return-form__fields">
    <label class="return-form__field">Lý do
      <select><option>Sản phẩm hư hỏng</option></select>
    </label>
    <label class="return-form__field">Mô tả vấn đề
      <textarea rows="4">Sản phẩm bị hư hỏng khi nhận hàng</textarea>
      <small class="return-form__char-count">34/1000</small>
    </label>
    <div class="return-form__evidence">
      <span class="return-form__evidence-label">Ảnh bằng chứng (1–5 ảnh)</span>
      <label class="return-form__upload">
        <span>Chọn ảnh JPEG, PNG hoặc WebP · tối đa 5 MiB mỗi ảnh</span>
        <input type="file" />
      </label>
    </div>
  </div>
  <p class="return-form__amount"><span>Hoàn tiền ước tính</span><strong>100.000₫</strong></p>
  <div class="return-form__actions">
    <button type="button" class="return-form__submit">Gửi yêu cầu trả hàng</button>
  </div>
</section>
</div></body></html>`;
await writeFile(path.join(outDir, 'form-preview.html'), formHtml, 'utf8');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await install(page);
await page.goto(`${base}/account/returns`, { waitUntil: 'networkidle' });
await page.waitForSelector('.return-card, .return-workflow__heading');
await page.screenshot({ path: path.join(outDir, 'queue-desktop.png'), fullPage: true });
await page.goto(`${base}/account/returns/${returnIds.returnRequest}`, { waitUntil: 'networkidle' });
await page.waitForSelector('.return-detail');
await page.screenshot({ path: path.join(outDir, 'detail-desktop.png'), fullPage: true });
await page.setViewportSize({ width: 360, height: 800 });
await page.goto(`${base}/account/returns`, { waitUntil: 'networkidle' });
await page.waitForSelector('.return-card, .return-workflow__heading');
await page.screenshot({ path: path.join(outDir, 'queue-mobile.png'), fullPage: true });

const formPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await formPage.goto(`file://${path.join(outDir, 'form-preview.html')}`);
await formPage.screenshot({ path: path.join(outDir, 'form-desktop.png'), fullPage: true });
await formPage.setViewportSize({ width: 360, height: 800 });
await formPage.screenshot({ path: path.join(outDir, 'form-mobile.png'), fullPage: true });
await browser.close();
console.log(`Wrote previews to ${outDir}`);

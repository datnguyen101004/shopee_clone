import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { awsDeploymentDiagram } from './aws-deployment-diagram.mjs';

const output = path.resolve('docs/images/architecture');
await mkdir(output, { recursive: true });
const escape = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const text = (x, y, value, size = 20, color = '#233047', weight = 400) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${escape(value)}</text>`;
const box = (x, y, w, h, title, lines, color = '#e9572d', fill = '#fff') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${fill}" stroke="#d9e1ed" stroke-width="2"/><rect x="${x}" y="${y + 18}" width="5" height="${h - 36}" rx="2" fill="${color}"/>${text(x + 22, y + 38, title, 22, color, 700)}${lines.map((line, i) => text(x + 22, y + 72 + i * 29, line, 18)).join('')}`;
const arrow = (d, label, x, y, dashed = false) =>
  `<path d="${d}" fill="none" stroke="#72849c" stroke-width="2.5" marker-end="url(#arrow)" ${dashed ? 'stroke-dasharray="7 5"' : ''}/>${label ? text(x, y, label, 15, '#52647b', 600) : ''}`;
const svg = (height, title, subtitle, content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1480" height="${height}" viewBox="0 0 1480 ${height}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#72849c"/></marker></defs><rect width="1480" height="${height}" fill="#f4f7fc"/><g font-family="Segoe UI, Arial, sans-serif">${text(40, 55, title, 34, '#18263b', 700)}${text(40, 92, subtitle, 19, '#61718a')}${content}</g></svg>`;

const application = svg(
  1000,
  'Shopee Clone · Kiến trúc ứng dụng',
  'TypeScript monorepo · Next.js + NestJS modular monolith · PostgreSQL là nguồn dữ liệu nghiệp vụ',
  [
    box(40, 145, 320, 310, 'Next.js / React', [
      'Buyer · Mua sắm & tài khoản',
      'Seller · Vận hành gian hàng',
      'Admin · Quản trị & kiểm duyệt',
      '',
      'App Router · SSR + Client UI',
      'HTTP API + Socket.IO',
    ]),
    box(
      40,
      535,
      320,
      168,
      'Workspace dùng chung',
      ['contracts · DTO / validation', 'ui · tokens / components', 'config · TypeScript / ESLint'],
      '#6865c9',
    ),
    '<rect x="455" y="145" width="540" height="558" rx="20" fill="#fff7f3" stroke="#efbba9" stroke-width="2"/>',
    text(480, 184, 'NestJS API · /api/v1', 25, '#c94d24', 700),
    text(480, 215, 'Guards · RBAC · ownership · validation', 18, '#81513e'),
    box(480, 244, 238, 108, 'Tài khoản', ['Auth · profile · địa chỉ'], '#c94d24'),
    box(734, 244, 238, 108, 'Sản phẩm', ['Shop · catalog · media'], '#c94d24'),
    box(480, 368, 238, 108, 'Mua hàng', ['Cart · giá · voucher'], '#c94d24'),
    box(734, 368, 238, 108, 'Đơn & thanh toán', ['Kho · giao hàng · trả hàng'], '#c94d24'),
    box(480, 492, 238, 108, 'Tương tác', ['Chat · review · thông báo'], '#c94d24'),
    box(734, 492, 238, 108, 'Quản trị', ['Moderation · audit · KPI'], '#c94d24'),
    text(480, 645, 'Prisma / transactions · pg-boss · scheduler / outbox', 18, '#81513e', 600),
    text(480, 674, 'Worker và gateway chạy trong tiến trình API', 17, '#81513e'),
    box(
      1090,
      145,
      350,
      158,
      'PostgreSQL',
      [
        'Users · shops · products · orders',
        'Payment · inventory · audit',
        'Job / outbox state bền vững',
      ],
      '#3375b8',
    ),
    box(
      1090,
      353,
      350,
      145,
      'Elasticsearch',
      ['Search index · suggestions', 'Xếp hạng / cá nhân hóa', 'Fallback truy vấn PostgreSQL'],
      '#3375b8',
    ),
    box(
      1090,
      548,
      350,
      155,
      'Media storage',
      ['Local: filesystem', 'AWS: S3 private + CloudFront', 'Upload trực tiếp bằng presigned URL'],
      '#3375b8',
    ),
    arrow('M360 300 H455', 'HTTP', 373, 280),
    arrow('M995 230 H1090', 'Prisma', 1003, 210),
    arrow('M995 425 H1090', 'Index', 1008, 405),
    arrow('M995 610 H1090', 'Media', 1005, 590),
    box(
      40,
      795,
      1400,
      135,
      'Tích hợp nghiệp vụ',
      [
        'Google OAuth   •   COD / VNPAY sandbox / MoMo sandbox   •   Demo Carrier (mô phỏng)   •   Email adapter',
        'Bật theo cấu hình môi trường; callback thanh toán được xác minh tại API.',
      ],
      '#6865c9',
    ),
    arrow('M725 703 V795', 'Adapters / callbacks', 743, 754),
    text(
      40,
      971,
      'Nguồn: apps/api/src · apps/web · packages · compose.yaml · compose-prod.yaml',
      16,
      '#61718a',
    ),
  ].join(''),
);

const deployment = await awsDeploymentDiagram();

const browser = await chromium.launch({ headless: true });
try {
  for (const [name, content] of [
    ['application', application],
    ['aws-deployment', deployment],
  ]) {
    await writeFile(path.join(output, `${name}.svg`), content + '\n');
    const height = Number(content.match(/height="(\d+)"/)[1]);
    const width = Number(content.match(/width="(\d+)"/)[1]);
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1.5,
    });
    await page.setContent(`<html><body style="margin:0">${content}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}

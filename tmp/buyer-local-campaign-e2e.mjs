import { chromium } from 'playwright';

const baseUrl = process.env.BUYER_E2E_BASE_URL ?? 'http://localhost:3000';
const email = process.env.BUYER_EMAIL;
const password = process.env.BUYER_PASSWORD;
if (!email || !password) throw new Error('BUYER_EMAIL and BUYER_PASSWORD are required.');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  const loginResponsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/auth/login',
    { timeout: 15_000 },
  );
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const loginResponse = await loginResponsePromise;
  let errorCode = '';
  if (!loginResponse.ok()) {
    try {
      const body = await loginResponse.json();
      errorCode = typeof body?.code === 'string' ? body.code : typeof body?.error?.code === 'string' ? body.error.code : '';
    } catch {
      errorCode = '';
    }
  }
  console.log(`LOGIN_RESPONSE_STATUS=${loginResponse.status()}`);
  if (errorCode) console.log(`LOGIN_RESPONSE_CODE=${errorCode}`);
  try {
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  } catch {
    const alert = page.getByRole('alert').first();
    console.log(`LOGIN_BLOCKER=${(await alert.textContent().catch(() => 'No login navigation')).trim()}`);
    throw new Error('BUYER_LOGIN_BLOCKED');
  }
  console.log('LOGIN_OK');

  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  const banners = page.locator('section[data-module-type="campaign-banner"] a.hero-banner-link:visible');
  const count = await banners.count();
  console.log(`BANNER_COUNT=${count}`);
  if (count === 0) {
    console.log('BANNER_BLOCKER=No visible campaign banner link on homepage');
    process.exitCode = 2;
  } else {
    const banner = banners.first();
    console.log(`BANNER_LABEL=${await banner.getAttribute('aria-label') ?? ''}`);
    console.log(`BANNER_HREF=${await banner.getAttribute('href') ?? ''}`);
    await Promise.all([
      page.waitForURL((url) => url.pathname.startsWith('/campaigns/') || url.pathname.startsWith('/banner/'), { timeout: 15_000 }),
      banner.click(),
    ]);
    await page.waitForURL((url) => url.pathname.startsWith('/campaigns/'), { timeout: 15_000 });
    await page.waitForFunction(() => Boolean(document.querySelector('article.campaign-detail, [role="alert"] h1')), null, { timeout: 15_000 });
    const detail = page.locator('article.campaign-detail');
    if ((await detail.count()) === 0) {
      console.log(`CAMPAIGN_BLOCKER=${(await page.getByRole('heading').first().innerText()).trim()}`);
      process.exitCode = 2;
    } else {
      console.log(`CAMPAIGN_TITLE=${(await detail.getByRole('heading', { level: 1 }).innerText()).trim()}`);
      console.log(`CAMPAIGN_PRODUCT_COUNT=${await detail.locator('.campaign-detail__product').count()}`);
    }
    console.log(`CAMPAIGN_URL=${page.url()}`);
  }
} finally {
  await browser.close();
}

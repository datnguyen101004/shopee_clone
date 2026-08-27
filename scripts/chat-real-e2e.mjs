import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageManagerPath = process.env.npm_execpath;
if (!packageManagerPath) throw new Error('Real chat E2E must run through the pinned pnpm script.');

const environment = { ...process.env, CHAT_REAL_E2E: '1', FULL_STACK_E2E: '1' };
if (process.env.CHAT_E2E_PREPARE === '1') {
  const prepared = spawnSync(
    process.execPath,
    [
      packageManagerPath,
      '--silent',
      '--filter',
      '@shopee-clone/api',
      'exec',
      'tsx',
      'prisma/prepare-chat-e2e.ts',
    ],
    {
      cwd: repositoryRoot,
      env: environment,
      encoding: 'utf8',
      stdio: 'pipe',
      windowsHide: true,
    },
  );
  if (prepared.error) throw prepared.error;
  if (prepared.status !== 0)
    throw new Error(
      `Could not prepare deterministic chat E2E fixtures.\n${prepared.stdout ?? ''}${prepared.stderr ?? ''}`,
    );
  const payload = JSON.parse((prepared.stdout ?? '').trim().split(/\r?\n/).at(-1) ?? '{}');
  environment.CHAT_E2E_REFRESH_TOKENS = JSON.stringify(payload.refreshTokens ?? {});
  environment.CHAT_E2E_BUYER_REFRESH_TOKEN = payload.refreshTokens?.desktop?.exchange?.buyer;
  environment.CHAT_E2E_SELLER_REFRESH_TOKEN = payload.refreshTokens?.desktop?.exchange?.seller;
  environment.CHAT_E2E_PRODUCT_ID = payload.productId;
  environment.CHAT_E2E_SELLER_ID = payload.sellerId;
  environment.CHAT_E2E_SHOP_ID = payload.shopId;
  environment.CHAT_E2E_SHOP_SLUG = payload.shopSlug;
  environment.CHAT_E2E_SHOP_NAME = payload.shopName;
  environment.CHAT_E2E_TEMPORARY_SHOP_ID = payload.temporaryShopId;
  environment.CHAT_E2E_TEMPORARY_SHOP_SLUG = payload.temporaryShopSlug;
  environment.CHAT_E2E_BUYER_EMAIL = payload.buyerEmail;
  environment.CHAT_E2E_BUYER_PASSWORD = payload.buyerPassword;
  environment.CHAT_E2E_BUYER_ADDRESS_ID = payload.buyerAddressId;
}
const required = [
  'CHAT_E2E_BUYER_REFRESH_TOKEN',
  'CHAT_E2E_SELLER_REFRESH_TOKEN',
  'CHAT_E2E_PRODUCT_ID',
];
const missing = required.filter((name) => !environment[name]);
if (missing.length > 0) throw new Error(`${missing.join(', ')} is required for real chat E2E.`);

let primaryError;
try {
  const result = spawnSync(
    process.execPath,
    [packageManagerPath, 'exec', 'playwright', 'test', 'e2e/chat-real.spec.ts'],
    {
      cwd: repositoryRoot,
      env: environment,
      encoding: 'utf8',
      stdio: 'pipe',
      windowsHide: true,
    },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Real chat Playwright failed with exit code ${result.status}.`);
  if (!/\bpassed\b/i.test(output) || /\bskipped\b/i.test(output)) {
    throw new Error('Real chat Playwright gate did not report a passing, non-skipped test.');
  }
} catch (error) {
  primaryError = error;
} finally {
  if (process.env.CHAT_E2E_PREPARE === '1' && environment.CHAT_E2E_SELLER_ID) {
    const cleanup = spawnSync(
      process.execPath,
      [
        packageManagerPath,
        '--silent',
        '--filter',
        '@shopee-clone/api',
        'exec',
        'tsx',
        'prisma/cleanup-chat-e2e.ts',
      ],
      { cwd: repositoryRoot, env: environment, encoding: 'utf8', stdio: 'pipe', windowsHide: true },
    );
    if (cleanup.status !== 0 && !primaryError)
      primaryError = new Error(
        `Could not clean deterministic chat E2E fixtures.\n${cleanup.stdout ?? ''}${cleanup.stderr ?? ''}`,
      );
  }
}
if (primaryError) throw primaryError;

import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.E2E_WEB_PORT ?? 3000);
const apiPort = Number(process.env.PORT ?? 3001);
const fullStack = process.env.FULL_STACK_E2E === '1';
const chatReal = process.env.CHAT_REAL_E2E === '1';
const browserHost =
  process.env.E2E_WEB_HOST ??
  (process.env.NEXT_PUBLIC_API_BASE_URL?.includes('127.0.0.1') ? '127.0.0.1' : 'localhost');

export default defineConfig({
  testDir: './e2e',
  testIgnore: process.env.CHAT_REAL_E2E === '1' ? [] : ['**/chat-real.spec.ts'],
  // Real chat projects share one-time refresh sessions and a deterministic
  // fixture; keep their breakpoint projects serial so token rotation cannot
  // make one viewport invalidate another.
  fullyParallel: !fullStack && !chatReal,
  workers: fullStack || chatReal ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: { timeout: fullStack || chatReal ? 15_000 : 5_000 },
  snapshotPathTemplate: '{testDir}/snapshots/{arg}-{projectName}{ext}',
  use: {
    // Keep the storefront origin aligned with the API cookie host used by
    // real chat fixtures; localhost and 127.0.0.1 are different cookie sites.
    baseURL: `http://${browserHost}:${webPort}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    ...(fullStack
      ? [
          {
            command: 'node apps/api/dist/main.js',
            url: `http://127.0.0.1:${apiPort}/api/v1/health`,
            reuseExistingServer: false,
            timeout: 120_000,
          },
        ]
      : []),
    {
      command: `npx --yes pnpm@10.34.5 --filter @shopee-clone/web exec next start --port ${webPort}`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: !process.env.CI && !fullStack,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 } },
    },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
});

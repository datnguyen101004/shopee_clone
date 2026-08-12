import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.E2E_WEB_PORT ?? 3000);
const apiPort = Number(process.env.PORT ?? 3001);
const fullStack = process.env.FULL_STACK_E2E === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: !fullStack,
  workers: fullStack ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  snapshotPathTemplate: '{testDir}/snapshots/{arg}-{projectName}{ext}',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
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

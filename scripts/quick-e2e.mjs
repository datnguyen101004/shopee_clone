import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suite =
  ['homepage', 'catalog', 'product', 'auth', 'account'].find((candidate) =>
    process.argv.includes(candidate),
  ) ?? 'homepage';
const webPort = Number(process.env.E2E_WEB_PORT ?? 3000);
const apiPort = Number(process.env.PORT ?? 3001);
const webUrl = `http://127.0.0.1:${webPort}`;
const apiHealthUrl = `http://127.0.0.1:${apiPort}/api/v1/health`;

async function assertHealthy(label, url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(3_000) });
  } catch {
    throw new Error(`${label} is not reachable at ${url}. Start local services with "pnpm dev".`);
  }
  if (!response.ok) throw new Error(`${label} health check returned HTTP ${response.status}.`);
}

function runPlaywright() {
  const packageManagerPath = process.env.npm_execpath;
  if (!packageManagerPath) throw new Error('Quick E2E must run through the pinned pnpm script.');
  const result = spawnSync(
    process.execPath,
    [packageManagerPath, 'exec', 'playwright', 'test', `e2e/${suite}.spec.ts`, '--workers=1'],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        QUICK_E2E: '1',
        E2E_WEB_PORT: String(webPort),
        HOMEPAGE_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
        PRODUCT_DETAIL_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
        NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
      },
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Quick ${suite} E2E failed.`);
}

await assertHealthy('API', apiHealthUrl);
await assertHealthy('Web', webUrl);
runPlaywright();
console.log(`Quick ${suite} E2E passed against already-running local services.`);

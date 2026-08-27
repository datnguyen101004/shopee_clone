import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageManagerPath = process.env.npm_execpath;

if (!packageManagerPath) {
  throw new Error('Chat PostgreSQL verification must run through the pinned pnpm script.');
}
if (process.env.RUN_CHAT_DATABASE_TESTS !== '1') {
  throw new Error(
    'RUN_CHAT_DATABASE_TESTS=1 is required; refusing to report a skipped chat database suite as a pass.',
  );
}
if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL or DATABASE_URL is required for chat PostgreSQL verification.',
  );
}

const result = spawnSync(
  process.execPath,
  [
    packageManagerPath,
    '--filter',
    '@shopee-clone/api',
    'exec',
    'jest',
    '--runInBand',
    'test/chat.postgres.e2e.spec.ts',
  ],
  {
    cwd: repositoryRoot,
    env: { ...process.env, RUN_CHAT_DATABASE_TESTS: '1' },
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true,
  },
);
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
process.stdout.write(output);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (!/Test Suites:\s+1 passed,\s+1 total/.test(output) || /Test Suites:\s+0 passed/.test(output)) {
  throw new Error('Chat PostgreSQL verification did not execute one passing database suite.');
}

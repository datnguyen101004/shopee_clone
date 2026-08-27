import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageManagerPath = process.env.npm_execpath;
const target = '2f6dd7f3-7982-47af-b230-442b54ba5e57';
if (!packageManagerPath)
  throw new Error('Chat release verification must run through the pinned pnpm script.');
if (process.env.CHAT_REPAIR_CONFIRM !== target)
  throw new Error(
    `CHAT_REPAIR_CONFIRM must equal the approved exact conversation identifier ${target}.`,
  );

function run(args, environment = process.env) {
  const result = spawnSync(process.execPath, [packageManagerPath, ...args], {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed: pnpm ${args.join(' ')}`);
}

run(['--filter', '@shopee-clone/api', 'exec', 'prisma', 'migrate', 'status']);
run(['--filter', '@shopee-clone/api', 'db:migration:checksums']);
run(['--filter', '@shopee-clone/api', 'chat:preflight']);
run([
  '--filter',
  '@shopee-clone/api',
  'chat:repair:legacy-conversation',
  '--',
  '--confirm',
  target,
]);
run(['--filter', '@shopee-clone/api', 'chat:preflight']);
run(['test:chat:database'], { ...process.env, RUN_CHAT_DATABASE_TESTS: '1' });

const healthUrl = process.env.CHAT_OUTBOX_HEALTH_URL;
if (healthUrl) {
  const response = await fetch(healthUrl, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Chat outbox health returned HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.ready !== true) throw new Error('Chat outbox is not ready.');
}
console.log('Chat release verification passed in the documented order.');

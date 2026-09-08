import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAvailablePort, createSmokeEnvironment, createSmokeProjectName, buildComposeArgs, assertCleanupTargets, redactSensitiveOutput } from '../scripts/infrastructure-smoke-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = path.join(root, 'compose.yaml');
const run = (command, args, env, capture = false, shell = false) => {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', windowsHide: true, shell });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}).\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  return result;
};
const pnpm = (args, env) => {
  const packageManagerPath = process.env.npm_execpath ?? path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
  return run(process.execPath, [packageManagerPath, ...args], env);
};

const projectName = createSmokeProjectName(`flashsale${process.pid}${crypto.randomUUID()}`);
const databasePort = await findAvailablePort();
const apiPort = await findAvailablePort();
const webPort = await findAvailablePort();
const redisPort = await findAvailablePort();
const password = `flash_sale_${crypto.randomBytes(18).toString('base64url')}`;
const variables = createSmokeEnvironment({ databasePort, apiPort, password, projectName });
const env = {
  ...process.env,
  ...variables,
  NODE_ENV: 'test',
  REDIS_PORT: String(redisPort),
  REDIS_URL: `redis://127.0.0.1:${redisPort}`,
  E2E_WEB_PORT: String(webPort),
  NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
  HOMEPAGE_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
  AUTH_ALLOWED_ORIGINS: `http://127.0.0.1:${webPort}`,
  AUTH_WEB_BASE_URL: `http://127.0.0.1:${webPort}`,
  GOOGLE_CLIENT_ID: 'e2e-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'e2e-only-google-client-secret',
  GOOGLE_CALLBACK_URL: `http://127.0.0.1:${apiPort}/login/oauth2/code/google`,
  FULL_STACK_E2E: '1',
};
assertCleanupTargets({ projectName, composeFile, repositoryRoot: root });
let failure;
try {
  run('docker', buildComposeArgs(projectName, composeFile, ['up', '--detach', '--wait']), env);
  pnpm(['--filter', '@shopee-clone/api', 'db:generate'], env);
  pnpm(['--filter', '@shopee-clone/api', 'db:migrate:deploy'], env);
  pnpm(['--filter', '@shopee-clone/api', 'db:seed'], env);
  pnpm(['--filter', '@shopee-clone/api', 'exec', 'tsx', '../../tmp/flash-sale-e2e-setup.ts'], env);
  if (process.env.SKIP_BUILD !== '1') pnpm(['build'], env);
  pnpm(['exec', 'playwright', 'test', 'e2e/_flash-sale-e2e.spec.ts', '--project=desktop', '--workers=1'], env);
} catch (error) {
  failure = error;
} finally {
  run('docker', buildComposeArgs(projectName, composeFile, ['down', '--volumes', '--remove-orphans']), env, true);
}
if (failure) throw new Error(redactSensitiveOutput(failure instanceof Error ? failure.message : String(failure), [password, variables.DATABASE_URL, variables.TEST_DATABASE_URL]));

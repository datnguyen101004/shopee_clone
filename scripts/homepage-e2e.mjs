import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  assertCleanupTargets,
  buildComposeArgs,
  createSmokeEnvironment,
  createSmokeProjectName,
  findAvailablePort,
  redactSensitiveOutput,
} from './infrastructure-smoke-lib.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = path.join(repositoryRoot, 'compose.yaml');

function run(command, args, environment, capture = false) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}.\n${result.stdout ?? ''}${result.stderr ?? ''}`,
    );
  }
  return result;
}

function pnpm(args, environment) {
  const packageManagerPath = process.env.npm_execpath;
  if (!packageManagerPath)
    throw new Error('test:e2e:homepage must run through the pinned pnpm script.');
  return run(process.execPath, [packageManagerPath, ...args], environment);
}

function verifyCleanup(projectName, environment) {
  for (const args of [
    ['ps', '--all', '--quiet', '--filter', `label=com.docker.compose.project=${projectName}`],
    ['network', 'ls', '--quiet', '--filter', `label=com.docker.compose.project=${projectName}`],
    ['volume', 'ls', '--quiet', '--filter', `label=com.docker.compose.project=${projectName}`],
  ]) {
    if (run('docker', args, environment, true).stdout.trim())
      throw new Error(`E2E cleanup left Docker resources for ${projectName}.`);
  }
}

async function main() {
  const suite =
    ['homepage', 'catalog', 'product'].find((candidate) => process.argv.includes(candidate)) ??
    'homepage';
  const projectName = createSmokeProjectName(`${suite}${process.pid}${crypto.randomUUID()}`);
  const databasePort = await findAvailablePort();
  const apiPort = await findAvailablePort();
  const webPort = await findAvailablePort();
  const password = `homepage_${crypto.randomBytes(18).toString('base64url')}`;
  const variables = createSmokeEnvironment({ databasePort, apiPort, password, projectName });
  const environment = {
    ...process.env,
    ...variables,
    E2E_WEB_PORT: String(webPort),
    HOMEPAGE_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
    PRODUCT_DETAIL_API_BASE_URL: `http://127.0.0.1:${apiPort}`,
    FULL_STACK_E2E: '1',
  };
  const secrets = [password, variables.DATABASE_URL, variables.TEST_DATABASE_URL];
  let primaryError;
  assertCleanupTargets({ projectName, composeFile, repositoryRoot });

  try {
    console.log(`Starting isolated ${suite} E2E project ${projectName}...`);
    run(
      'docker',
      buildComposeArgs(projectName, composeFile, ['up', '--detach', '--wait']),
      environment,
    );
    pnpm(['db:generate'], environment);
    pnpm(['db:migrate:deploy'], environment);
    pnpm(['db:seed'], environment);
    pnpm(['db:verify'], environment);
    if (suite === 'catalog') {
      pnpm(
        [
          '--filter',
          '@shopee-clone/api',
          'exec',
          'jest',
          '--runInBand',
          'test/catalog.postgres.e2e.spec.ts',
        ],
        { ...environment, RUN_CATALOG_DATABASE_TESTS: '1' },
      );
    }
    if (suite === 'product') {
      pnpm(
        [
          '--filter',
          '@shopee-clone/api',
          'exec',
          'jest',
          '--runInBand',
          'test/product-detail.postgres.e2e.spec.ts',
        ],
        { ...environment, RUN_PRODUCT_DETAIL_DATABASE_TESTS: '1' },
      );
    }
    pnpm(['build'], environment);
    const playwrightArgs = ['exec', 'playwright', 'test', `e2e/${suite}.spec.ts`];
    if (process.argv.includes('--update-snapshots')) playwrightArgs.push('--update-snapshots');
    pnpm(playwrightArgs, environment);
    console.log(`Real API-driven ${suite} E2E verification passed.`);
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      run(
        'docker',
        buildComposeArgs(projectName, composeFile, ['down', '--volumes', '--remove-orphans']),
        environment,
        true,
      );
      verifyCleanup(projectName, environment);
      console.log(`Removed isolated ${suite} E2E project ${projectName}.`);
    } catch (cleanupError) {
      primaryError ??= cleanupError;
    }
  }

  if (primaryError) {
    throw new Error(
      redactSensitiveOutput(
        primaryError instanceof Error ? primaryError.message : String(primaryError),
        secrets,
      ),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

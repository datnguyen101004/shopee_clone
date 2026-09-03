import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
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
const apiRoot = path.join(repositoryRoot, 'apps', 'api');

function runCommand(command, args, { environment, capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (!allowFailure && result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}.\n${output}`,
    );
  }

  return result;
}

function runPnpm(args, environment) {
  const packageManagerPath = process.env.npm_execpath;
  if (!packageManagerPath) {
    throw new Error('infra:smoke must be run through the pinned pnpm package script.');
  }

  return runCommand(process.execPath, [packageManagerPath, ...args], { environment });
}

async function waitForApi(apiProcess, apiPort) {
  const healthUrl = `http://127.0.0.1:${apiPort}/api/v1/health`;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    if (apiProcess.exitCode !== null) {
      throw new Error(`API exited before becoming healthy with code ${apiProcess.exitCode}.`);
    }

    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        const body = await response.json();
        if (body.status !== 'ok' || body.service !== 'api') {
          throw new Error('API health response did not match the expected contract.');
        }

        console.log(`API health verification passed: HTTP ${response.status}.`);
        return;
      }
    } catch {
      // The API can refuse connections while NestJS and Prisma initialize.
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error('API did not become healthy within 30 seconds.');
}

async function waitForProcessExit(apiProcess, timeoutMilliseconds) {
  if (apiProcess.exitCode !== null) {
    return true;
  }

  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timeout);
      apiProcess.off('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timeout = setTimeout(() => finish(false), timeoutMilliseconds);

    apiProcess.once('exit', onExit);
    if (apiProcess.exitCode !== null) {
      finish(true);
    }
  });
}

async function stopApi(apiProcess) {
  if (!apiProcess || apiProcess.exitCode !== null) {
    return;
  }

  apiProcess.kill('SIGTERM');
  const exitedGracefully = await waitForProcessExit(apiProcess, 5_000);

  if (!exitedGracefully) {
    apiProcess.kill('SIGKILL');
    const exitedForcibly = await waitForProcessExit(apiProcess, 5_000);
    if (!exitedForcibly) {
      throw new Error('API process did not exit during smoke cleanup.');
    }
  }
}

function verifyNoComposeResources(projectName) {
  const filters = [
    ['ps', '--all', '--quiet', '--filter', `label=com.docker.compose.project=${projectName}`],
    ['network', 'ls', '--quiet', '--filter', `label=com.docker.compose.project=${projectName}`],
    ['volume', 'ls', '--quiet', '--filter', `label=com.docker.compose.project=${projectName}`],
  ];

  for (const args of filters) {
    const result = runCommand('docker', args, { capture: true });
    if (result.stdout.trim()) {
      throw new Error(`Smoke cleanup left Docker resources for ${projectName}.`);
    }
  }
}

async function main() {
  const projectName = createSmokeProjectName(`${process.pid}${crypto.randomUUID()}`);
  const databasePort = await findAvailablePort();
  const apiPort = await findAvailablePort();
  const password = `smoke_${crypto.randomBytes(18).toString('base64url')}`;
  const smokeVariables = createSmokeEnvironment({
    databasePort,
    apiPort,
    password,
    projectName,
  });
  const environment = { ...process.env, ...smokeVariables };
  const secrets = [password, smokeVariables.DATABASE_URL, smokeVariables.TEST_DATABASE_URL];
  let apiProcess;
  let apiOutput = '';
  let primaryError;

  assertCleanupTargets({ projectName, composeFile, repositoryRoot });
  console.log(`Starting isolated Compose project ${projectName}...`);

  try {
    runCommand('docker', ['compose', 'version'], { environment });
    runCommand('docker', buildComposeArgs(projectName, composeFile, ['up', '--detach', '--wait']), {
      environment,
    });

    console.log('Generating the ignored Prisma client from the committed schema...');
    runPnpm(['db:generate'], environment);

    console.log('Applying development migrations and deterministic seed...');
    runPnpm(['db:migrate:deploy'], environment);
    runPnpm(['db:seed'], environment);

    console.log('Running guarded persistence verification against the isolated test database...');
    runPnpm(['db:verify'], environment);

    console.log('Building and starting the API against isolated PostgreSQL...');
    runPnpm(['build', '--filter=@shopee-clone/api'], environment);
    apiProcess = spawn(process.execPath, [path.join(apiRoot, 'dist', 'main.js')], {
      cwd: apiRoot,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    apiProcess.stdout.on('data', (chunk) => {
      apiOutput += chunk.toString();
    });
    apiProcess.stderr.on('data', (chunk) => {
      apiOutput += chunk.toString();
    });

    await waitForApi(apiProcess, apiPort);
    console.log('Local infrastructure smoke verification passed.');
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      await stopApi(apiProcess);
      runCommand(
        'docker',
        buildComposeArgs(projectName, composeFile, ['down', '--volumes', '--remove-orphans']),
        { environment, capture: true },
      );
      verifyNoComposeResources(projectName);
      console.log(`Removed isolated Compose project ${projectName}.`);
    } catch (cleanupError) {
      primaryError ??= cleanupError;
    }
  }

  if (primaryError) {
    const message = primaryError instanceof Error ? primaryError.message : String(primaryError);
    const output = apiOutput ? `\nAPI output:\n${apiOutput}` : '';
    throw new Error(redactSensitiveOutput(`${message}${output}`, secrets));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

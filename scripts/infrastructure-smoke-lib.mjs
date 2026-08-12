import crypto from 'node:crypto';
import net from 'node:net';
import path from 'node:path';

export const smokeProjectPrefix = 'shopee-clone-smoke-';

export function createSmokeProjectName(token = crypto.randomUUID()) {
  const normalizedToken = token
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20);
  if (!normalizedToken) {
    throw new Error('Smoke project token must contain at least one letter or number.');
  }

  return `${smokeProjectPrefix}${normalizedToken}`;
}

export function assertSmokeProjectName(projectName) {
  if (
    typeof projectName !== 'string' ||
    !projectName.startsWith(smokeProjectPrefix) ||
    !/^[a-z0-9-]+$/.test(projectName)
  ) {
    throw new Error('Refusing to operate on a non-smoke Compose project.');
  }
}

export function assertCleanupTargets({ projectName, composeFile, repositoryRoot }) {
  assertSmokeProjectName(projectName);

  const expectedComposeFile = path.resolve(repositoryRoot, 'compose.yaml');
  if (path.resolve(composeFile) !== expectedComposeFile) {
    throw new Error('Refusing cleanup because the Compose file is outside the repository target.');
  }
}

export function buildComposeArgs(projectName, composeFile, commandArgs) {
  assertSmokeProjectName(projectName);
  return ['compose', '--project-name', projectName, '--file', composeFile, ...commandArgs];
}

export function createSmokeEnvironment({ databasePort, apiPort, password, projectName }) {
  assertSmokeProjectName(projectName);
  if (!Number.isInteger(databasePort) || databasePort <= 0) {
    throw new Error('Smoke database port must be a positive integer.');
  }
  if (!Number.isInteger(apiPort) || apiPort <= 0) {
    throw new Error('Smoke API port must be a positive integer.');
  }
  if (typeof password !== 'string' || password.length < 16) {
    throw new Error('Smoke database password must contain at least 16 characters.');
  }

  const user = 'shopee_smoke';
  const developmentDatabase = 'shopee_clone_smoke';
  const testDatabase = 'shopee_clone_smoke_test';
  const authority = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  const host = `127.0.0.1:${databasePort}`;

  return {
    POSTGRES_USER: user,
    POSTGRES_PASSWORD: password,
    POSTGRES_DB: developmentDatabase,
    POSTGRES_TEST_DB: testDatabase,
    POSTGRES_PORT: String(databasePort),
    SHOPEE_COMPOSE_SCOPE: 'smoke',
    DATABASE_URL: `postgresql://${authority}@${host}/${developmentDatabase}`,
    TEST_DATABASE_URL: `postgresql://${authority}@${host}/${testDatabase}`,
    PORT: String(apiPort),
  };
}

export function redactSensitiveOutput(value, secrets = []) {
  let sanitized = String(value);
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length > 0) {
      sanitized = sanitized.replaceAll(secret, '[REDACTED]');
    }
  }

  return sanitized
    .replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/(POSTGRES_PASSWORD=)[^\s]+/gi, '$1[REDACTED]');
}

export async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not resolve an available local port.')));
        return;
      }

      const { port } = address;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

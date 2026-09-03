import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  assertCleanupTargets,
  assertSmokeProjectName,
  buildComposeArgs,
  createSmokeEnvironment,
  createSmokeProjectName,
  redactSensitiveOutput,
  smokeProjectPrefix,
} from './infrastructure-smoke-lib.mjs';

test('creates and accepts only isolated smoke project names', () => {
  const projectName = createSmokeProjectName('T04-verification_123');
  assert.equal(projectName, `${smokeProjectPrefix}t04verification123`);
  assert.doesNotThrow(() => assertSmokeProjectName(projectName));
  assert.throws(() => assertSmokeProjectName('shopee-clone'));
  assert.throws(() => assertSmokeProjectName(`${smokeProjectPrefix}unsafe/path`));
});

test('restricts cleanup to the repository compose file', () => {
  const repositoryRoot = path.resolve('workspace');
  const composeFile = path.join(repositoryRoot, 'compose.yaml');
  const projectName = createSmokeProjectName('cleanup');

  assert.doesNotThrow(() => assertCleanupTargets({ projectName, composeFile, repositoryRoot }));
  assert.throws(() =>
    assertCleanupTargets({
      projectName,
      composeFile: path.resolve('other', 'compose.yaml'),
      repositoryRoot,
    }),
  );
});

test('builds an exact destructive cleanup command for the isolated project', () => {
  const projectName = createSmokeProjectName('composeargs');
  assert.deepEqual(buildComposeArgs(projectName, 'compose.yaml', ['down', '--volumes']), [
    'compose',
    '--project-name',
    projectName,
    '--file',
    'compose.yaml',
    'down',
    '--volumes',
  ]);
});

test('creates distinct development and guarded test targets', () => {
  const projectName = createSmokeProjectName('environment');
  const environment = createSmokeEnvironment({
    databasePort: 55432,
    apiPort: 33001,
    password: 'runtime-only-password',
    projectName,
  });

  assert.notEqual(environment.DATABASE_URL, environment.TEST_DATABASE_URL);
  assert.match(new URL(environment.TEST_DATABASE_URL).pathname, /_test$/);
  assert.equal(environment.SHOPEE_COMPOSE_SCOPE, 'smoke');
  assert.equal(environment.POSTGRES_PORT, '55432');
});

test('redacts explicit secrets, PostgreSQL URLs, and password assignments', () => {
  const password = 'runtime-only-password';
  const databaseUrl = `postgresql://user:${password}@127.0.0.1:5432/example_test`;
  const sanitized = redactSensitiveOutput(
    `failed ${databaseUrl} ${password} POSTGRES_PASSWORD=${password}`,
    [password, databaseUrl],
  );

  assert.doesNotMatch(sanitized, /runtime-only-password/);
  assert.doesNotMatch(sanitized, /postgresql:\/\//);
  assert.match(sanitized, /\[REDACTED\]/);
});

test('redacts Google OAuth credentials, transaction material, identity and email fields', () => {
  const sanitized = redactSensitiveOutput(
    'GOOGLE_CLIENT_SECRET=client-secret code=one-time state=opaque nonce=random id_token=jwt provider_subject=123 email=buyer@example.com',
  );
  assert.doesNotMatch(sanitized, /client-secret|one-time|opaque|random|jwt|123|buyer@example/);
  assert.match(sanitized, /GOOGLE_CLIENT_SECRET=\[REDACTED\]/);
});

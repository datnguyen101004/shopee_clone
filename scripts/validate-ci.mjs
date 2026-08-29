import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
const deploymentScript = readFileSync(
  path.join(repositoryRoot, 'scripts', 'deploy-development-via-ssm.sh'),
  'utf8',
);
const packageManifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));

const requiredWorkflowFragments = [
  'push:',
  '- development',
  'workflow_dispatch:',
  'permissions:\n  contents: read',
  'cancel-in-progress: false',
  'NODE_VERSION: 22.12.0',
  'PNPM_VERSION: 10.34.5',
  'pnpm install --frozen-lockfile',
  'pnpm infra:config:example',
  'PROD_ENV_FILE=.env.example docker compose --env-file .env.example -f compose-prod.yaml --profile migration config --quiet',
  'pnpm ci:validate',
  'pnpm db:format',
  'git diff --exit-code -- apps/api/prisma/schema.prisma',
  'pnpm db:validate',
  'pnpm db:generate',
  'pnpm --filter @shopee-clone/api lint',
  'pnpm --filter @shopee-clone/api typecheck',
  'pnpm test:ci',
  'pnpm --filter @shopee-clone/api build',
  'target: runner',
  'target: migrator',
  'shopee-clone-api:${{ github.sha }}',
  'shopee-clone-api-migrator:${{ github.sha }}',
  'id-token: write',
  'bash scripts/deploy-development-via-ssm.sh',
];

for (const fragment of requiredWorkflowFragments) {
  assert(workflow.includes(fragment), `CI/CD workflow is missing required fragment: ${fragment}`);
}

for (const forbiddenFragment of ['playwright install', 'test:e2e', 'test:chat:real', 'db:seed']) {
  assert(!workflow.includes(forbiddenFragment), `Demo CI/CD must not run ${forbiddenFragment}.`);
}

const requiredDeploymentFragments = [
  'aws ssm send-command',
  '--document-name AWS-RunShellScript',
  'compose-prod.yaml.next config --quiet',
  'compose --profile migration run --rm --no-deps migrate',
  'compose up -d --no-deps --force-recreate api',
  'docker inspect --format',
  'compose logs --no-color --tail=150 api',
];

for (const fragment of requiredDeploymentFragments) {
  assert(
    deploymentScript.includes(fragment),
    `SSM deployment script is missing required fragment: ${fragment}`,
  );
}

assert(
  deploymentScript.indexOf('compose --profile migration run --rm --no-deps migrate') <
    deploymentScript.indexOf('compose up -d --no-deps --force-recreate api'),
  'Database migration must complete before the API is recreated.',
);

assert.equal(packageManifest.packageManager, 'pnpm@10.34.5');
assert.equal(packageManifest.engines.node, '>=22.12.0 <23');
assert.equal(packageManifest.engines.pnpm, '10.34.5');

const actionReferences = [...workflow.matchAll(/uses:\s+([^@\s]+)@([^\s#]+)/g)];
assert(actionReferences.length >= 7, 'CI/CD must use pinned setup, container, and AWS actions.');
for (const [, action, revision] of actionReferences) {
  assert.match(revision, /^[0-9a-f]{40}$/, `${action} must be pinned to a commit SHA.`);
}

for (const action of [
  'actions/checkout',
  'actions/setup-node',
  'pnpm/action-setup',
  'docker/setup-buildx-action',
  'docker/login-action',
  'docker/build-push-action',
  'aws-actions/configure-aws-credentials',
]) {
  assert(
    actionReferences.some((reference) => reference[1] === action),
    `CI/CD is missing ${action}.`,
  );
}

assert.doesNotMatch(workflow, /postgres(?:ql)?:\/\//i, 'CI/CD must not embed database URLs.');
assert.doesNotMatch(
  workflow,
  /POSTGRES_PASSWORD\s*:/i,
  'CI/CD must not embed PostgreSQL credentials.',
);

console.log('CI/CD workflow validation passed.');

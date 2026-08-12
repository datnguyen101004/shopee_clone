import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
const packageManifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));

const requiredFragments = [
  'workflow_dispatch:',
  'permissions:\n  contents: read',
  'cancel-in-progress: true',
  'NODE_VERSION: 22.12.0',
  'PNPM_VERSION: 10.34.5',
  'pnpm install --frozen-lockfile',
  'pnpm infra:config:example',
  'pnpm ci:validate',
  'pnpm db:format',
  'git diff --exit-code -- apps/api/prisma/schema.prisma',
  'pnpm db:validate',
  'pnpm db:generate',
  'pnpm format:check',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'pnpm build',
  'pnpm exec playwright install --with-deps chromium',
  'pnpm test:e2e:homepage',
  'path: playwright-report/',
  'pnpm infra:smoke',
  'if: always()',
];

for (const fragment of requiredFragments) {
  assert(workflow.includes(fragment), `CI workflow is missing required fragment: ${fragment}`);
}

assert.equal(packageManifest.packageManager, 'pnpm@10.34.5');
assert.equal(packageManifest.engines.node, '>=22.12.0 <23');
assert.equal(packageManifest.engines.pnpm, '10.34.5');

const actionReferences = [...workflow.matchAll(/uses:\s+([^@\s]+)@([^\s#]+)/g)];
assert(actionReferences.length >= 3, 'CI must use pinned setup actions.');
for (const [, action, revision] of actionReferences) {
  assert.match(revision, /^[0-9a-f]{40}$/, `${action} must be pinned to a commit SHA.`);
}

for (const action of [
  'actions/checkout',
  'actions/setup-node',
  'pnpm/action-setup',
  'actions/upload-artifact',
]) {
  assert(
    actionReferences.some((reference) => reference[1] === action),
    `CI is missing ${action}.`,
  );
}

assert.doesNotMatch(workflow, /postgres(?:ql)?:\/\//i, 'CI must not embed database URLs.');
assert.doesNotMatch(
  workflow,
  /POSTGRES_PASSWORD\s*:/i,
  'CI must not embed PostgreSQL credentials.',
);

assert.doesNotMatch(
  workflow,
  /^\s*(push|pull_request):/m,
  'Automatic CI triggers must remain temporarily disabled.',
);

console.log('CI workflow validation passed.');

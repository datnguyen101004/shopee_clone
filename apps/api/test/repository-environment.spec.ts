import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';

const variableName = 'T04_REPOSITORY_ENV_TEST';
const temporaryRoots: string[] = [];

function createTemporaryRepository(): string {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), 'shopee-clone-t04-'));
  temporaryRoots.push(repositoryRoot);
  mkdirSync(path.join(repositoryRoot, 'apps', 'api'), { recursive: true });
  writeFileSync(path.join(repositoryRoot, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
  return repositoryRoot;
}

afterEach(() => {
  delete process.env[variableName];
  for (const repositoryRoot of temporaryRoots.splice(0)) {
    if (!path.basename(repositoryRoot).startsWith('shopee-clone-t04-')) {
      throw new Error('Refusing to clean an unexpected environment test directory.');
    }
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

it('loads the ignored root environment from an API working directory', () => {
  const repositoryRoot = createTemporaryRepository();
  writeFileSync(path.join(repositoryRoot, '.env'), `${variableName}=from-root\n`);

  loadRepositoryEnvironment(path.join(repositoryRoot, 'apps', 'api'));

  expect(process.env[variableName]).toBe('from-root');
});

it('gives an application environment file priority over the root file', () => {
  const repositoryRoot = createTemporaryRepository();
  writeFileSync(path.join(repositoryRoot, '.env'), `${variableName}=from-root\n`);
  writeFileSync(path.join(repositoryRoot, 'apps', 'api', '.env'), `${variableName}=from-api\n`);

  loadRepositoryEnvironment(path.join(repositoryRoot, 'apps', 'api'));

  expect(process.env[variableName]).toBe('from-api');
});

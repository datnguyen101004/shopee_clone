import { existsSync } from 'node:fs';
import path from 'node:path';

import { config } from 'dotenv';

function findRepositoryRoot(startDirectory: string): string {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    if (existsSync(path.join(currentDirectory, 'pnpm-workspace.yaml'))) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      throw new Error('Could not locate the repository root for environment configuration.');
    }
    currentDirectory = parentDirectory;
  }
}

export function loadRepositoryEnvironment(startDirectory = process.cwd()): void {
  const repositoryRoot = findRepositoryRoot(startDirectory);
  config({
    path: [path.join(repositoryRoot, 'apps', 'api', '.env'), path.join(repositoryRoot, '.env')],
    quiet: true,
  });
}

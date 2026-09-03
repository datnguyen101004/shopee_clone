import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createPrismaClient } from './create-prisma-client';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';

loadRepositoryEnvironment();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to verify migration checksums.');

const prisma = createPrismaClient(databaseUrl);
async function main(): Promise<void> {
  try {
    const migrationsDirectory = path.resolve('prisma/migrations');
    const migrationNames = (await readdir(migrationsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const applied = await prisma.$queryRaw<
      Array<{
        migration_name: string;
        checksum: string;
        finished_at: Date | null;
        rolled_back_at: Date | null;
      }>
    >`
    SELECT migration_name, checksum, finished_at, rolled_back_at
    FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name ASC
  `;
    const mismatches: string[] = [];
    for (const row of applied) {
      if (!migrationNames.includes(row.migration_name)) {
        mismatches.push(`${row.migration_name}:missing-from-repository`);
        continue;
      }
      const migration = await readFile(
        path.join(migrationsDirectory, row.migration_name, 'migration.sql'),
      );
      const expected = createHash('sha256').update(migration).digest('hex');
      if (expected.toLowerCase() !== row.checksum.toLowerCase())
        mismatches.push(`${row.migration_name}:checksum-mismatch`);
    }
    if (mismatches.length > 0)
      throw new Error(`Migration checksum verification failed: ${mismatches.join(', ')}`);
    process.stdout.write(
      `Migration checksum verification passed for ${applied.length} applied migrations.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

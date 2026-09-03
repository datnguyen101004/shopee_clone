import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { createPrismaClient } from './create-prisma-client';
import { importCanonicalDataset } from './dataset/importer';

loadRepositoryEnvironment();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required to import the canonical dataset.');

const prisma = createPrismaClient(databaseUrl);

importCanonicalDataset(prisma)
  .then((summary) => console.log(JSON.stringify({ canonicalDatasetImport: summary })))
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Unknown canonical dataset import error.',
    );
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

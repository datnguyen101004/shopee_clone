import { NestFactory } from '@nestjs/core';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { SearchModule } from '../src/search/search.module';
import { ProductSearchIndexingService } from '../src/search/product-search-indexing.service';

loadRepositoryEnvironment();

const targetIndex = process.argv[2];

async function main(): Promise<void> {
  if (!targetIndex) throw new Error('Usage: pnpm search:rollback -- <physical-index-name>');
  const app = await NestFactory.createApplicationContext(SearchModule, {
    logger: ['error', 'warn'],
  });
  try {
    await app.get(ProductSearchIndexingService).rollbackTo(targetIndex);
    console.log(JSON.stringify({ rolledBackTo: targetIndex }));
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Search rollback failed.');
  process.exitCode = 1;
});

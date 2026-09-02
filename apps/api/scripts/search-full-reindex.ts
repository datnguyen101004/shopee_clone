import { NestFactory } from '@nestjs/core';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { SearchModule } from '../src/search/search.module';
import { ProductSearchIndexingService } from '../src/search/product-search-indexing.service';

loadRepositoryEnvironment();

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SearchModule, {
    logger: ['error', 'warn'],
  });
  try {
    const indexing = app.get(ProductSearchIndexingService);
    const result = await indexing.fullReindex();
    console.log(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Search reindex failed.');
  process.exitCode = 1;
});

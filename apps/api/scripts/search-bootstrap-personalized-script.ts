import { NestFactory } from '@nestjs/core';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { SearchModule } from '../src/search/search.module';
import { PERSONALIZED_RANKING_SCRIPT } from '../src/search/personalized-ranking-script';
import { SearchElasticsearchAdapter } from '../src/search/search-elasticsearch.adapter';

loadRepositoryEnvironment();

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SearchModule, {
    logger: ['error', 'warn'],
  });
  try {
    await app.get(SearchElasticsearchAdapter).bootstrapStoredScript(PERSONALIZED_RANKING_SCRIPT);
    console.log(
      JSON.stringify({
        scriptId: PERSONALIZED_RANKING_SCRIPT.id,
        scriptVersion: PERSONALIZED_RANKING_SCRIPT.version,
        status: 'bootstrapped',
      }),
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Personalized ranking script bootstrap failed.',
  );
  process.exitCode = 1;
});

import { NestFactory } from '@nestjs/core';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { AppModule } from '../src/app.module';
import { ClickstreamDispatcher } from '../src/clickstream/clickstream.dispatcher';

loadRepositoryEnvironment();
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    console.log(JSON.stringify(await app.get(ClickstreamDispatcher).flush()));
  } finally {
    await app.close();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Clickstream dispatch failed.');
  process.exitCode = 1;
});

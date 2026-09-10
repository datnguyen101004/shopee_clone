import { NestFactory } from '@nestjs/core';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { AppModule } from '../src/app.module';
import { ClickstreamDispatcher } from '../src/clickstream/clickstream.dispatcher';

loadRepositoryEnvironment();
function option(name: string, fallback?: string): string | undefined {
  const value = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  return value ?? fallback;
}
async function main(): Promise<void> {
  const status = option('status');
  const ageSeconds = Number(option('age-seconds', '86400'));
  const limit = Number(option('limit', '100'));
  if (status !== 'TERMINAL' && status !== 'DROPPED')
    throw new Error('Replay status must be TERMINAL or DROPPED');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    console.log(
      JSON.stringify(await app.get(ClickstreamDispatcher).replay(status, ageSeconds, limit)),
    );
  } finally {
    await app.close();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Clickstream replay failed.');
  process.exitCode = 1;
});

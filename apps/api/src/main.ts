import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { loadRepositoryEnvironment } from './config/repository-environment';

loadRepositoryEnvironment();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();

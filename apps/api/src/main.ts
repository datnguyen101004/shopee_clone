import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { loadAuthConfig } from './auth/auth.config';
import { loadRepositoryEnvironment } from './config/repository-environment';
import { configureApplication } from './configure-application';

loadRepositoryEnvironment();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApplication(app, loadAuthConfig());

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();

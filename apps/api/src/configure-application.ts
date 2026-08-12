import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import type { AuthConfig } from './auth/auth.config';

export function configureApplication(app: INestApplication, config: AuthConfig): void {
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.getHttpAdapter().getInstance().set('trust proxy', config.trustProxy);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    }),
  );
  app.enableCors({
    credentials: true,
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      callback(null, origin === undefined || config.allowedOrigins.includes(origin));
    },
  });

  const swagger = new DocumentBuilder()
    .setTitle('Shopee Clone API')
    .setDescription('Marketplace API contracts')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('sc_refresh', undefined, 'sc_refresh')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));
}

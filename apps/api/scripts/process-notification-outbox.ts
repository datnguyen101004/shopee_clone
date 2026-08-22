import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { NotificationService } from '../src/notifications/notification.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const processed = await app.get(NotificationService).processOutbox(100);
    console.log(JSON.stringify({ operation: 'notification-outbox', processed }));
  } finally {
    await app.close();
  }
}

void main();

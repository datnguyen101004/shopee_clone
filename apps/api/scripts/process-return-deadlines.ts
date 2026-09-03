import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { ReturnService } from '../src/returns/return.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const processed = await app.get(ReturnService).processDeadlines(100);
    console.log(JSON.stringify({ operation: 'return-deadlines', processed }));
  } finally {
    await app.close();
  }
}
void main();

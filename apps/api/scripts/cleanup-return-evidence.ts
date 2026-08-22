import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { ReturnEvidenceStorage } from '../src/returns/return-evidence.storage';
import { ReturnService } from '../src/returns/return.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const service = app.get(ReturnService);
    const processed = await service.cleanupExpiredEvidence(app.get(ReturnEvidenceStorage), 100);
    console.log(JSON.stringify({ operation: 'return-evidence-cleanup', processed }));
  } finally {
    await app.close();
  }
}
void main();

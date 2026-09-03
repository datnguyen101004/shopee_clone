import { NestFactory } from '@nestjs/core';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { RecommendationsModule } from '../src/recommendations/recommendations.module';
import { BuyerProfileService } from '../src/recommendations/buyer-profile.service';

loadRepositoryEnvironment();

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(RecommendationsModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(BuyerProfileService);
    const profiles = await service.buildForActiveUsers();
    console.log(
      JSON.stringify({
        profileCount: profiles.length,
        eligibleCount: profiles.filter((profile) => profile.eligible).length,
        featureSchemaVersion: profiles[0]?.featureSchemaVersion ?? null,
        generatedAt: profiles[0]?.generatedAt.toISOString() ?? null,
      }),
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Buyer profile generation failed.');
  process.exitCode = 1;
});

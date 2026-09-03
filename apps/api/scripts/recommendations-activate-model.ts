import { NestFactory } from '@nestjs/core';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { RecommendationsModule } from '../src/recommendations/recommendations.module';
import { RecommendationModelRepository } from '../src/recommendations/recommendation-model.repository';

loadRepositoryEnvironment();

function modelVersionArgument(): number {
  const value = Number(process.argv[2]);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('Usage: recommendations:activate <positive-model-version>.');
  }
  return value;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(RecommendationsModule, {
    logger: ['error', 'warn'],
  });
  try {
    const model = await app
      .get(RecommendationModelRepository)
      .activateCompatible(modelVersionArgument());
    console.log(
      JSON.stringify({
        modelVersion: model.modelVersion,
        activationStatus: model.activationStatus,
        activatedAt: model.activatedAt?.toISOString() ?? null,
      }),
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Recommendation model activation failed.');
  process.exitCode = 1;
});

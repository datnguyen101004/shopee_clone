import { NestFactory } from '@nestjs/core';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { RecommendationsModule } from '../src/recommendations/recommendations.module';
import { readSeededTrainingExamples } from '../src/recommendations/recommendation-dataset';
import { RecommendationModelRepository } from '../src/recommendations/recommendation-model.repository';
import { RECOMMENDATION_RANDOM_SEED } from '../src/recommendations/recommendation.types';
import { trainLogisticRegression } from '../src/recommendations/logistic-regression';

loadRepositoryEnvironment();

async function main(): Promise<void> {
  const examples = await readSeededTrainingExamples();
  if (examples.some((example) => example.randomSeed !== RECOMMENDATION_RANDOM_SEED)) {
    throw new Error(`Training dataset must use random seed ${RECOMMENDATION_RANDOM_SEED}.`);
  }
  const model = trainLogisticRegression(examples);
  const app = await NestFactory.createApplicationContext(RecommendationsModule, {
    logger: ['error', 'warn'],
  });
  try {
    const persisted = await app.get(RecommendationModelRepository).upsertCandidate(model);
    console.log(
      JSON.stringify({
        modelVersion: persisted.modelVersion,
        activationStatus: persisted.activationStatus,
        intercept: model.intercept,
        featureWeights: model.featureWeights,
        metrics: model.metrics,
        trainedAt: model.trainedAt.toISOString(),
      }),
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Recommendation model training failed.');
  process.exitCode = 1;
});

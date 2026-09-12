import { S3Client } from '@aws-sdk/client-s3';
import { NestFactory } from '@nestjs/core';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { RecommendationsModule } from '../src/recommendations/recommendations.module';
import {
  parseTrainingDatasetManifestS3Uri,
  readClickstreamTrainingExamplesFromS3,
  readSeededTrainingExamples,
  readTrainingDatasetManifestFromS3,
} from '../src/recommendations/recommendation-dataset';
import { RecommendationModelRepository } from '../src/recommendations/recommendation-model.repository';
import {
  CLICKSTREAM_TRAINING_SOURCE,
  CLICKSTREAM_SNAPSHOT_TRAINING_SOURCE,
  CURRENT_RECOMMENDATION_VERSIONS,
  RECOMMENDATION_RANDOM_SEED,
  SEEDED_TRAINING_SOURCE,
  type BuyerPairFeatureName,
  type SeededTrainingExample,
  type TrainedRankingModel,
} from '../src/recommendations/recommendation.types';
import { trainLogisticRegression } from '../src/recommendations/logistic-regression';

loadRepositoryEnvironment();

export type TrainingMode = 'daily' | 'full';

export interface TrainingInputSource {
  examples: readonly SeededTrainingExample[];
  trainingSource: string;
  trainingDatasetUri?: string;
  trainingManifestUri?: string;
  trainingMode?: TrainingMode;
  trainingInputUris?: readonly string[];
}

export interface RecommendationTrainingOptions {
  mode?: TrainingMode;
  consumedUris?: readonly string[];
  client?: S3Client;
}

function selectedMode(value: string | undefined): TrainingMode {
  if (!value || value === 'daily') return 'daily';
  if (value === 'full') return 'full';
  throw new Error(`Recommendation training mode must be daily or full, received ${value}.`);
}

/** Read the fixed manifest handoff or the committed seeded fixture. */
export async function readRecommendationTrainingExamples(
  options: RecommendationTrainingOptions = {},
): Promise<TrainingInputSource> {
  const manifestUri = process.env.RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI?.trim();
  if (!manifestUri) {
    return { examples: await readSeededTrainingExamples(), trainingSource: SEEDED_TRAINING_SOURCE };
  }
  const mode = options.mode ?? 'daily';
  const client = options.client ?? new S3Client({});
  const location = parseTrainingDatasetManifestS3Uri(manifestUri);
  const manifest = await readTrainingDatasetManifestFromS3(location.uri, client);
  const consumed = new Set(options.consumedUris ?? []);
  const inputUris = mode === 'full'
    ? [...manifest.uris]
    : (manifest.uris[0] && !consumed.has(manifest.uris[0]) ? [manifest.uris[0]] : []);
  if (inputUris.length === 0) {
    throw new Error('No unconsumed daily recommendation training URI is available. Use --mode=full to refresh the window.');
  }
  const batches = await Promise.all(inputUris.map((uri) => readClickstreamTrainingExamplesFromS3(uri, client)));
  const examples = batches.flat();
  return {
    examples,
    trainingSource: examples.some((example) => example.featureVectorSource === 'snapshot-backed')
      ? CLICKSTREAM_SNAPSHOT_TRAINING_SOURCE
      : CLICKSTREAM_TRAINING_SOURCE,
    trainingDatasetUri: inputUris[0],
    trainingManifestUri: location.uri,
    trainingMode: mode,
    trainingInputUris: inputUris,
  };
}

interface BaseModelInput {
  modelVersion: number;
  intercept: number;
  featureWeights: unknown;
  trainingDatasetUri?: string | null;
  metrics?: unknown;
}

function baseFeatureWeights(value: unknown): Partial<Record<BuyerPairFeatureName, number>> {
  if (!Array.isArray(value)) return {};
  const result: Partial<Record<BuyerPairFeatureName, number>> = {};
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as { name?: unknown; weight?: unknown };
    if (typeof candidate.name !== 'string' || !Number.isFinite(candidate.weight)) continue;
    result[candidate.name as BuyerPairFeatureName] = Number(candidate.weight);
  }
  return result;
}

function baseTrainingInputs(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const metrics = value as { trainingInputUris?: unknown; trainingDatasetUri?: unknown };
  if (Array.isArray(metrics.trainingInputUris)) {
    return metrics.trainingInputUris.filter((uri): uri is string => typeof uri === 'string');
  }
  return typeof metrics.trainingDatasetUri === 'string' ? [metrics.trainingDatasetUri] : [];
}

export async function trainRecommendationModel(options: {
  mode?: TrainingMode;
  consumedUris?: readonly string[];
  client?: S3Client;
  baseModel?: BaseModelInput;
  modelVersion?: number;
} = {}): Promise<{ model: TrainedRankingModel; trainingDatasetUri?: string; trainingInputUris?: readonly string[] }> {
  const source = await readRecommendationTrainingExamples(options);
  if (source.examples.some((example) => example.randomSeed !== RECOMMENDATION_RANDOM_SEED)) {
    throw new Error(`Training dataset must use random seed ${RECOMMENDATION_RANDOM_SEED}.`);
  }
  const base = source.trainingMode === 'daily' ? options.baseModel : undefined;
  const model = trainLogisticRegression(source.examples, {
    trainingSource: source.trainingSource,
    trainingDatasetUri: source.trainingDatasetUri,
    trainingManifestUri: source.trainingManifestUri,
    trainingMode: source.trainingMode,
    trainingInputUris: source.trainingInputUris,
    modelVersion: options.modelVersion,
    initialIntercept: base ? Number(base.intercept) : undefined,
    initialFeatureWeights: base ? baseFeatureWeights(base.featureWeights) : undefined,
    baseModelVersion: base?.modelVersion,
    baseModelTrainingDatasetUri: base?.trainingDatasetUri ?? undefined,
  });
  return { model, trainingDatasetUri: source.trainingDatasetUri, trainingInputUris: source.trainingInputUris };
}

function commandMode(): TrainingMode {
  const modeArgument = process.argv.find((argument) => argument.startsWith('--mode='));
  return selectedMode(modeArgument?.slice('--mode='.length));
}

async function main(): Promise<void> {
  const mode = commandMode();
  const app = await NestFactory.createApplicationContext(RecommendationsModule, { logger: ['error', 'warn'] });
  try {
    const repository = app.get(RecommendationModelRepository);
    const base = await repository.findLatestCompatible();
    const manifestConfigured = Boolean(process.env.RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI?.trim());
    const consumedUris = base ? baseTrainingInputs(base.metrics) : [];
    const modelVersion = manifestConfigured
      ? Math.max(CURRENT_RECOMMENDATION_VERSIONS.modelVersion, (base?.modelVersion ?? 0) + 1)
      : CURRENT_RECOMMENDATION_VERSIONS.modelVersion;
    const result = await trainRecommendationModel({
      mode,
      consumedUris,
      baseModel: base ? {
        modelVersion: base.modelVersion,
        intercept: base.intercept,
        featureWeights: base.featureWeights,
        trainingDatasetUri: baseTrainingInputs(base.metrics)[0],
      } : undefined,
      modelVersion,
    });
    const persisted = await repository.upsertCandidate(result.model);
    console.log(JSON.stringify({
      modelVersion: persisted.modelVersion,
      activationStatus: persisted.activationStatus,
      trainingSource: result.model.trainingSource,
      trainingDatasetUri: result.trainingDatasetUri,
      trainingInputUris: result.trainingInputUris,
      trainingMode: result.model.metrics.trainingMode,
      baseModelVersion: result.model.metrics.baseModelVersion,
      candidateOnly: true,
      intercept: result.model.intercept,
      featureWeights: result.model.featureWeights,
      metrics: result.model.metrics,
      trainedAt: result.model.trainedAt.toISOString(),
    }));
  } finally {
    await app.close();
  }
}

if (process.argv[1]?.endsWith('recommendations-train-model.ts') || process.argv[1]?.endsWith('recommendations-train-model.js')) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Recommendation model training failed.');
    process.exitCode = 1;
  });
}

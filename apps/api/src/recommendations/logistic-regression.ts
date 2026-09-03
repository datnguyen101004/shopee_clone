import {
  BUYER_PAIR_FEATURE_NAMES,
  CURRENT_RECOMMENDATION_VERSIONS,
  RECOMMENDATION_DATASET_VERSION,
  RECOMMENDATION_RANDOM_SEED,
  type BuyerPairFeatureName,
  type SeededTrainingExample,
  type TrainedRankingModel,
} from './recommendation.types';
import { deterministicPartition } from './recommendation-dataset';

const EPSILON = 1e-12;
const ITERATIONS = 600;
const LEARNING_RATE = 0.08;
const L2 = 0.001;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : 0));
}

export function normalizePairFeature(name: BuyerPairFeatureName, value: number): number {
  switch (name) {
    case 'category_affinity':
    case 'shop_affinity':
    case 'favorite_flag':
    case 'followed_shop_flag':
    case 'price_band_match':
    case 'promotion_active':
    case 'freshness_score':
    case 'text_relevance':
    case 'inventory_available':
      return clamp(value);
    case 'view_count_30d':
      return clamp(value / 20);
    case 'order_count_90d':
      return clamp(value / 10);
    case 'preferred_price_distance':
      return 1 - clamp(value);
    case 'rating_average_basis_points':
      return clamp(value / 500);
    case 'rating_confidence':
      return clamp(value);
    case 'sold_count_log1p':
      return clamp(value / 12);
    case 'profile_score':
      return clamp(value / 100);
  }
}

function vector(example: SeededTrainingExample): readonly number[] {
  return BUYER_PAIR_FEATURE_NAMES.map((name) => normalizePairFeature(name, example.features[name]));
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exponent = Math.exp(-Math.min(value, 700));
    return 1 / (1 + exponent);
  }
  const exponent = Math.exp(Math.max(value, -700));
  return exponent / (1 + exponent);
}

function score(intercept: number, weights: readonly number[], features: readonly number[]): number {
  let result = intercept;
  for (let index = 0; index < weights.length; index += 1) {
    result += (weights[index] ?? 0) * (features[index] ?? 0);
  }
  return sigmoid(result);
}

function logLoss(labels: readonly number[], predictions: readonly number[]): number {
  if (labels.length === 0) return 0;
  return (
    labels.reduce((total, label, index) => {
      const prediction = predictions[index] ?? 0.5;
      return (
        total -
        label * Math.log(Math.max(EPSILON, prediction)) -
        (1 - label) * Math.log(Math.max(EPSILON, 1 - prediction))
      );
    }, 0) / labels.length
  );
}

function auc(labels: readonly number[], predictions: readonly number[]): number {
  const positives = predictions.filter((_, index) => labels[index] === 1);
  const negatives = predictions.filter((_, index) => labels[index] === 0);
  if (positives.length === 0 || negatives.length === 0) return 0.5;
  let wins = 0;
  for (const positive of positives) {
    for (const negative of negatives) {
      if (positive > negative) wins += 1;
      else if (positive === negative) wins += 0.5;
    }
  }
  return wins / (positives.length * negatives.length);
}

function dcg(labels: readonly number[]): number {
  return labels.reduce((total, label, index) => total + (2 ** label - 1) / Math.log2(index + 2), 0);
}

function rankingMetrics(
  examples: readonly SeededTrainingExample[],
  predictions: readonly number[],
): { ndcgAt10: number; mrr: number } {
  const byUser = new Map<string, Array<{ label: number; prediction: number; productId: string }>>();
  examples.forEach((example, index) => {
    const rows = byUser.get(example.userId) ?? [];
    rows.push({
      label: example.label,
      prediction: predictions[index] ?? 0.5,
      productId: example.productId,
    });
    byUser.set(example.userId, rows);
  });
  let ndcgTotal = 0;
  let mrrTotal = 0;
  let groups = 0;
  for (const rows of byUser.values()) {
    const sorted = [...rows].sort(
      (left, right) =>
        right.prediction - left.prediction || left.productId.localeCompare(right.productId),
    );
    const actual = [...rows].sort(
      (left, right) => right.label - left.label || left.productId.localeCompare(right.productId),
    );
    const predictedTop = sorted.slice(0, 10).map((row) => row.label);
    const idealTop = actual.slice(0, 10).map((row) => row.label);
    const idealDcg = dcg(idealTop);
    if (idealDcg <= 0) continue;
    ndcgTotal += dcg(predictedTop) / idealDcg;
    const firstRelevant = sorted.findIndex((row) => row.label > 0);
    if (firstRelevant >= 0) mrrTotal += 1 / (firstRelevant + 1);
    groups += 1;
  }
  return {
    ndcgAt10: groups === 0 ? 0 : ndcgTotal / groups,
    mrr: groups === 0 ? 0 : mrrTotal / groups,
  };
}

export function trainLogisticRegression(
  examples: readonly SeededTrainingExample[],
  options: {
    trainedAt?: Date;
    trainingSource?: string;
    iterations?: number;
    learningRate?: number;
  } = {},
): TrainedRankingModel {
  const sorted = [...examples].sort((left, right) => left.exampleId.localeCompare(right.exampleId));
  const partition = deterministicPartition(
    sorted,
    sorted[0]?.randomSeed ?? RECOMMENDATION_RANDOM_SEED,
  );
  const train = [...partition.train];
  const heldout = [...partition.heldout];
  if (train.length === 0 || heldout.length === 0) {
    throw new Error('Training requires deterministic train and held-out partitions.');
  }

  const weights = new Array<number>(BUYER_PAIR_FEATURE_NAMES.length).fill(0);
  let intercept = 0;
  const iterations = options.iterations ?? ITERATIONS;
  const learningRate = options.learningRate ?? LEARNING_RATE;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradient = new Array<number>(weights.length).fill(0);
    let interceptGradient = 0;
    for (const example of train) {
      const features = vector(example);
      const prediction = score(intercept, weights, features);
      const error = (prediction - example.label) * Math.max(0, example.sampleWeight);
      interceptGradient += error;
      for (let index = 0; index < weights.length; index += 1) {
        gradient[index] = (gradient[index] ?? 0) + error * (features[index] ?? 0);
      }
    }
    const scale = 1 / Math.max(1, train.length);
    intercept -= learningRate * interceptGradient * scale;
    for (let index = 0; index < weights.length; index += 1) {
      const currentWeight = weights[index] ?? 0;
      weights[index] = Math.max(
        -20,
        Math.min(
          20,
          currentWeight - learningRate * ((gradient[index] ?? 0) * scale + L2 * currentWeight),
        ),
      );
    }
  }

  const heldoutPredictions = heldout.map((example) => score(intercept, weights, vector(example)));
  const labels = heldout.map((example) => example.label);
  const metrics = rankingMetrics(heldout, heldoutPredictions);
  const heldoutPositiveCount = labels.filter((label) => label === 1).length;
  const trainingSource = options.trainingSource ?? 'seeded-fixture';
  const demonstrationOnly =
    trainingSource !== 'production-impressions' || heldoutPositiveCount < 200;
  const trainedAt = options.trainedAt
    ? new Date(options.trainedAt)
    : new Date(Math.max(...sorted.map((example) => example.impressionAt.getTime())));

  return {
    modelVersion: CURRENT_RECOMMENDATION_VERSIONS.modelVersion,
    productProjectionVersion: CURRENT_RECOMMENDATION_VERSIONS.productProjectionVersion,
    featureSchemaVersion: CURRENT_RECOMMENDATION_VERSIONS.featureSchemaVersion,
    storedScriptVersion: CURRENT_RECOMMENDATION_VERSIONS.storedScriptVersion,
    datasetVersion: sorted[0]?.datasetVersion ?? RECOMMENDATION_DATASET_VERSION,
    randomSeed: sorted[0]?.randomSeed ?? RECOMMENDATION_RANDOM_SEED,
    trainingSource,
    intercept,
    featureWeights: BUYER_PAIR_FEATURE_NAMES.map((name, index) => ({
      name,
      weight: weights[index] ?? 0,
    })),
    metrics: {
      auc: auc(labels, heldoutPredictions),
      logLoss: logLoss(labels, heldoutPredictions),
      ndcgAt10: metrics.ndcgAt10,
      mrr: metrics.mrr,
      trainCount: train.length,
      heldoutCount: heldout.length,
      heldoutPositiveCount,
      demonstrationOnly,
      metricsLabel: demonstrationOnly ? 'demonstration-only' : 'production-candidate',
    },
    trainedAt,
  };
}

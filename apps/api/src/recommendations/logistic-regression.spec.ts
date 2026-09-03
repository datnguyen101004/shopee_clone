import {
  BUYER_PAIR_FEATURE_NAMES,
  type BuyerPairFeatureName,
  type SeededTrainingExample,
} from './recommendation.types';
import { trainLogisticRegression } from './logistic-regression';

function example(index: number): SeededTrainingExample {
  const features = Object.fromEntries(
    BUYER_PAIR_FEATURE_NAMES.map((name: BuyerPairFeatureName, featureIndex) => [
      name,
      featureIndex < 3 ? (index % 2 === 0 ? 1 : 0) : 0.5,
    ]),
  ) as Record<BuyerPairFeatureName, number>;
  return {
    exampleId: `example-${String(index).padStart(3, '0')}`,
    datasetVersion: 'mock-reco-v1',
    randomSeed: 20260902,
    modelVersion: 1,
    featureSchemaVersion: 1,
    split: index % 5 === 0 ? 'heldout' : 'train',
    fold: index % 5,
    userId: `buyer-${index % 2}`,
    productId: `product-${index}`,
    categoryId: 'category-1',
    shopId: 'shop-1',
    impressionAt: new Date(`2026-06-${String((index % 9) + 1).padStart(2, '0')}T00:00:00.000Z`),
    label: index % 2 === 0 ? 1 : 0,
    labelSource: 'test',
    features,
    sampleWeight: 1,
  };
}

describe('logistic regression recommendation training', () => {
  it('is deterministic and preserves ordered feature weights', () => {
    const examples = Array.from({ length: 40 }, (_, index) => example(index));
    const options = { trainedAt: new Date('2026-09-03T00:00:00.000Z'), iterations: 20 };
    const first = trainLogisticRegression(examples, options);
    const second = trainLogisticRegression(examples, options);
    expect(first).toEqual(second);
    expect(first.featureWeights.map((entry) => entry.name)).toEqual([...BUYER_PAIR_FEATURE_NAMES]);
    expect(first.metrics.heldoutPositiveCount).toBe(4);
    expect(first.metrics.demonstrationOnly).toBe(true);
    expect(first.metrics.metricsLabel).toBe('demonstration-only');
    expect(first.metrics.auc).toBeGreaterThanOrEqual(0);
    expect(first.metrics.auc).toBeLessThanOrEqual(1);
    expect(first.metrics.logLoss).toBeGreaterThan(0);
  });
});

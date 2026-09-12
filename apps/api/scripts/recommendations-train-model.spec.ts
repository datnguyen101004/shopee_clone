import type { GetObjectCommand } from '@aws-sdk/client-s3';

import { CLICKSTREAM_TRAINING_HEADERS } from '../src/recommendations/recommendation-dataset';
import { BUYER_PAIR_FEATURE_NAMES } from '../src/recommendations/recommendation.types';
import { readRecommendationTrainingExamples, trainRecommendationModel } from './recommendations-train-model';

const latest = 's3://processed/exports/training/run_date=2026-09-12/training.csv';
const older = 's3://processed/exports/training/run_date=2026-09-11/training.csv';

function row(id: string, label: string, runDate = '2026-09-12'): string {
  return [id, `${runDate}T00:00:00.000Z`, `session-${id}`, `buyer-${id}`, 'shop', `product-${id}`, 'search', 'grid', '1', 'request', '', '1', '1', '1', '1', label, runDate, runDate].join(',');
}

function csv(id: string, label: string, runDate = '2026-09-12'): string {
  return `${CLICKSTREAM_TRAINING_HEADERS.join(',')}\n${row(id, label, runDate)}\n${row(`${id}-second`, label === '1' ? '0' : '1', runDate)}\n`;
}

function fakeClient() {
  const send = jest.fn(async (command: GetObjectCommand) => {
    const key = command.input.Key;
    if (key === 'exports/training/latest.json') {
      return { Body: { transformToString: async () => JSON.stringify({ manifestVersion: 1, dataset: 'recommendation-training', uris: [latest, older] }) } } as never;
    }
    const old = key?.includes('2026-09-11');
    return { Body: { transformToString: async () => csv(old ? 'old' : 'new', '1', old ? '2026-09-11' : '2026-09-12') } } as never;
  });
  return { send, client: { send } as never };
}

describe('recommendations train manifest modes', () => {
  const oldManifest = process.env.RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI;
  afterEach(() => {
    if (oldManifest === undefined) delete process.env.RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI;
    else process.env.RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI = oldManifest;
  });

  it('daily reads only the newest unconsumed URI and never falls back to an older day', async () => {
    process.env.RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI = 's3://processed/exports/training/latest.json';
    const first = fakeClient();
    const source = await readRecommendationTrainingExamples({ client: first.client });
    expect(source.trainingInputUris).toEqual([latest]);
    expect(first.send.mock.calls.map(([command]) => (command as GetObjectCommand).input.Key)).toEqual([
      'exports/training/latest.json',
      'exports/training/run_date=2026-09-12/training.csv',
    ]);
    const second = fakeClient();
    await expect(readRecommendationTrainingExamples({ client: second.client, consumedUris: [latest] })).rejects.toThrow(/No unconsumed/);
    expect(second.send).toHaveBeenCalledTimes(1);
  });

  it('full mode reads the capped window and daily training records warm-start metadata', async () => {
    process.env.RECOMMENDATION_TRAINING_DATASET_MANIFEST_S3_URI = 's3://processed/exports/training/latest.json';
    const full = fakeClient();
    const all = await readRecommendationTrainingExamples({ mode: 'full', client: full.client });
    expect(all.trainingInputUris).toEqual([latest, older]);
    expect(all.examples).toHaveLength(4);
    const daily = fakeClient();
    const baseWeights = Object.fromEntries(BUYER_PAIR_FEATURE_NAMES.map((name) => [name, 0]));
    const result = await trainRecommendationModel({
      mode: 'daily', client: daily.client, modelVersion: 2,
      baseModel: { modelVersion: 1, intercept: 0.25, featureWeights: BUYER_PAIR_FEATURE_NAMES.map((name) => ({ name, weight: baseWeights[name] })) },
    });
    expect(result.model.modelVersion).toBe(2);
    expect(result.model.metrics.trainingMode).toBe('daily');
    expect(result.model.metrics.baseModelVersion).toBe(1);
    expect(result.model.metrics.trainingInputUris).toEqual([latest]);
  });
});

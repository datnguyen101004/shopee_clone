import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import {
  CLICKSTREAM_TRAINING_HEADERS,
  SNAPSHOT_TRAINING_HEADERS,
  parseClickstreamTrainingExamples,
  parseSnapshotTrainingExamples,
  parseTrainingDatasetS3Uri,
  parseTrainingDatasetManifest,
  readTrainingDatasetManifestFromS3,
  readClickstreamTrainingExamplesFromS3,
  deterministicPartition,
} from './recommendation-dataset';
import { trainLogisticRegression } from './logistic-regression';
import {
  BUYER_PAIR_FEATURE_NAMES,
  CLICKSTREAM_TRAINING_SOURCE,
  CLICKSTREAM_SNAPSHOT_TRAINING_SOURCE,
} from './recommendation.types';

const uri = 's3://processed-example/exports/training/run_date=2026-09-12/training.csv';

function csv(rows: readonly string[][]): string {
  return [CLICKSTREAM_TRAINING_HEADERS.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

function row(impressionId: string, buyerPseudonym: string, labelClicked: string): string[] {
  return [
    impressionId,
    '2026-09-12T02:03:04.000Z',
    `session-${impressionId}`,
    buyerPseudonym,
    'shop-1',
    `product-${impressionId}`,
    'CATALOG',
    'search-grid',
    '0',
    'request-1',
    '',
    '1',
    '',
    '',
    '',
    labelClicked,
    '2026-09-12',
    '2026-09-12',
  ];
}

describe('S3 clickstream recommendation training handoff', () => {
  afterEach(() => jest.restoreAllMocks());

  it('accepts the exact versioned object shape and maps rows with zero online features', () => {
    const examples = parseClickstreamTrainingExamples(
      csv([row('impression-1', 'buyer-1', '1'), row('impression-2', '', '0')]),
      '2026-09-12',
    );

    expect(examples.map((example) => example.userId)).toEqual(['buyer-1', 'session-impression-2']);
    expect(examples.map((example) => example.exampleId)).toEqual(['impression-1', 'impression-2']);
    expect(examples.map((example) => example.label)).toEqual([1, 0]);
    expect(
      examples.every((example) => example.datasetVersion === 'clickstream-training-v1-2026-09-12'),
    ).toBe(true);
    expect(examples.every((example) => example.sourceDate === '2026-09-12')).toBe(true);
    expect(examples.every((example) => example.runDate === '2026-09-12')).toBe(true);
    expect(
      examples.every((example) =>
        BUYER_PAIR_FEATURE_NAMES.every((name) => example.features[name] === 0),
      ),
    ).toBe(true);
    const partition = deterministicPartition(examples);
    expect(partition.train.length).toBeGreaterThan(0);
    expect(partition.heldout.length).toBeGreaterThan(0);
  });

  it('retrieves one exact S3 bucket/key through GetObject and no listing', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: {
        transformToString: async () =>
          csv([row('impression-1', 'buyer-1', '1'), row('impression-2', '', '0')]),
      },
    } as never);

    const examples = await readClickstreamTrainingExamplesFromS3(uri);
    expect(examples).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0] as GetObjectCommand;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'processed-example',
      Key: 'exports/training/run_date=2026-09-12/training.csv',
    });
  });

  it('accepts only the fixed manifest and caps its exact daily URI contract', async () => {
    const latest = 's3://processed-example/exports/training/run_date=2026-09-12/training.csv';
    const previous = 's3://processed-example/exports/training/run_date=2026-09-11/training.csv';
    expect(parseTrainingDatasetManifest({ manifestVersion: 1, dataset: 'recommendation-training', uris: [latest, previous] }).uris).toEqual([latest, previous]);
    expect(() => parseTrainingDatasetManifest({ manifestVersion: 1, dataset: 'recommendation-training', uris: [latest, latest] })).toThrow(/duplicate/i);
    expect(() => parseTrainingDatasetManifest({ manifestVersion: 1, dataset: 'recommendation-training', uris: Array.from({ length: 31 }, (_, index) => `s3://bucket/exports/training/run_date=2026-09-${String(index + 1).padStart(2, '0')}/training.csv`) })).toThrow(/thirty/i);
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({ Body: { transformToString: async () => JSON.stringify({ manifestVersion: 1, dataset: 'recommendation-training', uris: [latest] }) } } as never);
    await expect(readTrainingDatasetManifestFromS3('s3://processed-example/exports/training/latest.json')).resolves.toEqual({ manifestVersion: 1, dataset: 'recommendation-training', uris: [latest] });
    const command = send.mock.calls[0]![0] as GetObjectCommand;
    expect(command.input).toEqual({ Bucket: 'processed-example', Key: 'exports/training/latest.json' });
  });

  it('rejects non-versioned or mismatched handoffs', () => {
    expect(() =>
      parseTrainingDatasetS3Uri('s3://bucket/exports/training/latest/training.csv'),
    ).toThrow(/exact versioned/);
    expect(() =>
      parseClickstreamTrainingExamples(csv([row('impression-1', '', '1')]), '2026-09-12'),
    ).toThrow(/at least two examples/);
    expect(() =>
      parseClickstreamTrainingExamples(
        csv([row('impression-1', '', '1'), row('impression-2', '', '0')]),
        '2026-09-12',
      ),
    ).not.toThrow();
    expect(() =>
      parseClickstreamTrainingExamples(
        csv([
          row('impression-1', '', '1'),
          row('impression-2', '', '0').map((value, index) => (index === 17 ? '2026-09-13' : value)),
        ]),
        '2026-09-12',
      ),
    ).toThrow(/does not match/);
  });

  it('trains a deterministic S3 candidate with zero weights and demonstration-only metadata', () => {
    const examples = parseClickstreamTrainingExamples(
      csv([row('impression-1', 'buyer-1', '1'), row('impression-2', 'buyer-1', '0')]),
      '2026-09-12',
    );
    const first = trainLogisticRegression(examples, {
      trainedAt: new Date('2026-09-12T04:00:00.000Z'),
      trainingSource: CLICKSTREAM_TRAINING_SOURCE,
      trainingDatasetUri: uri,
    });
    const second = trainLogisticRegression(examples, {
      trainedAt: new Date('2026-09-12T04:00:00.000Z'),
      trainingSource: CLICKSTREAM_TRAINING_SOURCE,
      trainingDatasetUri: uri,
    });

    expect(first).toEqual(second);
    expect(first.featureWeights).toEqual(
      BUYER_PAIR_FEATURE_NAMES.map((name) => ({ name, weight: 0 })),
    );
    expect(first.trainingSource).toBe(CLICKSTREAM_TRAINING_SOURCE);
    expect(first.trainingDatasetUri).toBe(uri);
    expect(first.metrics.trainingDatasetUri).toBe(uri);
    expect(first.metrics.demonstrationOnly).toBe(true);
    expect(first.metrics.metricsLabel).toBe('demonstration-only');
  });

  it('parses normalized snapshot features directly and trains a candidate without re-normalizing them', () => {
    const featureValues = (category: string): string[] =>
      BUYER_PAIR_FEATURE_NAMES.map((name) => (name === 'category_affinity' ? category : '0.25'));
    const provenance = ['2026-09-10', '2026-09-10', '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z', 'product-run', 'buyer-run', 'key-2026', 'offline_lexical_v1'];
    const rows = [
      ['e1', 'personal-ranking-v1', '20260902', '1', '1', 'train', '0', 'buyer-hash-1', 'p1', 'c1', 's1', '2026-09-10T00:01:00.000Z', '1', 'product_click', ...featureValues('1'), '1', ...provenance],
      ['e2', 'personal-ranking-v1', '20260902', '1', '1', 'train', '1', 'buyer-hash-1', 'p2', 'c2', 's2', '2026-09-10T00:02:00.000Z', '0', 'closed_window_negative', ...featureValues('0'), '1', ...provenance],
      ['e3', 'personal-ranking-v1', '20260902', '1', '1', 'heldout', '2', 'buyer-hash-2', 'p3', 'c1', 's1', '2026-09-10T00:03:00.000Z', '1', 'product_click', ...featureValues('1'), '1', ...provenance],
      ['e4', 'personal-ranking-v1', '20260902', '1', '1', 'heldout', '3', 'buyer-hash-2', 'p4', 'c2', 's2', '2026-09-10T00:04:00.000Z', '0', 'closed_window_negative', ...featureValues('0'), '1', ...provenance],
    ];
    const examples = parseSnapshotTrainingExamples(
      [SNAPSHOT_TRAINING_HEADERS.join(','), ...rows.map((row) => row.join(','))].join('\n'),
      '2026-09-10',
    );
    expect(examples.every((example) => example.featureVectorSource === 'snapshot-backed')).toBe(true);
    expect(examples[0]!.features.category_affinity).toBe(1);
    const model = trainLogisticRegression(examples, {
      trainingSource: CLICKSTREAM_SNAPSHOT_TRAINING_SOURCE,
      trainingDatasetUri: uri,
      trainedAt: new Date('2026-09-10T04:00:00.000Z'),
    });
    expect(model.metrics.demonstrationOnly).toBe(true);
    expect(model.featureWeights.some((weight) => weight.weight !== 0)).toBe(true);
    expect(model.trainingSource).toBe(CLICKSTREAM_SNAPSHOT_TRAINING_SOURCE);
    const futureRows = rows.map((row) => [...row]);
    const productSnapshotIndex = SNAPSHOT_TRAINING_HEADERS.indexOf('product_snapshot_at');
    futureRows[0]![productSnapshotIndex] = '2026-09-11T00:00:00.000Z';
    expect(() =>
      parseSnapshotTrainingExamples(
        [SNAPSHOT_TRAINING_HEADERS.join(','), ...futureRows.map((row) => row.join(','))].join('\n'),
        '2026-09-10',
      ),
    ).toThrow(/product_snapshot_at.*before/i);
  });
});

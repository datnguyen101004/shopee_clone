import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  BUYER_PAIR_FEATURE_NAMES,
  RECOMMENDATION_DATASET_VERSION,
  RECOMMENDATION_RANDOM_SEED,
  type BuyerPairFeatureName,
  type SeededTrainingExample,
} from './recommendation.types';

const seededDatasetCandidates = [
  path.resolve(
    process.env.INIT_CWD ?? process.cwd(),
    'data/recommendations/mock/mock_training_examples.csv',
  ),
  path.resolve(process.cwd(), '../../data/recommendations/mock/mock_training_examples.csv'),
];
export const DEFAULT_SEEDED_DATASET_PATH =
  seededDatasetCandidates.find((candidate) => existsSync(candidate)) ?? seededDatasetCandidates[0]!;

export function parseCsv(text: string): readonly string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.length > 0));
}

function requiredIndex(headers: readonly string[], name: string): number {
  const index = headers.indexOf(name);
  if (index < 0) throw new Error(`Seeded recommendation dataset is missing ${name}.`);
  return index;
}

function numberCell(row: readonly string[], headers: readonly string[], name: string): number {
  const value = Number(row[requiredIndex(headers, name)]);
  if (!Number.isFinite(value))
    throw new Error(`Seeded recommendation dataset has invalid ${name}.`);
  return value;
}

function integerCell(row: readonly string[], headers: readonly string[], name: string): number {
  const value = numberCell(row, headers, name);
  if (!Number.isSafeInteger(value))
    throw new Error(`Seeded recommendation dataset has invalid ${name}.`);
  return value;
}

function textCell(row: readonly string[], headers: readonly string[], name: string): string {
  return row[requiredIndex(headers, name)] ?? '';
}

function featureValues(
  row: readonly string[],
  headers: readonly string[],
): Record<BuyerPairFeatureName, number> {
  return Object.fromEntries(
    BUYER_PAIR_FEATURE_NAMES.map((name) => [name, numberCell(row, headers, name)]),
  ) as Record<BuyerPairFeatureName, number>;
}

export function parseSeededTrainingExamples(text: string): readonly SeededTrainingExample[] {
  const rows = parseCsv(text);
  const headers = rows[0];
  if (!headers) throw new Error('Seeded recommendation dataset is empty.');
  return rows.slice(1).map((row) => {
    const split = textCell(row, headers, 'split');
    if (split !== 'train' && split !== 'heldout') {
      throw new Error(`Seeded recommendation dataset has invalid split: ${split}.`);
    }
    const rawLabel = integerCell(row, headers, 'label');
    if (rawLabel !== 0 && rawLabel !== 1)
      throw new Error('Seeded recommendation labels must be 0 or 1.');
    return {
      exampleId: textCell(row, headers, 'example_id'),
      datasetVersion: textCell(row, headers, 'dataset_version'),
      randomSeed: integerCell(row, headers, 'random_seed'),
      modelVersion: integerCell(row, headers, 'model_version'),
      featureSchemaVersion: integerCell(row, headers, 'feature_schema_version'),
      split,
      fold: integerCell(row, headers, 'fold'),
      userId: textCell(row, headers, 'user_id'),
      productId: textCell(row, headers, 'product_id'),
      categoryId: textCell(row, headers, 'category_id'),
      shopId: textCell(row, headers, 'shop_id'),
      impressionAt: new Date(textCell(row, headers, 'impression_at')),
      label: rawLabel as 0 | 1,
      labelSource: textCell(row, headers, 'label_source'),
      features: featureValues(row, headers),
      sampleWeight: numberCell(row, headers, 'sample_weight'),
    } satisfies SeededTrainingExample;
  });
}

export async function readSeededTrainingExamples(
  filePath = DEFAULT_SEEDED_DATASET_PATH,
): Promise<readonly SeededTrainingExample[]> {
  const examples = parseSeededTrainingExamples(await readFile(filePath, 'utf8'));
  validateSeededTrainingExamples(examples);
  return examples;
}

export function validateSeededTrainingExamples(examples: readonly SeededTrainingExample[]): void {
  if (examples.length === 0)
    throw new Error('Seeded recommendation dataset must contain examples.');
  const versions = new Set(examples.map((example) => example.datasetVersion));
  if (versions.size !== 1 || !versions.has(RECOMMENDATION_DATASET_VERSION)) {
    throw new Error(`Seeded recommendation dataset must use ${RECOMMENDATION_DATASET_VERSION}.`);
  }
  if (examples.some((example) => example.randomSeed !== RECOMMENDATION_RANDOM_SEED)) {
    throw new Error(`Seeded recommendation dataset must use seed ${RECOMMENDATION_RANDOM_SEED}.`);
  }
  if (examples.some((example) => Number.isNaN(example.impressionAt.getTime()))) {
    throw new Error('Seeded recommendation dataset contains an invalid impression timestamp.');
  }
  const ids = new Set<string>();
  for (const example of examples) {
    if (ids.has(example.exampleId))
      throw new Error(`Duplicate seeded example: ${example.exampleId}.`);
    ids.add(example.exampleId);
  }
}

export function deterministicPartition(
  examples: readonly SeededTrainingExample[],
  seed = RECOMMENDATION_RANDOM_SEED,
): { train: readonly SeededTrainingExample[]; heldout: readonly SeededTrainingExample[] } {
  const sorted = [...examples].sort((left, right) => left.exampleId.localeCompare(right.exampleId));
  // The committed fixture carries the split produced by its fixed seed. Keep
  // that declaration when present; generated/ad-hoc examples use the same
  // stable hash rule below.
  if (
    sorted.length > 0 &&
    sorted.every(
      (example) =>
        example.datasetVersion === RECOMMENDATION_DATASET_VERSION && example.randomSeed === seed,
    )
  ) {
    return {
      train: sorted.filter((example) => example.split === 'train'),
      heldout: sorted.filter((example) => example.split === 'heldout'),
    };
  }
  const hash = (value: string): number => {
    let state = seed >>> 0;
    for (const character of value)
      state = Math.imul(state ^ character.charCodeAt(0), 16_777_619) >>> 0;
    return state >>> 0;
  };
  const train: SeededTrainingExample[] = [];
  const heldout: SeededTrainingExample[] = [];
  for (const example of sorted) {
    (hash(example.exampleId) % 5 === 0 ? heldout : train).push(example);
  }
  return { train, heldout };
}

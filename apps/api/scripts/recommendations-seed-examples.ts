import { writeFile } from 'node:fs/promises';

import {
  DEFAULT_SEEDED_DATASET_PATH,
  deterministicPartition,
  readSeededTrainingExamples,
} from '../src/recommendations/recommendation-dataset';
import { RECOMMENDATION_RANDOM_SEED } from '../src/recommendations/recommendation.types';

async function main(): Promise<void> {
  const examples = await readSeededTrainingExamples(DEFAULT_SEEDED_DATASET_PATH);
  const partition = deterministicPartition(examples, RECOMMENDATION_RANDOM_SEED);
  const outputPath = process.env.RECOMMENDATION_SEEDED_DATASET_OUTPUT?.trim();
  const payload = {
    datasetVersion: examples[0]?.datasetVersion,
    randomSeed: RECOMMENDATION_RANDOM_SEED,
    featureNames: Object.keys(examples[0]?.features ?? {}),
    trainCount: partition.train.length,
    heldoutCount: partition.heldout.length,
    heldoutPositiveCount: partition.heldout.filter((example) => example.label === 1).length,
    examples,
  };
  if (outputPath) {
    await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
  console.log(
    JSON.stringify({
      datasetVersion: payload.datasetVersion,
      randomSeed: payload.randomSeed,
      trainCount: payload.trainCount,
      heldoutCount: payload.heldoutCount,
      heldoutPositiveCount: payload.heldoutPositiveCount,
      outputPath: outputPath ?? null,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seeded recommendation dataset failed.');
  process.exitCode = 1;
});

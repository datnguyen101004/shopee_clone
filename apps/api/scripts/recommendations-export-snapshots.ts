import { NestFactory } from '@nestjs/core';

import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { SnapshotExportCoordinator } from '../src/training-snapshots/coordinator';
import { TrainingSnapshotsModule } from '../src/training-snapshots/training-snapshots.module';
import { S3SnapshotObjectStore } from '../src/training-snapshots/snapshot-writer';

loadRepositoryEnvironment();

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const runId = option('run-id') ?? process.env.SNAPSHOT_RUN_ID;
  const sourceDate = option('source-date') ?? process.env.SNAPSHOT_SOURCE_DATE;
  const since = option('since') ?? process.env.SNAPSHOT_SINCE;
  const cutoff = option('cutoff') ?? process.env.SNAPSHOT_CUTOFF;
  const bootstrap = option('bootstrap') === 'true' || process.env.SNAPSHOT_BOOTSTRAP === 'true';
  if (!runId || !sourceDate || !since || !cutoff) {
    throw new Error('Snapshot export requires --run-id=<run-id> --source-date=YYYY-MM-DD --since=<UTC> --cutoff=<UTC>.');
  }
  const app = await NestFactory.createApplicationContext(TrainingSnapshotsModule, {
    logger: ['error', 'warn'],
  });
  try {
    const summary = await app.get(SnapshotExportCoordinator).run({
      runId,
      sourceDate,
      since,
      cutoff,
      bootstrap,
      store: app.get(S3SnapshotObjectStore),
    });
    process.stdout.write(
      `${JSON.stringify({
        status: summary.status,
        runId: summary.runId,
        sourceDate,
        cutoff: summary.cutoff,
        products: {
          rowCount: summary.productManifest.rowCount,
          parts: summary.productManifest.parts.length,
        },
        buyerProfiles: {
          rowCount: summary.buyerProfileManifest.rowCount,
          parts: summary.buyerProfileManifest.parts.length,
        },
      })}\n`,
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      status: 'failed',
      error: error instanceof Error ? error.message : 'snapshot export failed',
    })}\n`,
  );
  process.exitCode = 1;
});

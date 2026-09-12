import { Test } from '@nestjs/testing';

import { BuyerProfileSnapshotExporter } from './buyer-exporter';
import {
  TRAINING_SNAPSHOT_CONFIG,
  type TrainingSnapshotConfig,
} from './config';
import { ProductSnapshotExporter } from './product-exporter';
import { TrainingSnapshotsModule } from './training-snapshots.module';
import { PrismaService } from '../prisma/prisma.service';

const config: TrainingSnapshotConfig = {
  environment: 'development',
  region: 'ap-southeast-1',
  processedBucket: 'snapshot-module-test',
  prefix: 'snapshots',
  productPageSize: 10,
  profilePageSize: 10,
  maxRowsPerPart: 100,
  maxPartBytes: 1024 * 1024,
  productProjectionVersion: 2,
  featureSchemaVersion: 1,
  pseudonymKeyId: 'test-key-2026',
  pseudonymSecret: 'test-secret-2026',
};

describe('TrainingSnapshotsModule', () => {
  it('resolves the real product and buyer snapshot exporters', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TrainingSnapshotsModule],
    })
      .overrideProvider(TRAINING_SNAPSHOT_CONFIG)
      .useValue(config)
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    expect(moduleRef.get(ProductSnapshotExporter)).toBeInstanceOf(ProductSnapshotExporter);
    expect(moduleRef.get(BuyerProfileSnapshotExporter)).toBeInstanceOf(
      BuyerProfileSnapshotExporter,
    );

    await moduleRef.close();
  });
});

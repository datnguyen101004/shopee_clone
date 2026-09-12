import { Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';

import { RecommendationsModule } from '../recommendations/recommendations.module';
import { SearchModule } from '../search/search.module';
import { BuyerProfileSnapshotExporter } from './buyer-exporter';
import { loadTrainingSnapshotConfig, TRAINING_SNAPSHOT_CONFIG } from './config';
import { SnapshotExportCoordinator } from './coordinator';
import { ProductSnapshotExporter } from './product-exporter';
import { S3SnapshotObjectStore } from './snapshot-writer';

@Module({
  imports: [SearchModule, RecommendationsModule],
  providers: [
    { provide: TRAINING_SNAPSHOT_CONFIG, useFactory: loadTrainingSnapshotConfig },
    {
      provide: S3SnapshotObjectStore,
      inject: [TRAINING_SNAPSHOT_CONFIG],
      useFactory: (config: ReturnType<typeof loadTrainingSnapshotConfig>) =>
        new S3SnapshotObjectStore(new S3Client({ region: config.region }), config.processedBucket),
    },
    ProductSnapshotExporter,
    BuyerProfileSnapshotExporter,
    SnapshotExportCoordinator,
  ],
  exports: [
    TRAINING_SNAPSHOT_CONFIG,
    ProductSnapshotExporter,
    BuyerProfileSnapshotExporter,
    SnapshotExportCoordinator,
    S3SnapshotObjectStore,
  ],
})
export class TrainingSnapshotsModule {}

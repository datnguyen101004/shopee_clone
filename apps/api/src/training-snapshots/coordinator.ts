import { Inject, Injectable } from '@nestjs/common';

import { validateRunId, validateSourceDate, validateUtc, type SnapshotManifest } from './contracts';
import { BuyerProfileSnapshotExporter } from './buyer-exporter';
import { ProductSnapshotExporter } from './product-exporter';
import type { SnapshotObjectStore } from './snapshot-writer';

export interface SnapshotRunSummary {
  runId: string;
  cutoff: string;
  productManifest: SnapshotManifest;
  buyerProfileManifest: SnapshotManifest;
  status: 'committed';
}

@Injectable()
export class SnapshotExportCoordinator {
  constructor(
    @Inject(ProductSnapshotExporter) private readonly products: ProductSnapshotExporter,
    @Inject(BuyerProfileSnapshotExporter) private readonly buyers: BuyerProfileSnapshotExporter,
  ) {}

  async run(input: {
    runId: string;
    sourceDate: string;
    since: string | Date;
    cutoff: string | Date;
    store: SnapshotObjectStore;
    bootstrap?: boolean;
  }): Promise<SnapshotRunSummary> {
    validateRunId(input.runId);
    validateSourceDate(input.sourceDate);
    const since = input.since instanceof Date ? input.since.toISOString() : input.since;
    validateUtc(since, 'since');
    const cutoff = input.cutoff instanceof Date ? input.cutoff.toISOString() : input.cutoff;
    validateUtc(cutoff, 'cutoff');
    if (new Date(since).getTime() >= new Date(cutoff).getTime()) {
      throw new Error('Snapshot since must be before cutoff.');
    }
    const cutoffDate = new Date(cutoff);
    // Buyer export refreshes only changed users in bounded activity batches;
    // product export is a complete read-only source-day projection.
    const buyerProfileManifest = await this.buyers.export({
      runId: input.runId,
      sourceDate: input.sourceDate,
      since: new Date(since),
      cutoff: cutoffDate,
      bootstrap: input.bootstrap,
      store: input.store,
    });
    const productManifest = await this.products.export({
      runId: input.runId,
      sourceDate: input.sourceDate,
      cutoff: cutoffDate,
      store: input.store,
    });
    return { runId: input.runId, cutoff, productManifest, buyerProfileManifest, status: 'committed' };
  }
}

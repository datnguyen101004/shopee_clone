import { Inject, Injectable } from '@nestjs/common';

import { normalizeProductSearchText } from '../search/product-search-document';
import { ProductSearchProjectionBuilder } from '../search/product-search-projection.builder';
import {
  ProductSearchProjectionRepository,
} from '../search/product-search-projection.repository';
import { PRODUCT_SEARCH_PROJECTION_VERSION } from '../search/search.versions';
import {
  PRODUCT_SNAPSHOT_SCHEMA_VERSION,
  type ProductSnapshotRow,
  type SnapshotManifest,
} from './contracts';
import { TRAINING_SNAPSHOT_CONFIG, type TrainingSnapshotConfig } from './config';
import { writeSnapshot, type SnapshotObjectStore } from './snapshot-writer';

export interface ProductSnapshotExporterOptions {
  runId: string;
  sourceDate: string;
  cutoff: Date;
  store: SnapshotObjectStore;
}

@Injectable()
export class ProductSnapshotExporter {
  constructor(
    @Inject(ProductSearchProjectionRepository)
    private readonly repository: ProductSearchProjectionRepository,
    @Inject(ProductSearchProjectionBuilder)
    private readonly builder: ProductSearchProjectionBuilder,
    @Inject(TRAINING_SNAPSHOT_CONFIG)
    private readonly config: TrainingSnapshotConfig,
  ) {}

  async export(options: ProductSnapshotExporterOptions): Promise<SnapshotManifest> {
    const snapshotAt = options.cutoff.toISOString();
    return writeSnapshot<ProductSnapshotRow>({
      store: options.store,
      dataset: 'products',
      rootPrefix: this.config.prefix,
      runId: options.runId,
      snapshotAt,
      sourceDate: options.sourceDate,
      cutoff: snapshotAt,
      schemaVersion: PRODUCT_SNAPSHOT_SCHEMA_VERSION,
      featureSchemaVersion: this.config.featureSchemaVersion,
      productProjectionVersion: PRODUCT_SEARCH_PROJECTION_VERSION,
      maxRowsPerPart: this.config.maxRowsPerPart,
      maxPartBytes: this.config.maxPartBytes,
      rows: this.rows(options.cutoff, options.runId),
      rowMapper: (row) => row,
    });
  }

  private async *rows(cutoff: Date, runId: string): AsyncIterable<ProductSnapshotRow> {
    let afterId: string | null = null;
    for (;;) {
      const products = await this.repository.findSellableProductsPage(
        afterId,
        this.config.productPageSize,
      );
      if (products.length === 0) return;
      const projections = await this.builder.buildMany(products, cutoff);
      for (const projection of projections) {
        if (projection.kind !== 'index') continue;
        const document = projection.document;
        yield {
          snapshotSchemaVersion: PRODUCT_SNAPSHOT_SCHEMA_VERSION,
          runId,
          snapshotAt: cutoff.toISOString(),
          productProjectionVersion: document.projection_version,
          featureSchemaVersion: document.buyer_profile_feature_schema_version,
          productId: document.product_id,
          categoryId: document.category_id,
          shopId: document.shop_id,
          effectivePriceMinor: document.effective_price_minor,
          compareAtPriceMinor: document.compare_at_price_minor,
          discountBasisPoints: document.discount_basis_points,
          ratingAverageBasisPoints: document.rating_average_basis_points,
          ratingCount: document.rating_count,
          soldCount: document.sold_count,
          promotionActive: document.promotion_active,
          inventoryAvailable: document.inventory_available,
          productCreatedAt: document.product_created_at,
          productUpdatedAt: document.product_updated_at,
          searchableText: normalizeProductSearchText(
            [
              document.name,
              document.description,
              document.category_name,
              document.shop_name,
              ...document.attributes,
            ].join(' '),
          ),
          nameNormalized: document.name_normalized,
          categoryNameNormalized: document.category_name_normalized,
          shopNameNormalized: document.shop_name_normalized,
        };
      }
      afterId = products[products.length - 1]?.id ?? afterId;
      if (products.length < this.config.productPageSize) return;
    }
  }
}

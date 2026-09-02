import { Module } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';

import { PricingModule } from '../pricing/pricing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { loadSearchConfig, SEARCH_CONFIG, type SearchConfig } from './search.config';
import {
  ELASTICSEARCH_CLIENT,
  ELASTICSEARCH_INDEXING_CLIENT,
  SearchElasticsearchAdapter,
  type ElasticsearchClientPort,
} from './search-elasticsearch.adapter';
import { ProductSearchProjectionBuilder } from './product-search-projection.builder';
import { ProductSearchProjectionRepository } from './product-search-projection.repository';
import { ProductSearchIndexingService } from './product-search-indexing.service';
import { ProductSearchCheckpointRepository } from './product-search-checkpoint.repository';
import { ProductSearchQueryService } from './product-search-query.service';

@Module({
  imports: [PrismaModule, PricingModule],
  providers: [
    { provide: SEARCH_CONFIG, useFactory: loadSearchConfig },
    {
      provide: ELASTICSEARCH_CLIENT,
      inject: [SEARCH_CONFIG],
      useFactory: (config: SearchConfig): ElasticsearchClientPort | null => {
        if (config.elasticsearch.url === null) return null;
        return new Client({
          node: config.elasticsearch.url,
          requestTimeout: config.elasticsearch.requestTimeoutMs,
          maxRetries: 0,
        }) as unknown as ElasticsearchClientPort;
      },
    },
    {
      provide: ELASTICSEARCH_INDEXING_CLIENT,
      inject: [SEARCH_CONFIG],
      useFactory: (config: SearchConfig): ElasticsearchClientPort | null => {
        if (config.elasticsearch.url === null) return null;
        return new Client({
          node: config.elasticsearch.url,
          requestTimeout: config.elasticsearch.indexingRequestTimeoutMs,
          maxRetries: 0,
        }) as unknown as ElasticsearchClientPort;
      },
    },
    SearchElasticsearchAdapter,
    ProductSearchProjectionRepository,
    ProductSearchProjectionBuilder,
    ProductSearchCheckpointRepository,
    ProductSearchIndexingService,
    ProductSearchQueryService,
  ],
  exports: [
    SEARCH_CONFIG,
    ELASTICSEARCH_CLIENT,
    ELASTICSEARCH_INDEXING_CLIENT,
    SearchElasticsearchAdapter,
    ProductSearchProjectionBuilder,
    ProductSearchIndexingService,
    ProductSearchQueryService,
  ],
})
export class SearchModule {}

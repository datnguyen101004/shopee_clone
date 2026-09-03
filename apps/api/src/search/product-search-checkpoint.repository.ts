import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  PRODUCT_SEARCH_ANALYZER_VERSION,
  PRODUCT_SEARCH_PROJECTION_VERSION,
} from './search.versions';

export const PRODUCT_SEARCH_INDEX_CHECKPOINT_SCOPE = 'products';

export interface ProductSearchCheckpointUpdate {
  lastCompletedAt?: Date | null;
  lastRunAt?: Date | null;
  activeIndex?: string | null;
  lastError?: string | null;
}

@Injectable()
export class ProductSearchCheckpointRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  find(): Promise<{
    scope: string;
    projectionVersion: number;
    analyzerVersion: number;
    lastCompletedAt: Date | null;
    lastRunAt: Date | null;
    activeIndex: string | null;
    lastError: string | null;
  } | null> {
    return this.prisma.productSearchIndexCheckpoint.findUnique({
      where: { scope: PRODUCT_SEARCH_INDEX_CHECKPOINT_SCOPE },
      select: {
        scope: true,
        projectionVersion: true,
        analyzerVersion: true,
        lastCompletedAt: true,
        lastRunAt: true,
        activeIndex: true,
        lastError: true,
      },
    });
  }

  save(update: ProductSearchCheckpointUpdate) {
    const data: Prisma.ProductSearchIndexCheckpointCreateInput = {
      scope: PRODUCT_SEARCH_INDEX_CHECKPOINT_SCOPE,
      projectionVersion: PRODUCT_SEARCH_PROJECTION_VERSION,
      analyzerVersion: PRODUCT_SEARCH_ANALYZER_VERSION,
      ...(update.lastCompletedAt !== undefined ? { lastCompletedAt: update.lastCompletedAt } : {}),
      ...(update.lastRunAt !== undefined ? { lastRunAt: update.lastRunAt } : {}),
      ...(update.activeIndex !== undefined ? { activeIndex: update.activeIndex } : {}),
      ...(update.lastError !== undefined ? { lastError: update.lastError } : {}),
    };
    return this.prisma.productSearchIndexCheckpoint.upsert({
      where: { scope: PRODUCT_SEARCH_INDEX_CHECKPOINT_SCOPE },
      create: data,
      update: {
        projectionVersion: PRODUCT_SEARCH_PROJECTION_VERSION,
        analyzerVersion: PRODUCT_SEARCH_ANALYZER_VERSION,
        ...('lastCompletedAt' in update ? { lastCompletedAt: update.lastCompletedAt } : {}),
        ...('lastRunAt' in update ? { lastRunAt: update.lastRunAt } : {}),
        ...('activeIndex' in update ? { activeIndex: update.activeIndex } : {}),
        ...('lastError' in update ? { lastError: update.lastError } : {}),
      },
    });
  }
}

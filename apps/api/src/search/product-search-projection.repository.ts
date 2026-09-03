import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

import { sellableProductWhere } from '../catalog/sellable-product';
import { sellableShopWhere } from '../catalog/sellable-shop';
import { PrismaService } from '../prisma/prisma.service';

const categoryProjectionInclude = {
  parent: {
    include: {
      parent: {
        include: {
          parent: true,
        },
      },
    },
  },
} satisfies Prisma.CategoryInclude;

export const productSearchProjectionInclude = {
  shop: true,
  category: { include: categoryProjectionInclude },
  images: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    take: 1,
  },
  variants: {
    where: { status: 'ACTIVE', deletedAt: null },
    include: { inventory: true },
    orderBy: [{ priceMinor: 'asc' }, { id: 'asc' }],
  },
  attributes: {
    include: { definition: true },
    orderBy: [{ definition: { sortOrder: 'asc' } }, { definitionId: 'asc' }],
  },
} satisfies Prisma.ProductInclude;

export type ProductSearchProjectionRecord = Prisma.ProductGetPayload<{
  include: typeof productSearchProjectionInclude;
}>;

@Injectable()
export class ProductSearchProjectionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findSellableProducts(): Promise<ProductSearchProjectionRecord[]> {
    return this.prisma.product.findMany({
      where: {
        ...sellableProductWhere,
        shop: sellableShopWhere,
        category: { isActive: true, deletedAt: null },
      },
      include: productSearchProjectionInclude,
      orderBy: [{ id: 'asc' }],
    });
  }

  findProductsByIds(ids: readonly string[]): Promise<ProductSearchProjectionRecord[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.product.findMany({
      where: { id: { in: [...new Set(ids)] } },
      include: productSearchProjectionInclude,
      orderBy: [{ id: 'asc' }],
    });
  }

  findChangedProductIds(since: Date, until: Date, limit: number): Promise<Array<{ id: string }>> {
    const window = { gte: since, lte: until } as const;
    return this.prisma.product.findMany({
      where: {
        OR: [
          { updatedAt: window },
          { shop: { updatedAt: window } },
          { category: { updatedAt: window } },
          { variants: { some: { updatedAt: window } } },
          { variants: { some: { inventory: { updatedAt: window } } } },
          { discountCampaignProducts: { some: { campaign: { updatedAt: window } } } },
          { reviews: { some: { updatedAt: window } } },
          { attributes: { some: { definition: { updatedAt: window } } } },
        ],
      },
      select: { id: true },
      orderBy: [{ id: 'asc' }],
      take: limit + 1,
    });
  }

  findProductsInPromotionWindow(
    windowStart: Date,
    windowEnd: Date,
    limit: number,
  ): Promise<Array<{ id: string }>> {
    return this.prisma.product.findMany({
      where: {
        discountCampaignProducts: {
          some: {
            campaign: {
              startsAt: { lte: windowEnd },
              endsAt: { gte: windowStart },
            },
          },
        },
      },
      select: { id: true },
      orderBy: [{ id: 'asc' }],
      take: limit + 1,
    });
  }
}

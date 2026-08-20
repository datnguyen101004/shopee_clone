import { Inject, Injectable } from '@nestjs/common';

import { VariantStatus } from '../generated/prisma/enums';
import { sellableProductWhere } from './sellable-product';
import { PrismaService } from '../prisma/prisma.service';
import { sellableShopWhere } from './sellable-shop';

@Injectable()
export class CatalogRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findActiveCategories() {
    return this.prisma.category.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, parentId: true, slug: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  findCandidates(categoryIds?: string[], shopId?: string) {
    return this.prisma.product.findMany({
      where: {
        ...sellableProductWhere,
        ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
        ...(shopId ? { shopId } : {}),
        shop: sellableShopWhere,
        category: { isActive: true, deletedAt: null },
      },
      include: {
        shop: true,
        category: true,
        images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        variants: {
          where: { status: VariantStatus.ACTIVE, deletedAt: null },
          include: { inventory: true },
          orderBy: [{ priceMinor: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  findCandidatesForShop(shopId: string) {
    return this.findCandidates(undefined, shopId);
  }

  findPublicProduct(identifier: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
    return this.prisma.product.findFirst({
      where: {
        ...(isUuid ? { id: identifier } : { slug: identifier }),
        ...sellableProductWhere,
        shop: sellableShopWhere,
        category: { isActive: true, deletedAt: null },
      },
      include: {
        shop: true,
        category: true,
        images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        variants: {
          where: { status: VariantStatus.ACTIVE, deletedAt: null },
          include: { inventory: true },
          orderBy: [{ priceMinor: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }

  findDeletedProduct(identifier: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
    return this.prisma.product.findFirst({
      where: {
        ...(isUuid ? { id: identifier } : { slug: identifier }),
        deletedAt: { not: null },
      },
      select: { id: true, slug: true },
    });
  }

  countPublicProductsForShop(shopId: string) {
    return this.prisma.product.count({
      where: {
        shopId,
        ...sellableProductWhere,
        category: { isActive: true, deletedAt: null },
      },
    });
  }

  findRelatedCandidates(categoryId: string, excludedProductId: string) {
    return this.prisma.product.findMany({
      take: 24,
      where: {
        id: { not: excludedProductId },
        categoryId,
        ...sellableProductWhere,
        shop: sellableShopWhere,
        category: { isActive: true, deletedAt: null },
      },
      include: {
        shop: true,
        category: true,
        images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        variants: {
          where: { status: VariantStatus.ACTIVE, deletedAt: null },
          include: { inventory: true },
          orderBy: [{ priceMinor: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }
}

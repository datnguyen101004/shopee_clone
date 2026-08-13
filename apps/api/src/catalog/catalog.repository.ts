import { Inject, Injectable } from '@nestjs/common';

import { ProductStatus, ShopStatus, VariantStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

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
        status: ProductStatus.ACTIVE,
        deletedAt: null,
        ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
        ...(shopId ? { shopId } : {}),
        shop: { status: ShopStatus.ACTIVE, deletedAt: null },
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

  findPublicProduct(productId: string) {
    return this.prisma.product.findFirst({
      where: {
        id: productId,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
        shop: { status: ShopStatus.ACTIVE, deletedAt: null },
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

  countPublicProductsForShop(shopId: string) {
    return this.prisma.product.count({
      where: {
        shopId,
        status: ProductStatus.ACTIVE,
        deletedAt: null,
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
        status: ProductStatus.ACTIVE,
        deletedAt: null,
        shop: { status: ShopStatus.ACTIVE, deletedAt: null },
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

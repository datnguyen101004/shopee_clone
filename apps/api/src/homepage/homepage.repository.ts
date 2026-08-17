import { Inject, Injectable } from '@nestjs/common';

import { VariantStatus } from '../generated/prisma/enums';
import type { ProductModerationStatus, ProductStatus, ShopOnboardingStatus, ShopStatus } from '../generated/prisma/enums';
import { isSellableShop } from '../catalog/sellable-shop';
import { isSellableProduct } from '../catalog/sellable-product';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HomepageRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  findActive(now: Date) {
    return this.prisma.homepageModule.findMany({
      where: {
        isEnabled: true,
        AND: [
          { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
          { OR: [{ activeUntil: null }, { activeUntil: { gt: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        banners: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        categories: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: { category: true },
        },
        products: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: {
            product: {
              include: {
                shop: true,
                images: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
                variants: {
                  where: { status: VariantStatus.ACTIVE, deletedAt: null },
                  include: { inventory: true },
                  orderBy: [{ priceMinor: 'asc' }, { id: 'asc' }],
                },
              },
            },
          },
        },
      },
    });
  }

  static isDisplayableProduct(product: {
    status: ProductStatus;
    moderationStatus?: ProductModerationStatus;
    deletedAt: Date | null;
    shop: { status: ShopStatus; onboardingStatus?: ShopOnboardingStatus; deletedAt: Date | null };
  }): boolean {
    return (
      isSellableProduct(product) &&
      isSellableShop(product.shop)
    );
  }
}

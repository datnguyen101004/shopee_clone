import { Inject, Injectable } from '@nestjs/common';

import { ProductStatus, ShopStatus, VariantStatus } from '../generated/prisma/enums';
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
    deletedAt: Date | null;
    shop: { status: ShopStatus; deletedAt: Date | null };
  }): boolean {
    return (
      product.status === ProductStatus.ACTIVE &&
      product.deletedAt === null &&
      product.shop.status === ShopStatus.ACTIVE &&
      product.shop.deletedAt === null
    );
  }
}

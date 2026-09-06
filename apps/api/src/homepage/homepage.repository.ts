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
        banners: { orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] },
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

  findCampaignTargets(ids: readonly string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.marketplaceCampaign.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        publishedAt: true,
        cancelledAt: true,
        announceAt: true,
        enrollmentStartsAt: true,
        enrollmentEndsAt: true,
        startsAt: true,
        endsAt: true,
      },
    });
  }

  findProductTargets(ids: readonly string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.product.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, slug: true, status: true, deletedAt: true },
    });
  }

  findShopTargets(ids: readonly string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.shop.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, slug: true, status: true, onboardingStatus: true, deletedAt: true },
    });
  }

  findCategoryTargets(ids: readonly string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.category.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, slug: true, isActive: true, deletedAt: true },
    });
  }

  findActiveAdminUserIds() {
    return this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        roleAssignments: { some: { role: 'ADMIN' } },
      },
      select: { id: true },
    }).then((users) => users.map((user) => user.id));
  }

  /** Generic typed campaign placements used by Flash Sale and future shelves. */
  findActiveCampaignCollections(now: Date) {
    return this.prisma.homepageCampaignCollection.findMany({
      where: {
        isEnabled: true,
        module: { isEnabled: true },
        campaign: { publishedAt: { not: null }, cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        module: { select: { type: true } },
        type: true,
        campaign: {
          include: {
            type: true,
            participations: {
              where: { state: { in: ['JOINED', 'LOCKED'] } },
              include: {
                products: {
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

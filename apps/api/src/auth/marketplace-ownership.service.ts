import type { SellerShop } from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { ShopStatus, UserStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationDeniedError } from './auth.errors';

const safeShopSelect = { id: true, slug: true, name: true, status: true } as const;

@Injectable()
export class MarketplaceOwnershipService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ownedShop(userId: string): Promise<SellerShop> {
    const shop = await this.prisma.shop.findFirst({
      where: {
        ownerId: userId,
        deletedAt: null,
        owner: { status: UserStatus.ACTIVE, deletedAt: null },
      },
      select: safeShopSelect,
    });
    if (!shop) throw new AuthorizationDeniedError();
    return {
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      status: shop.status === ShopStatus.ACTIVE ? 'active' : 'inactive',
    };
  }

  async ownsShop(userId: string, shopId: string): Promise<boolean> {
    return (
      (await this.prisma.shop.count({
        where: {
          id: shopId,
          ownerId: userId,
          deletedAt: null,
          owner: { status: UserStatus.ACTIVE, deletedAt: null },
        },
      })) === 1
    );
  }
}

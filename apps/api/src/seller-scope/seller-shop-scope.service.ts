import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ApprovedSellerShop { id: string; timeZone: string; }
export class SellerShopScopeNotFoundError extends Error { constructor() { super('Seller shop unavailable'); } }

/** Shared owner scope: clients never select a shop id. */
@Injectable()
export class SellerShopScopeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolve(userId: string): Promise<ApprovedSellerShop> {
    const shop = await this.prisma.shop.findFirst({ where: { ownerId: userId, deletedAt: null, status: 'ACTIVE', onboardingStatus: 'APPROVED' }, select: { id: true, timeZone: true } });
    if (!shop) throw new SellerShopScopeNotFoundError();
    return shop;
  }
}

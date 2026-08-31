import { Inject, Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { VoucherDefinitionSnapshot } from '../vouchers/voucher-pricing.calculator';
import { checkedMoneyFromBigInt } from './money';

@Injectable()
export class BuyerBestPriceRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async loadDefaultAddress(userId: string): Promise<{ province: string; district: string } | null> {
    return this.prisma.shippingAddress.findFirst({
      where: { userId, isDefault: true, deletedAt: null },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: { province: true, district: true },
    });
  }

  async loadVoucherDefinitions(
    userId: string,
    shopIds: readonly string[],
  ): Promise<VoucherDefinitionSnapshot[]> {
    if (shopIds.length === 0) return [];
    const where: Prisma.VoucherWhereInput = {
      archivedAt: null,
      OR: [{ issuer: 'PLATFORM' }, { issuer: 'SHOP', shopId: { in: [...new Set(shopIds)] } }],
    };
    const definitions = await this.prisma.voucher.findMany({
      where,
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      include: {
        productScopes: { select: { productId: true } },
        userUsages: { where: { userId }, select: { usedCount: true } },
      },
    });
    return definitions.map((definition) => ({
      id: definition.id,
      code: definition.code,
      name: definition.name,
      issuer: definition.issuer,
      shopId: definition.shopId,
      benefitType: definition.benefitType,
      fixedAmountMinor:
        definition.fixedAmountMinor === null
          ? null
          : checkedMoneyFromBigInt(definition.fixedAmountMinor),
      percentageBasisPoints: definition.percentageBasisPoints,
      maximumDiscountMinor:
        definition.maximumDiscountMinor === null
          ? null
          : checkedMoneyFromBigInt(definition.maximumDiscountMinor),
      minimumSpendMinor: checkedMoneyFromBigInt(definition.minimumSpendMinor),
      startsAt: definition.startsAt,
      endsAt: definition.endsAt,
      isEnabled: definition.isEnabled,
      usageLimit: definition.usageLimit,
      usedCount: definition.usedCount,
      perBuyerLimit: definition.perBuyerLimit,
      buyerUsedCount: definition.userUsages[0]?.usedCount ?? 0,
      productIds: definition.productScopes.map(({ productId }) => productId),
    }));
  }
}

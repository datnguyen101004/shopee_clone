import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface EffectivePriceBreakdown {
  variantId: string;
  productId: string;
  basePriceMinor: bigint;
  effectivePriceMinor: bigint;
  compareAtPriceMinor: bigint | null;
  discountBasisPoints: number;
  campaignId: string | null;
  evaluatedAt: Date;
}

/** The only place where scheduled product discounts are applied. */
@Injectable()
export class ScheduledDiscountService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async resolveVariants(
    transaction: Prisma.TransactionClient | PrismaService | undefined,
    variants: ReadonlyArray<{ id: string; productId: string; priceMinor: bigint; compareAtPriceMinor: bigint | null }>,
    evaluatedAt: Date,
  ): Promise<Map<string, EffectivePriceBreakdown>> {
    if (variants.length === 0) return new Map();
    const db = transaction ?? this.prisma;
    const productIds = [...new Set(variants.map((variant) => variant.productId))];
    const rows = await db.shopDiscountProduct.findMany({
      where: {
        productId: { in: productIds },
        campaign: {
          isEnabled: true,
          archivedAt: null,
          startsAt: { lte: evaluatedAt },
          endsAt: { gt: evaluatedAt },
        },
      },
      select: { productId: true, discountBasisPoints: true, campaignId: true },
    });
    const discountByProduct = new Map(rows.map((row) => [row.productId, row]));
    return new Map(variants.map((variant) => {
      const campaign = discountByProduct.get(variant.productId);
      if (!campaign) return [variant.id, { variantId: variant.id, productId: variant.productId, basePriceMinor: variant.priceMinor, effectivePriceMinor: variant.priceMinor, compareAtPriceMinor: variant.compareAtPriceMinor, discountBasisPoints: 0, campaignId: null, evaluatedAt }];
      const discount = (variant.priceMinor * BigInt(campaign.discountBasisPoints)) / 10000n;
      const effective = variant.priceMinor - discount;
      const safeEffective = effective > 0n && effective < variant.priceMinor ? effective : variant.priceMinor;
      return [variant.id, { variantId: variant.id, productId: variant.productId, basePriceMinor: variant.priceMinor, effectivePriceMinor: safeEffective, compareAtPriceMinor: variant.compareAtPriceMinor, discountBasisPoints: safeEffective === variant.priceMinor ? 0 : campaign.discountBasisPoints, campaignId: safeEffective === variant.priceMinor ? null : campaign.campaignId, evaluatedAt }];
    }));
  }
}

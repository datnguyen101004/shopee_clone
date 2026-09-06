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
  sourceKind?: 'SHOP' | 'MARKETPLACE' | null;
  campaignTypeCode?: string | null;
  policyVersion?: number | null;
  campaignImportanceClass?: 'NORMAL' | 'FEATURED' | null;
  rankingProfileKey?: string | null;
  campaignActiveFrom?: Date | null;
  campaignActiveUntil?: Date | null;
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
    const reservationRepository = (db as PrismaService).productPromotionReservation;
    const [shopRows, reservationRows] = await Promise.all([
      db.shopDiscountProduct.findMany({
      where: {
        productId: { in: productIds },
        campaign: {
          isEnabled: true,
          archivedAt: null,
          startsAt: { lte: evaluatedAt },
          endsAt: { gt: evaluatedAt },
        },
      },
      select: { productId: true, discountBasisPoints: true, campaignId: true, campaign: { select: { startsAt: true, endsAt: true } } },
      }),
      reservationRepository ? reservationRepository.findMany({
        where: { productId: { in: productIds }, isEnabled: true, startsAt: { lte: evaluatedAt }, endsAt: { gt: evaluatedAt }, marketplaceCampaignId: { not: null } },
        select: { productId: true, discountBasisPoints: true, marketplaceCampaignId: true, startsAt: true, endsAt: true, marketplaceCampaign: { select: { id: true, publishedAt: true, cancelledAt: true, startsAt: true, endsAt: true, policyVersionSnapshot: true, importanceClassSnapshot: true, rankingProfileKeySnapshot: true, type: { select: { code: true, policyVersion: true, importanceClass: true, rankingProfileKey: true } } } } },
      }) : Promise.resolve([]),
    ]);
    const discountByProduct = new Map<string, { productId: string; discountBasisPoints: number; campaignId: string; sourceKind: 'SHOP' | 'MARKETPLACE'; campaignTypeCode: string | null; policyVersion: number | null; campaignImportanceClass: 'NORMAL' | 'FEATURED' | null; rankingProfileKey: string | null; campaignActiveFrom: Date | null; campaignActiveUntil: Date | null }>();
    for (const row of shopRows) discountByProduct.set(row.productId, { productId: row.productId, discountBasisPoints: row.discountBasisPoints, campaignId: row.campaignId, sourceKind: 'SHOP', campaignTypeCode: null, policyVersion: null, campaignImportanceClass: null, rankingProfileKey: null, campaignActiveFrom: row.campaign?.startsAt ?? null, campaignActiveUntil: row.campaign?.endsAt ?? null });
    for (const row of reservationRows) {
      const campaign = row.marketplaceCampaign;
      if (!campaign || !campaign.publishedAt || campaign.cancelledAt || campaign.startsAt > evaluatedAt || campaign.endsAt <= evaluatedAt) continue;
      const source = { productId: row.productId, discountBasisPoints: row.discountBasisPoints, campaignId: campaign.id, sourceKind: 'MARKETPLACE' as const, campaignTypeCode: campaign.type.code, policyVersion: campaign.policyVersionSnapshot ?? campaign.type.policyVersion, campaignImportanceClass: campaign.importanceClassSnapshot ?? campaign.type.importanceClass, rankingProfileKey: campaign.rankingProfileKeySnapshot ?? campaign.type.rankingProfileKey, campaignActiveFrom: row.startsAt, campaignActiveUntil: row.endsAt };
      // The reservation guarantees non-overlap for new writes. Keep the higher
      // discount when reading legacy rows during the migration window.
      const current = discountByProduct.get(row.productId);
      if (!current || source.discountBasisPoints > current.discountBasisPoints) discountByProduct.set(row.productId, source);
    }
    return new Map(variants.map((variant) => {
      const campaign = discountByProduct.get(variant.productId);
      if (!campaign) return [variant.id, { variantId: variant.id, productId: variant.productId, basePriceMinor: variant.priceMinor, effectivePriceMinor: variant.priceMinor, compareAtPriceMinor: variant.compareAtPriceMinor, discountBasisPoints: 0, campaignId: null, sourceKind: null, campaignTypeCode: null, policyVersion: null, campaignImportanceClass: null, rankingProfileKey: null, campaignActiveFrom: null, campaignActiveUntil: null, evaluatedAt }];
      const discount = (variant.priceMinor * BigInt(campaign.discountBasisPoints)) / 10000n;
      const effective = variant.priceMinor - discount;
      const safeEffective = effective > 0n && effective < variant.priceMinor ? effective : variant.priceMinor;
      return [variant.id, { variantId: variant.id, productId: variant.productId, basePriceMinor: variant.priceMinor, effectivePriceMinor: safeEffective, compareAtPriceMinor: variant.compareAtPriceMinor, discountBasisPoints: safeEffective === variant.priceMinor ? 0 : campaign.discountBasisPoints, campaignId: safeEffective === variant.priceMinor ? null : campaign.campaignId, sourceKind: safeEffective === variant.priceMinor ? null : campaign.sourceKind, campaignTypeCode: safeEffective === variant.priceMinor ? null : campaign.campaignTypeCode, policyVersion: safeEffective === variant.priceMinor ? null : campaign.policyVersion, campaignImportanceClass: safeEffective === variant.priceMinor ? null : campaign.campaignImportanceClass, rankingProfileKey: safeEffective === variant.priceMinor ? null : campaign.rankingProfileKey, campaignActiveFrom: safeEffective === variant.priceMinor ? null : campaign.campaignActiveFrom, campaignActiveUntil: safeEffective === variant.priceMinor ? null : campaign.campaignActiveUntil, evaluatedAt }];
    }));
  }
}

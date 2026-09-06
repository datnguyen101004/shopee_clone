import {
  CAMPAIGN_IMPORTANCE_CLASSES,
  CAMPAIGN_PRESENTATION_KEYS,
  CAMPAIGN_PRODUCT_ORDER_KEYS,
  CAMPAIGN_RANKING_PROFILE_KEYS,
  type CampaignImportanceClass,
  type CampaignPresentationKey,
  type CampaignProductOrderKey,
  type CampaignRankingProfileKey,
} from '@shopee-clone/contracts';
import type { CAMPAIGN_TYPE_CODES } from '@shopee-clone/contracts';

export interface CampaignPolicyDefinition {
  code: (typeof CAMPAIGN_TYPE_CODES)[number];
  displayName: string;
  description: string;
  policyKey: string;
  policyVersion: number;
  minimumDiscountBasisPoints: number;
  maximumProductsPerSeller: number;
  presentationKey: CampaignPresentationKey;
  productOrderKey: CampaignProductOrderKey;
  importanceClass: CampaignImportanceClass;
  rankingProfileKey: CampaignRankingProfileKey;
}

/**
 * Global maximum contribution of a campaign profile to relevance scoring.
 * Individual profiles may be lower, but no type or client input can exceed it.
 */
export const CAMPAIGN_RANKING_BOOST_MAX = 0.08;

export const CAMPAIGN_POLICY_REGISTRY: Record<(typeof CAMPAIGN_TYPE_CODES)[number], CampaignPolicyDefinition> = {
  STANDARD: {
    code: 'STANDARD', displayName: 'Chiến dịch tiêu chuẩn',
    description: 'Ưu đãi theo danh mục hoặc chủ đề do sàn điều phối.',
    policyKey: 'STANDARD_V1', policyVersion: 1, minimumDiscountBasisPoints: 500,
    maximumProductsPerSeller: 50, presentationKey: 'STANDARD', productOrderKey: 'CURATED',
    importanceClass: 'NORMAL', rankingProfileKey: 'NORMAL_V1',
  },
  FLASH_SALE: {
    code: 'FLASH_SALE', displayName: 'Flash Sale',
    description: 'Khung giờ giảm sâu, hiển thị nổi bật trên trang chủ.',
    policyKey: 'FLASH_SALE_V1', policyVersion: 1, minimumDiscountBasisPoints: 1000,
    maximumProductsPerSeller: 20, presentationKey: 'FLASH_SALE', productOrderKey: 'DISCOUNT_DESC',
    importanceClass: 'FEATURED', rankingProfileKey: 'FEATURED_FLASH_SALE_V1',
  },
  CHEAPEST_DEALS: {
    code: 'CHEAPEST_DEALS', displayName: 'Rẻ Vô Địch',
    description: 'Tập hợp sản phẩm có mức giá cạnh tranh nhất.',
    policyKey: 'CHEAPEST_DEALS_V1', policyVersion: 1, minimumDiscountBasisPoints: 300,
    maximumProductsPerSeller: 30, presentationKey: 'CHEAPEST_DEALS', productOrderKey: 'PRICE_ASC',
    importanceClass: 'NORMAL', rankingProfileKey: 'NORMAL_V1',
  },
};

export function campaignPolicyFor(code: string): CampaignPolicyDefinition | null {
  return (CAMPAIGN_POLICY_REGISTRY as Record<string, CampaignPolicyDefinition | undefined>)[code] ?? null;
}

export function isRegisteredCampaignPresentation(value: string): value is CampaignPresentationKey {
  return (CAMPAIGN_PRESENTATION_KEYS as readonly string[]).includes(value);
}
export function isRegisteredCampaignOrder(value: string): value is CampaignProductOrderKey {
  return (CAMPAIGN_PRODUCT_ORDER_KEYS as readonly string[]).includes(value);
}
export function isRegisteredCampaignRankingProfile(value: string): value is CampaignRankingProfileKey {
  return (CAMPAIGN_RANKING_PROFILE_KEYS as readonly string[]).includes(value);
}
export function isRegisteredCampaignImportance(value: string): value is CampaignImportanceClass {
  return (CAMPAIGN_IMPORTANCE_CLASSES as readonly string[]).includes(value);
}

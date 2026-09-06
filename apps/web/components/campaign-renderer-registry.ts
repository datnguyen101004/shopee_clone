import type { CampaignBannerDetail, CampaignPresentationKey } from '@shopee-clone/contracts';

export interface CampaignRendererDefinition {
  key: CampaignPresentationKey;
  badge: string;
  className: string;
}

/** Closed presentation registry. Unknown server keys always use the safe generic renderer. */
const RENDERERS: Record<CampaignPresentationKey, CampaignRendererDefinition> = {
  STANDARD: { key: 'STANDARD', badge: 'Ưu đãi từ sàn', className: 'campaign-detail--standard' },
  FLASH_SALE: { key: 'FLASH_SALE', badge: 'Flash Sale', className: 'campaign-detail--flash-sale' },
  CHEAPEST_DEALS: { key: 'CHEAPEST_DEALS', badge: 'Rẻ Vô Địch', className: 'campaign-detail--cheapest-deals' },
  GENERIC: { key: 'GENERIC', badge: 'Campaign', className: 'campaign-detail--generic' },
};

export function campaignRendererFor(campaign: Pick<CampaignBannerDetail, 'type'>): CampaignRendererDefinition {
  return RENDERERS[campaign.type.presentationKey] ?? RENDERERS.GENERIC;
}

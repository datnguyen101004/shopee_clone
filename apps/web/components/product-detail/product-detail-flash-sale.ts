import type { ProductDetailVariant } from '@shopee-clone/contracts';
import type { FlashSaleSkuState, FlashSaleSkuStatusItem } from '../../lib/flash-sale-types';

export interface VariantFlashSaleOffer {
  isFlashSale: boolean;
  state: FlashSaleSkuState;
  salePriceMinor: number;
  canPurchase: boolean;
  isCodOnly: boolean;
  campaignId: string | null;
}

export function getVariantFlashSaleOffer(
  variant: ProductDetailVariant | null,
  statusMap: Record<string, FlashSaleSkuStatusItem> = {},
): VariantFlashSaleOffer {
  if (!variant) {
    return {
      isFlashSale: false,
      state: 'ENDED',
      salePriceMinor: 0,
      canPurchase: false,
      isCodOnly: false,
      campaignId: null,
    };
  }

  // 1. Check live status polling map first
  const liveStatus = statusMap[variant.id];
  if (liveStatus) {
    const isFs = liveStatus.state === 'ACTIVE' || liveStatus.state === 'SOLD_OUT' || liveStatus.state === 'UPCOMING';
    return {
      isFlashSale: isFs,
      state: liveStatus.state,
      salePriceMinor: liveStatus.salePriceMinor ?? variant.priceMinor,
      canPurchase: liveStatus.canPurchase,
      isCodOnly: isFs,
      campaignId: variant.scheduledPrice?.campaignId ?? null,
    };
  }

  // The live status endpoint is authoritative. Until it responds, keep the
  // regular product price so a stale scheduled price cannot create a fake sale.
  if (variant.scheduledPrice?.campaignTypeCode === 'FLASH_SALE') {
    return {
      isFlashSale: false,
      state: 'ENDED',
      salePriceMinor: variant.priceMinor,
      canPurchase: variant.availability === 'in-stock' && variant.availableQuantity > 0,
      isCodOnly: false,
      campaignId: null,
    };
  }

  return {
    isFlashSale: false,
    state: 'ENDED',
    salePriceMinor: variant.priceMinor,
    canPurchase: variant.availability === 'in-stock' && variant.availableQuantity > 0,
    isCodOnly: false,
    campaignId: null,
  };
}

export function hasAnyActiveFlashSale(
  variants: ProductDetailVariant[],
  statusMap: Record<string, FlashSaleSkuStatusItem> = {},
): boolean {
  return variants.some((v) => {
    const offer = getVariantFlashSaleOffer(v, statusMap);
    return offer.isFlashSale && offer.state === 'ACTIVE' && offer.canPurchase;
  });
}

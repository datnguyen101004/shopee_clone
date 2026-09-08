import { describe, expect, it } from 'vitest';
import { getVariantFlashSaleOffer } from './product-detail-flash-sale';
import type { ProductDetailVariant } from '@shopee-clone/contracts';
import type { FlashSaleSkuStatusItem } from '../../lib/flash-sale-types';

describe('product-detail-flash-sale', () => {
  const baseVariant: ProductDetailVariant = {
    id: 'var-1',
    name: 'Xanh dương / L',
    sku: 'SHIRT-BLUE-L',
    priceMinor: 200000,
    compareAtPriceMinor: 250000,
    availableQuantity: 50,
    availability: 'in-stock',
    preferredImageId: null,
  };

  it('resolves active flash sale variant from live status map with COD restriction and fixed sale price', () => {
    const statusMap: Record<string, FlashSaleSkuStatusItem> = {
      'var-1': {
        variantId: 'var-1',
        state: 'ACTIVE',
        salePriceMinor: 120000,
        canPurchase: true,
        stateVersion: 1,
      },
    };

    const offer = getVariantFlashSaleOffer(baseVariant, statusMap);
    expect(offer.isFlashSale).toBe(true);
    expect(offer.state).toBe('ACTIVE');
    expect(offer.salePriceMinor).toBe(120000);
    expect(offer.canPurchase).toBe(true);
    expect(offer.isCodOnly).toBe(true);
  });

  it('resolves sold-out flash sale variant blocking purchase without falling back to regular price or ordinary inventory', () => {
    const statusMap: Record<string, FlashSaleSkuStatusItem> = {
      'var-1': {
        variantId: 'var-1',
        state: 'SOLD_OUT',
        salePriceMinor: 120000,
        canPurchase: false,
        stateVersion: 1,
      },
    };

    const offer = getVariantFlashSaleOffer(baseVariant, statusMap);
    expect(offer.isFlashSale).toBe(true);
    expect(offer.state).toBe('SOLD_OUT');
    expect(offer.salePriceMinor).toBe(120000);
    expect(offer.canPurchase).toBe(false);
  });

  it('treats upcoming variant as not open for purchase', () => {
    const statusMap: Record<string, FlashSaleSkuStatusItem> = {
      'var-1': {
        variantId: 'var-1',
        state: 'UPCOMING',
        salePriceMinor: 120000,
        canPurchase: false,
        stateVersion: 1,
      },
    };

    const offer = getVariantFlashSaleOffer(baseVariant, statusMap);
    expect(offer.isFlashSale).toBe(true);
    expect(offer.state).toBe('UPCOMING');
    expect(offer.canPurchase).toBe(false);
  });

  it('keeps the regular price until the live status endpoint confirms the sale', () => {
    const variantWithScheduled: ProductDetailVariant = {
      ...baseVariant,
      scheduledPrice: {
        campaignId: 'camp-1',
        campaignTypeCode: 'FLASH_SALE',
        basePriceMinor: 200000,
        effectivePriceMinor: 150000,
        compareAtPriceMinor: 200000,
        discountBasisPoints: 2500,
        evaluatedAt: '2026-09-07T12:00:00.000Z',
      },
      priceMinor: 150000,
    };

    const offer = getVariantFlashSaleOffer(variantWithScheduled, {});
    expect(offer.isFlashSale).toBe(false);
    expect(offer.state).toBe('ENDED');
    expect(offer.salePriceMinor).toBe(150000);
    expect(offer.canPurchase).toBe(true);
    expect(offer.isCodOnly).toBe(false);
  });

  it('treats ordinary sibling variant as normal product without flash sale restrictions', () => {
    const offer = getVariantFlashSaleOffer(baseVariant, {});
    expect(offer.isFlashSale).toBe(false);
    expect(offer.state).toBe('ENDED');
    expect(offer.salePriceMinor).toBe(200000);
    expect(offer.canPurchase).toBe(true);
    expect(offer.isCodOnly).toBe(false);
  });

  it('handles null variant gracefully', () => {
    const offer = getVariantFlashSaleOffer(null, {});
    expect(offer.isFlashSale).toBe(false);
    expect(offer.canPurchase).toBe(false);
  });
});

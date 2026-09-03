import type { EffectivePriceBreakdown } from '../pricing/scheduled-discount.service';
import { applyScheduledPrice, representativeOffer } from './catalog-presentation';

const inventory = { quantityOnHand: 2, quantityReserved: 0 };

describe('catalog effective-price presentation', () => {
  it('chooses the lowest effective in-stock offer with an ID tie-breaker', () => {
    const representative = representativeOffer([
      { id: 'variant-b', priceMinor: 600n, compareAtPriceMinor: null, inventory },
      { id: 'variant-c', priceMinor: 400n, compareAtPriceMinor: 800n, inventory },
      { id: 'variant-a', priceMinor: 400n, compareAtPriceMinor: 900n, inventory },
      {
        id: 'variant-out',
        priceMinor: 100n,
        compareAtPriceMinor: null,
        inventory: { quantityOnHand: 1, quantityReserved: 1 },
      },
    ]);

    expect(representative).toMatchObject({
      offer: { id: 'variant-a', compareAtPriceMinor: 900n },
      priceMinor: 400,
      availableQuantity: 2,
    });
  });

  it('applies one server breakdown and preserves an honest higher comparison price', () => {
    const offer = { id: 'variant-1', priceMinor: 1_000n, compareAtPriceMinor: 1_500n, inventory };
    const discount: EffectivePriceBreakdown = {
      variantId: offer.id,
      productId: 'product-1',
      basePriceMinor: 1_000n,
      effectivePriceMinor: 800n,
      compareAtPriceMinor: offer.compareAtPriceMinor,
      discountBasisPoints: 2_000,
      campaignId: 'campaign-1',
      evaluatedAt: new Date('2026-08-31T00:00:00.000Z'),
    };

    expect(applyScheduledPrice(offer, discount)).toMatchObject({
      priceMinor: 800n,
      compareAtPriceMinor: 1_500n,
      scheduledPrice: {
        basePriceMinor: 1_000,
        effectivePriceMinor: 800,
        compareAtPriceMinor: 1_500,
      },
    });

    expect(
      applyScheduledPrice(
        { ...offer, compareAtPriceMinor: null },
        { ...discount, compareAtPriceMinor: null },
      ),
    ).toMatchObject({
      compareAtPriceMinor: 1_000n,
      scheduledPrice: { compareAtPriceMinor: 1_000 },
    });
  });

  it('returns the stored base offer when no valid campaign price exists', () => {
    const offer = { id: 'variant-1', priceMinor: 1_000n, compareAtPriceMinor: null, inventory };
    expect(applyScheduledPrice(offer, undefined)).toBe(offer);
    expect(
      applyScheduledPrice(offer, {
        variantId: offer.id,
        productId: 'product-1',
        basePriceMinor: 1_000n,
        effectivePriceMinor: 1_000n,
        compareAtPriceMinor: null,
        discountBasisPoints: 0,
        campaignId: null,
        evaluatedAt: new Date('2026-08-31T00:00:00.000Z'),
      }),
    ).toBe(offer);
  });
});

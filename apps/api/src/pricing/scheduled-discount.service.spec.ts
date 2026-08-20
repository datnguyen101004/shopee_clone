import { ScheduledDiscountService } from './scheduled-discount.service';

describe('ScheduledDiscountService', () => {
  it('applies an active basis-point discount in integer minor units and preserves base price', async () => {
    const prisma = { shopDiscountProduct: { findMany: jest.fn().mockResolvedValue([{ productId: 'product-1', discountBasisPoints: 1250, campaignId: 'campaign-1' }]) } };
    const service = new ScheduledDiscountService(prisma as never);
    const evaluatedAt = new Date('2026-08-19T00:00:00.000Z');
    const result = await service.resolveVariants(undefined, [{ id: 'variant-1', productId: 'product-1', priceMinor: 10001n, compareAtPriceMinor: null }], evaluatedAt);
    expect(result.get('variant-1')).toMatchObject({ basePriceMinor: 10001n, effectivePriceMinor: 8751n, discountBasisPoints: 1250, campaignId: 'campaign-1', evaluatedAt });
    expect(prisma.shopDiscountProduct.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ productId: { in: ['product-1'] } }) }));
  });

  it('does not create an invalid zero-priced result', async () => {
    const prisma = { shopDiscountProduct: { findMany: jest.fn().mockResolvedValue([{ productId: 'product-1', discountBasisPoints: 9000, campaignId: 'campaign-1' }]) } };
    const service = new ScheduledDiscountService(prisma as never);
    const result = await service.resolveVariants(undefined, [{ id: 'variant-1', productId: 'product-1', priceMinor: 1n, compareAtPriceMinor: 10n }], new Date('2026-08-19T00:00:00.000Z'));
    expect(result.get('variant-1')).toMatchObject({ effectivePriceMinor: 1n, discountBasisPoints: 0, campaignId: null });
  });

  it('uses a half-open active window and preserves base pricing when no campaign matches', async () => {
    const prisma = { shopDiscountProduct: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new ScheduledDiscountService(prisma as never);
    const evaluatedAt = new Date('2026-08-10T00:00:00.000Z');
    const result = await service.resolveVariants(undefined, [{ id: 'variant-1', productId: 'product-1', priceMinor: 12345n, compareAtPriceMinor: 15000n }], evaluatedAt);
    expect(result.get('variant-1')).toMatchObject({ basePriceMinor: 12345n, effectivePriceMinor: 12345n, discountBasisPoints: 0, campaignId: null });
    expect(prisma.shopDiscountProduct.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ campaign: expect.objectContaining({ startsAt: { lte: evaluatedAt }, endsAt: { gt: evaluatedAt } }) }) }));
  });

  it('rounds percentage savings down in minor units for every variant in one product', async () => {
    const prisma = { shopDiscountProduct: { findMany: jest.fn().mockResolvedValue([{ productId: 'product-1', discountBasisPoints: 3333, campaignId: 'campaign-1' }]) } };
    const service = new ScheduledDiscountService(prisma as never);
    const result = await service.resolveVariants(undefined, [
      { id: 'variant-1', productId: 'product-1', priceMinor: 10001n, compareAtPriceMinor: null },
      { id: 'variant-2', productId: 'product-1', priceMinor: 300n, compareAtPriceMinor: 500n },
    ], new Date('2026-08-10T00:00:00.000Z'));
    expect(result.get('variant-1')?.effectivePriceMinor).toBe(6668n);
    expect(result.get('variant-2')?.effectivePriceMinor).toBe(201n);
  });
});

import { describe, expect, it, jest } from '@jest/globals';

import { FlashSaleAdmissionService } from './flash-sale-admission.service';

describe('FlashSaleAdmissionService', () => {
  it('hydrates missing Redis quota keys from the database snapshot', async () => {
    const sku = {
      id: 'sku-1',
      variantId: 'variant-1',
      productId: 'product-1',
      campaignId: 'campaign-1',
      remainingQuantity: 3,
      managementEpoch: 7,
    };
    const prisma = {
      cart: {
        findUnique: (jest.fn() as any).mockResolvedValue({
          version: 0,
          lines: [{ variantId: sku.variantId, quantity: 1 }],
        }),
      },
      flashSaleSku: { findMany: (jest.fn() as any).mockResolvedValue([sku]) },
      flashSaleBuyerClaim: { findMany: (jest.fn() as any).mockResolvedValue([]) },
    };
    const redis = {
      isReady: jest.fn().mockReturnValue(true),
      consumeRateLimit: (jest.fn() as any).mockResolvedValue({ available: true, allowed: true, retryAfterSeconds: 0 }),
      getValue: (jest.fn() as any).mockResolvedValue(null),
      setNxValue: (jest.fn() as any).mockResolvedValue(true),
      evalVersioned: (jest.fn() as any)
        .mockResolvedValueOnce(-2)
        .mockResolvedValueOnce(1),
    };

    const service = new FlashSaleAdmissionService(prisma as never, redis as never);
    const result = await service.admit('buyer-1', 0, 'order-key-1');

    expect(result.token).toEqual(expect.any(String));
    expect(redis.evalVersioned).toHaveBeenCalledTimes(2);
    expect(redis.setNxValue).toHaveBeenCalledWith(
      'flash-sale:admission:sku:sku-1',
      '3',
    );
    expect(redis.setNxValue).toHaveBeenCalledWith(
      'flash-sale:admission:epoch:sku-1',
      '7',
      86_400_000,
    );
  });
});

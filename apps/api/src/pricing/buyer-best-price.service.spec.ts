import type { VoucherDefinitionSnapshot } from '../vouchers/voucher-pricing.calculator';
import type { BuyerBestPriceRepository } from './buyer-best-price.repository';
import { BuyerBestPriceService, type BuyerPriceProductSnapshot } from './buyer-best-price.service';
import { MockShippingCalculator } from './mock-shipping.calculator';

const SHOP_ID = '00000000-0000-4000-8000-000000000201';
const definition: VoucherDefinitionSnapshot = {
  id: 'voucher-1',
  code: 'SAVE10K',
  name: 'Giảm 10K',
  issuer: 'PLATFORM',
  shopId: null,
  benefitType: 'FIXED_AMOUNT',
  fixedAmountMinor: 10_000,
  percentageBasisPoints: null,
  maximumDiscountMinor: null,
  minimumSpendMinor: 50_000,
  startsAt: new Date('2026-08-01T00:00:00.000Z'),
  endsAt: new Date('2026-09-30T00:00:00.000Z'),
  isEnabled: true,
  usageLimit: 100,
  usedCount: 0,
  perBuyerLimit: 1,
  buyerUsedCount: 0,
  productIds: [],
};

const products: BuyerPriceProductSnapshot[] = Array.from({ length: 48 }, (_, index) => ({
  productId: `product-${index}`,
  variantId: `variant-${index}`,
  effectivePriceMinor: 100_000 + index,
  weightGrams: 500,
  shop: {
    id: SHOP_ID,
    ownerUserId: 'owner-1',
    slug: 'shop',
    name: 'Shop',
    location: 'Hồ Chí Minh',
    pickupProvince: 'Thành phố Hồ Chí Minh',
  },
}));

describe('BuyerBestPriceService', () => {
  const previousFlag = process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED;

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED;
    else process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED = previousFlag;
    jest.restoreAllMocks();
  });

  function setup(address: { province: string; district: string } | null) {
    const repository = {
      loadDefaultAddress: jest.fn().mockResolvedValue(address),
      loadVoucherDefinitions: jest.fn().mockResolvedValue([definition]),
    };
    const service = new BuyerBestPriceService(
      repository as unknown as BuyerBestPriceRepository,
      new MockShippingCalculator(),
    );
    return { repository, service };
  }

  it('is default-off and performs no PostgreSQL reads', async () => {
    delete process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED;
    const { repository, service } = setup(null);
    expect(await service.previews('buyer-1', products, new Date())).toEqual(new Map());
    expect(repository.loadDefaultAddress).not.toHaveBeenCalled();
    expect(repository.loadVoucherDefinitions).not.toHaveBeenCalled();
  });

  it('loads address and all voucher facts once for a 48-card batch', async () => {
    process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED = 'true';
    const { repository, service } = setup({
      province: 'Thành phố Hà Nội',
      district: 'Ba Đình',
    });
    const startedAt = performance.now();
    const result = await service.previews(
      'buyer-1',
      products,
      new Date('2026-08-31T04:00:00.000Z'),
    );
    const durationMs = performance.now() - startedAt;
    expect(result.size).toBe(48);
    expect(result.get('variant-0')).toMatchObject({
      merchandisePayableMinor: 90_000,
      shipping: { service: 'STANDARD' },
    });
    expect(repository.loadDefaultAddress).toHaveBeenCalledTimes(1);
    expect(repository.loadVoucherDefinitions).toHaveBeenCalledTimes(1);
    expect(durationMs).toBeLessThan(75);
  });

  it('keeps merchandise vouchers but omits shipping without a default address', async () => {
    process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED = 'true';
    const { service } = setup(null);
    expect(
      (
        await service.previews(
          'buyer-1',
          products.slice(0, 1),
          new Date('2026-08-31T04:00:00.000Z'),
        )
      ).get('variant-0'),
    ).toMatchObject({ merchandisePayableMinor: 90_000, shipping: null });
  });

  it('omits shipping when origin or variant weight is incomplete', async () => {
    process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED = 'true';
    const { service } = setup({ province: 'Thành phố Hà Nội', district: 'Ba Đình' });
    const incomplete = {
      ...products[0]!,
      weightGrams: 0,
      shop: { ...products[0]!.shop, pickupProvince: null },
    };
    expect(
      (await service.previews('buyer-1', [incomplete], new Date('2026-08-31T04:00:00.000Z'))).get(
        'variant-0',
      )?.shipping,
    ).toBeNull();
  });

  it('falls back without exposing internal dependency errors', async () => {
    process.env.BUYER_BEST_PRICE_PREVIEW_ENABLED = 'true';
    const { repository, service } = setup(null);
    repository.loadVoucherDefinitions.mockRejectedValueOnce(new Error('database detail'));
    expect(await service.previews('buyer-1', products.slice(0, 1), new Date())).toEqual(new Map());
  });
});

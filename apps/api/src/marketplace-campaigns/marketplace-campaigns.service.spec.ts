import { campaignLifecycleAt, type CreateCampaignRequest } from '@shopee-clone/contracts';
import { MarketplaceCampaignsService } from './marketplace-campaigns.service';
import { campaignPolicyFor } from './campaign-policy';
import { MarketplaceCampaignValidationError } from './marketplace-campaigns.errors';

const input = (overrides: Partial<CreateCampaignRequest> = {}): CreateCampaignRequest => ({
  typeCode: 'FLASH_SALE', title: 'Flash sale tháng 9', description: 'Deal tốt', content: [{ kind: 'paragraph', text: 'Giảm giá hôm nay' }], altText: 'Flash sale', announceAt: '2026-09-01T00:00:00.000Z', enrollmentStartsAt: '2026-09-01T01:00:00.000Z', enrollmentEndsAt: '2026-09-02T00:00:00.000Z', startsAt: '2026-09-02T00:00:00.000Z', endsAt: '2026-09-03T00:00:00.000Z', minimumDiscountBasisPoints: 1000, ...overrides,
});

describe('marketplace campaign policy and content', () => {
  it('derives featured importance only for Flash Sale', () => {
    expect(campaignPolicyFor('FLASH_SALE')?.importanceClass).toBe('FEATURED');
    expect(campaignPolicyFor('STANDARD')?.importanceClass).toBe('NORMAL');
    expect(campaignPolicyFor('CHEAPEST_DEALS')?.presentationKey).toBe('CHEAPEST_DEALS');
  });

  it('keeps preview isolated and rejects unsafe links', async () => {
    const service = new MarketplaceCampaignsService({} as never, {} as never);
    const preview = await service.preview(input());
    expect(preview.id).toBe('preview');
    await expect(service.preview(input({ content: [{ kind: 'link', label: 'unsafe', href: 'https://evil.example' }] }))).rejects.toBeInstanceOf(MarketplaceCampaignValidationError);
  });

  it('uses half-open lifecycle boundaries', () => {
    const base = { publishedAt: '2026-09-01T00:00:00.000Z', cancelledAt: null, announceAt: '2026-09-01T01:00:00.000Z', enrollmentStartsAt: '2026-09-01T02:00:00.000Z', enrollmentEndsAt: '2026-09-01T03:00:00.000Z', startsAt: '2026-09-01T04:00:00.000Z', endsAt: '2026-09-01T05:00:00.000Z' };
    expect(campaignLifecycleAt(base, new Date('2026-09-01T04:00:00.000Z'))).toBe('ACTIVE');
    expect(campaignLifecycleAt(base, new Date('2026-09-01T05:00:00.000Z'))).toBe('ENDED');
  });

  it('uses a stable ten-item page and returns total metadata for admin lists', async () => {
    const prisma = {
      marketplaceCampaign: {
        count: jest.fn().mockResolvedValue(24),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new MarketplaceCampaignsService(prisma as never, {} as never);

    await expect(service.listAdmin({ page: 3 })).resolves.toMatchObject({
      page: 3,
      pageSize: 10,
      totalItems: 24,
      totalPages: 3,
    });
    expect(prisma.marketplaceCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('maps flash sale SKU registrations with options, campaign quota and available inventory', async () => {
    const prisma = {
      marketplaceCampaign: { findUnique: jest.fn().mockResolvedValue({ id: 'campaign-1', type: { code: 'FLASH_SALE' } }) },
      flashSaleSku: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{
          id: 'sku-row-1',
          referencePriceMinor: 120000n,
          salePriceMinor: 99000n,
          allocatedQuantity: 10,
          remainingQuantity: 7,
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          participation: {
            id: 'participation-1', state: 'LOCKED', version: 2, respondedAt: new Date('2026-09-01T00:00:00.000Z'),
            shop: { id: 'shop-1', name: 'Shop One', slug: 'shop-one' },
          },
          product: { id: 'product-1', name: 'Product One', slug: 'product-one' },
          variant: {
            id: 'variant-1', name: 'Đỏ / M', sku: 'RED-M-001',
            optionValues: [
              { optionValue: { value: 'M', group: { name: 'Kích cỡ', sortOrder: 2 } } },
              { optionValue: { value: 'Đỏ', group: { name: 'Màu', sortOrder: 1 } } },
            ],
            inventory: { quantityOnHand: 30, quantityReserved: 5 },
          },
        }]),
      },
    };
    const service = new MarketplaceCampaignsService(prisma as never, {} as never);

    await expect(service.participantDetails('campaign-1', { page: 1 })).resolves.toMatchObject({
      page: 1,
      pageSize: 10,
      totalItems: 1,
      items: [{
        shopName: 'Shop One',
        state: 'LOCKED',
        products: [{
          sku: 'RED-M-001',
          options: ['Màu: Đỏ', 'Kích cỡ: M'],
          regularPriceMinor: 120000,
          salePriceMinor: 99000,
          allocatedQuantity: 10,
          remainingQuantity: 7,
          physicalInventoryAvailable: 25,
        }],
      }],
    });
    expect(prisma.flashSaleSku.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 10 }));
  });

  it('maps non-flash product registrations without inventing SKU or quota values', async () => {
    const prisma = {
      marketplaceCampaign: { findUnique: jest.fn().mockResolvedValue({ id: 'campaign-2', type: { code: 'STANDARD' } }) },
      sellerCampaignProduct: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([{
          productId: 'product-2', discountBasisPoints: 1500, acceptedAt: new Date('2026-09-01T00:00:00.000Z'),
          participation: {
            id: 'participation-2', state: 'JOINED', version: 1, respondedAt: null,
            shop: { id: 'shop-2', name: 'Shop Two', slug: 'shop-two' },
          },
          product: { id: 'product-2', name: 'Product Two', slug: 'product-two' },
        }]),
      },
    };
    const service = new MarketplaceCampaignsService(prisma as never, {} as never);

    await expect(service.participantDetails('campaign-2', { page: 1 })).resolves.toMatchObject({
      items: [{ products: [{ discountBasisPoints: 1500, variantId: null, sku: null, allocatedQuantity: null, remainingQuantity: null, physicalInventoryAvailable: null }] }],
    });
  });

  it('allows a Flash Sale seller to join before adding any SKU', async () => {
    const now = new Date();
    const campaign = {
      id: 'campaign-flash-join',
      type: { code: 'FLASH_SALE', displayName: 'Flash Sale', description: '', importanceClass: 'FEATURED', policyVersion: 1, presentationKey: 'FLASH_SALE', productOrderKey: 'DISCOUNT_DESC', rankingProfileKey: 'FEATURED_FLASH_SALE_V1', isEnabled: true },
      categories: [],
      participations: [],
      publishedAt: new Date(now.getTime() - 60_000),
      cancelledAt: null,
      announceAt: new Date(now.getTime() - 3_600_000),
      enrollmentStartsAt: new Date(now.getTime() - 1_800_000),
      enrollmentEndsAt: new Date(now.getTime() + 1_800_000),
      startsAt: new Date(now.getTime() + 3_600_000),
      endsAt: new Date(now.getTime() + 7_200_000),
      minimumDiscountBasisPoints: 1000,
    };
    const saved = { id: 'participation-flash', state: 'JOINED', version: 1, products: [], updatedAt: now };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ now }]),
      marketplaceCampaign: { findUnique: jest.fn().mockResolvedValue(campaign) },
      sellerCampaignParticipation: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(saved),
        findUniqueOrThrow: jest.fn().mockResolvedValue(saved),
        create: jest.fn().mockResolvedValue(saved),
      },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      productPromotionReservation: { updateMany: jest.fn(), createMany: jest.fn() },
      sellerCampaignProduct: { deleteMany: jest.fn(), createMany: jest.fn() },
      marketplaceCampaignAudit: { create: jest.fn() },
      marketplaceCampaignCommand: { create: jest.fn() },
    };
    const prisma = {
      marketplaceCampaign: { findUnique: jest.fn().mockResolvedValue(campaign) },
      marketplaceCampaignCommand: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new MarketplaceCampaignsService(
      prisma as never,
      { resolve: jest.fn().mockResolvedValue({ id: 'shop-1' }) } as never,
    );

    await expect(
      service.participate(
        'seller-1',
        campaign.id,
        { decision: 'JOINED', version: null, products: [] },
        '00000000-0000-4000-8000-000000000099',
      ),
    ).resolves.toMatchObject({ state: 'JOINED', products: [] });
    expect(tx.sellerCampaignProduct.createMany).toHaveBeenCalledWith({ data: [] });
    expect(tx.productPromotionReservation.createMany).toHaveBeenCalledWith({ data: [] });
  });

  it('still requires products when a non-Flash Sale seller joins', async () => {
    const now = new Date();
    const campaign = {
      id: 'campaign-standard-join',
      type: { code: 'STANDARD' },
      categories: [],
      participations: [],
      publishedAt: new Date(now.getTime() - 60_000),
      cancelledAt: null,
      announceAt: new Date(now.getTime() - 3_600_000),
      enrollmentStartsAt: new Date(now.getTime() - 1_800_000),
      enrollmentEndsAt: new Date(now.getTime() + 1_800_000),
      startsAt: new Date(now.getTime() + 3_600_000),
      endsAt: new Date(now.getTime() + 7_200_000),
      minimumDiscountBasisPoints: 500,
    };
    const service = new MarketplaceCampaignsService(
      { marketplaceCampaign: { findUnique: jest.fn().mockResolvedValue(campaign) } } as never,
      { resolve: jest.fn().mockResolvedValue({ id: 'shop-1' }) } as never,
    );

    await expect(
      service.participate(
        'seller-1',
        campaign.id,
        { decision: 'JOINED', version: null, products: [] },
        '00000000-0000-4000-8000-000000000098',
      ),
    ).rejects.toThrow('Select a unique set of eligible products');
  });
});

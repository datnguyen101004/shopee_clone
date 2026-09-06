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
});

import { EngagementService } from './engagement.service';

describe('favorite clickstream outcome', () => {
  it('emits after a successful favorite mutation without delaying the response', async () => {
    let release!: () => void;
    const analytics = new Promise<null>((resolve) => {
      release = () => resolve(null);
    });
    const clickstream = { captureAuthoritativeOutcome: jest.fn().mockReturnValue(analytics) };
    const repository = {
      findDisplayableProduct: jest.fn().mockResolvedValue({ id: 'product-1' }),
      upsertFavorite: jest.fn().mockResolvedValue({
        favoritedAt: new Date('2026-09-10T00:00:00.000Z'),
      }),
    };
    const service = new EngagementService(
      repository as never,
      { now: () => new Date() } as never,
      undefined,
      undefined,
      clickstream as never,
    );
    await expect(service.addFavorite('buyer-1', 'product-1')).resolves.toEqual({
      productId: 'product-1',
      isFavorite: true,
      favoritedAt: '2026-09-10T00:00:00.000Z',
    });
    expect(clickstream.captureAuthoritativeOutcome).toHaveBeenCalledWith({
      eventType: 'favorite_changed',
      surface: 'favorite',
      userId: 'buyer-1',
      productId: 'product-1',
      properties: { isFavorite: true },
    });
    release();
  });
});

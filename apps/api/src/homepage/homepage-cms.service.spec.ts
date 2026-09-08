import { HomepageCmsService } from './homepage-cms.service';

const adminId = '00000000-0000-4000-8000-000000000001';
const bannerId = '00000000-0000-4000-8000-000000000101';

function banner(overrides: Record<string, unknown> = {}) {
  return {
    id: bannerId,
    eyebrow: null,
    title: 'Summer sale',
    description: null,
    imageUrl: 'https://cdn.example.test/admin-banner-media/old.png',
    altText: 'Summer sale',
    themeKey: 'brand',
    sortOrder: 0,
    priority: 0,
    targetType: 'URL',
    targetId: null,
    targetQuery: '/',
    displayFrom: null,
    displayUntil: null,
    isEnabled: true,
    ...overrides,
  };
}

describe('HomepageCmsService banner media lifecycle', () => {
  it('attaches a staged uploaded asset while creating a banner', async () => {
    const tx = {
      homepageModule: { findFirst: jest.fn().mockResolvedValue({ id: 'module-id' }) },
      homepageBanner: {
        findFirst: jest.fn().mockResolvedValue({ sortOrder: 0 }),
        create: jest.fn().mockResolvedValue(banner({ imageUrl: 'https://cdn.example.test/admin-banner-media/new.png' })),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const staged = {
      id: 'media-id',
      storageKey: 'admin-banner-media/media-id.png',
    };
    const bannerMedia = {
      requireStagedAsset: jest.fn().mockResolvedValue(staged),
      publicUrl: jest.fn().mockReturnValue('https://cdn.example.test/admin-banner-media/media-id.png'),
      attachAsset: jest.fn().mockResolvedValue(undefined),
    };
    const service = new HomepageCmsService(prisma as never, bannerMedia as never);

    await service.createBanner(adminId, {
      title: 'Summer sale',
      altText: 'Summer sale',
      theme: 'brand',
      targetType: 'URL',
      targetQuery: '/',
      imageAssetId: staged.id,
      imageUrl: 'https://untrusted.example.test/banner.png',
    });

    expect(bannerMedia.requireStagedAsset).toHaveBeenCalledWith(tx, adminId, staged.id);
    expect(bannerMedia.attachAsset).toHaveBeenCalledWith(tx, staged.id, bannerId);
    expect(tx.homepageBanner.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ imageUrl: 'https://cdn.example.test/admin-banner-media/media-id.png' }),
      }),
    );
  });

  it('rejects an arbitrary create URL when no verified upload asset is supplied', async () => {
    const transaction = jest.fn();
    const service = new HomepageCmsService(
      { $transaction: transaction } as never,
      { requireStagedAsset: jest.fn() } as never,
    );

    await expect(
      service.createBanner(adminId, {
        title: 'Summer sale',
        altText: 'Summer sale',
        theme: 'brand',
        targetType: 'URL',
        targetQuery: '/',
        imageUrl: 'https://untrusted.example.test/banner.png',
      }),
    ).rejects.toThrow('Banner image URL is not allowlisted.');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('derives the update URL from a verified upload asset and ignores a contradictory URL', async () => {
    const tx = {
      homepageBanner: {
        findUnique: jest.fn().mockResolvedValue(banner({ imageAsset: null })),
        update: jest.fn().mockResolvedValue(
          banner({ imageUrl: 'https://cdn.example.test/admin-banner-media/replacement.png' }),
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const staged = { id: 'replacement-media-id', storageKey: 'admin-banner-media/replacement.png' };
    const bannerMedia = {
      requireStagedAsset: jest.fn().mockResolvedValue(staged),
      publicUrl: jest.fn().mockReturnValue('https://cdn.example.test/admin-banner-media/replacement.png'),
      detachAsset: jest.fn(),
      attachAsset: jest.fn().mockResolvedValue(undefined),
    };
    const service = new HomepageCmsService(prisma as never, bannerMedia as never);

    await service.updateBanner(adminId, bannerId, {
      imageAssetId: staged.id,
      imageUrl: 'https://untrusted.example.test/banner.png',
    });

    expect(bannerMedia.requireStagedAsset).toHaveBeenCalledWith(tx, adminId, staged.id);
    expect(tx.homepageBanner.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imageUrl: 'https://cdn.example.test/admin-banner-media/replacement.png',
        }),
      }),
    );
    expect(bannerMedia.attachAsset).toHaveBeenCalledWith(tx, staged.id, bannerId);
  });

  it('does not bypass URL validation when update explicitly clears the asset id', async () => {
    const tx = {
      homepageBanner: {
        findUnique: jest.fn().mockResolvedValue(banner({ imageAsset: null })),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new HomepageCmsService(prisma as never, { requireStagedAsset: jest.fn() } as never);

    await expect(
      service.updateBanner(adminId, bannerId, {
        imageAssetId: null,
        imageUrl: 'https://untrusted.example.test/banner.png',
      }),
    ).rejects.toThrow('Banner image URL is not allowlisted.');
    expect(tx.homepageBanner.update).not.toHaveBeenCalled();
  });

  it('preserves an existing attached image when an authorized admin edits other fields', async () => {
    const current = banner({ imageAsset: { id: 'existing-media-id' } });
    const updated = banner({ title: 'Updated title' });
    const tx = {
      homepageBanner: {
        findUnique: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue(updated),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const bannerMedia = {
      requireStagedAsset: jest.fn(),
      detachAsset: jest.fn(),
      attachAsset: jest.fn(),
    };
    const service = new HomepageCmsService(prisma as never, bannerMedia as never);

    await service.updateBanner(adminId, bannerId, {
      title: 'Updated title',
      imageUrl: current.imageUrl,
    });

    expect(bannerMedia.requireStagedAsset).not.toHaveBeenCalled();
    expect(bannerMedia.detachAsset).not.toHaveBeenCalled();
    expect(bannerMedia.attachAsset).not.toHaveBeenCalled();
    expect(tx.homepageBanner.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ imageUrl: current.imageUrl }) }),
    );
  });
});

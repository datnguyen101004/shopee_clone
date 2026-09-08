import { AdminInvalidInputError, AdminNotFoundError } from '../admin/admin.errors';
import { HomepageBannerMediaService } from './homepage-banner-media.service';

const userId = '00000000-0000-4000-8000-000000000001';
const checksum = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

describe('HomepageBannerMediaService', () => {
  it('creates an admin upload intent under the dedicated banner prefix', async () => {
    const prisma = {
      homepageBannerMediaAsset: {
        create: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000101',
          storageKey: 'admin-banner-media/00000000-0000-4000-8000-000000000101.png',
        }),
        update: jest.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000101' }),
        deleteMany: jest.fn(),
      },
    };
    const storage = {
      createUploadUrl: jest.fn().mockResolvedValue({
        url: 'https://s3.example.test/signed',
        expiresAt: new Date('2026-09-08T10:05:00.000Z'),
      }),
    };
    const service = new HomepageBannerMediaService(prisma as never, storage as never);

    await expect(
      service.createUploadIntent(userId, { mimeType: 'image/png', byteSize: 24, checksumSha256: checksum }),
    ).resolves.toMatchObject({
      mediaId: '00000000-0000-4000-8000-000000000101',
      upload: { method: 'PUT', url: 'https://s3.example.test/signed' },
    });
    expect(storage.createUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^admin-banner-media\//),
      'image/png',
      checksum,
      'admin-banner-media',
    );
    expect(prisma.homepageBannerMediaAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'PENDING_UPLOAD', uploaderId: userId }) }),
    );
  });

  it('rejects completion for another uploader or an expired upload before touching storage', async () => {
    const prisma = { homepageBannerMediaAsset: { findFirst: jest.fn().mockResolvedValue(null) } };
    const storage = { verifyUploadedObject: jest.fn() };
    const service = new HomepageBannerMediaService(prisma as never, storage as never);

    await expect(service.completeUpload('another-user', 'media-id')).rejects.toBeInstanceOf(AdminNotFoundError);
    expect(storage.verifyUploadedObject).not.toHaveBeenCalled();
  });

  it('refuses to stage an object when checksum or dimensions cannot be verified', async () => {
    const prisma = {
      homepageBannerMediaAsset: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'media-id',
          uploaderId: userId,
          storageKey: 'admin-banner-media/media-id.png',
          mimeType: 'image/png',
          byteSize: 24,
          checksumSha256: checksum,
          state: 'PENDING_UPLOAD',
          width: null,
          height: null,
          expiresAt: null,
        }),
      },
    };
    const storage = { verifyUploadedObject: jest.fn().mockResolvedValue(null) };
    const service = new HomepageBannerMediaService(prisma as never, storage as never);

    await expect(service.completeUpload(userId, 'media-id')).rejects.toBeInstanceOf(AdminInvalidInputError);
    expect(storage.verifyUploadedObject).toHaveBeenCalledWith(
      'admin-banner-media/media-id.png',
      expect.objectContaining({ byteSize: 24, checksumSha256: checksum }),
      'admin-banner-media',
    );
  });

  it('claims expired media as DELETING before removing its object for race-safe cleanup', async () => {
    const candidate = {
      id: 'media-id',
      storageKey: 'admin-banner-media/media-id.png',
      state: 'STAGED',
      uploadExpiresAt: null,
      expiresAt: new Date(Date.now() - 1_000),
    };
    const tx = {
      homepageBannerMediaAsset: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      homepageBannerMediaAsset: {
        findMany: jest.fn().mockResolvedValue([candidate]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const storage = { remove: jest.fn().mockResolvedValue(undefined) };
    const service = new HomepageBannerMediaService(prisma as never, storage as never);

    await service.cleanupExpired();

    expect(tx.homepageBannerMediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: candidate.id, state: 'STAGED' }),
        data: { state: 'DELETING' },
      }),
    );
    expect(storage.remove).toHaveBeenCalledWith(candidate.storageKey, 'admin-banner-media');
    expect(prisma.homepageBannerMediaAsset.deleteMany).toHaveBeenCalledWith({
      where: { id: candidate.id, state: 'DELETING' },
    });
  });
});

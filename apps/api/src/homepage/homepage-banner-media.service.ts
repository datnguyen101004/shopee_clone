import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type {
  AdminBannerMediaCompletionResponse,
  AdminBannerMediaMimeType,
  AdminBannerMediaUploadIntentRequest,
  AdminBannerMediaUploadIntentResponse,
} from '@shopee-clone/contracts';
import { randomUUID } from 'node:crypto';

import type { Prisma } from '../generated/prisma/client';
import { AdminInvalidInputError, AdminNotFoundError } from '../admin/admin.errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  SellerProductMediaStorage,
  publicManagedMediaUrl,
} from '../seller-products/seller-product-media.storage';

export const ADMIN_BANNER_MEDIA_PREFIX = 'admin-banner-media';
const MAX_BYTES = 5 * 1024 * 1024;
const STAGED_MEDIA_TTL_MS = 24 * 60 * 60 * 1000;
const UPLOAD_TTL_MS = 5 * 60 * 1000;
const extensions: Record<AdminBannerMediaMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function isChecksum(value: string): boolean {
  return /^[A-Za-z0-9+/]{43}=$/.test(value);
}

@Injectable()
export class HomepageBannerMediaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SellerProductMediaStorage) private readonly storage: SellerProductMediaStorage,
  ) {}

  async createUploadIntent(
    userId: string,
    input: AdminBannerMediaUploadIntentRequest,
  ): Promise<AdminBannerMediaUploadIntentResponse> {
    const extension = extensions[input.mimeType];
    if (
      !extension ||
      !Number.isSafeInteger(input.byteSize) ||
      input.byteSize < 1 ||
      input.byteSize > MAX_BYTES ||
      !isChecksum(input.checksumSha256)
    ) {
      throw new AdminInvalidInputError('Banner image upload intent is invalid.');
    }

    const mediaId = randomUUID();
    const storageKey = `${ADMIN_BANNER_MEDIA_PREFIX}/${mediaId}.${extension}`;
    const pending = await this.prisma.homepageBannerMediaAsset.create({
      data: {
        id: mediaId,
        uploaderId: userId,
        storageKey,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        checksumSha256: input.checksumSha256,
        uploadExpiresAt: new Date(Date.now() + UPLOAD_TTL_MS),
        state: 'PENDING_UPLOAD',
      },
    });

    try {
      const signed = await this.storage.createUploadUrl(
        storageKey,
        input.mimeType,
        input.checksumSha256,
        ADMIN_BANNER_MEDIA_PREFIX,
      );
      const updated = await this.prisma.homepageBannerMediaAsset.update({
        where: { id: pending.id },
        data: { uploadExpiresAt: signed.expiresAt },
      });
      return {
        mediaId: updated.id,
        upload: {
          url: signed.url,
          method: 'PUT',
          headers: {
            'Content-Type': input.mimeType,
            'x-amz-checksum-sha256': input.checksumSha256,
          },
          expiresAt: signed.expiresAt.toISOString(),
        },
      };
    } catch (error) {
      await this.prisma.homepageBannerMediaAsset.deleteMany({
        where: { id: pending.id, state: 'PENDING_UPLOAD' },
      });
      throw error;
    }
  }

  async completeUpload(userId: string, mediaId: string): Promise<AdminBannerMediaCompletionResponse> {
    const media = await this.prisma.homepageBannerMediaAsset.findFirst({
      where: {
        id: mediaId,
        uploaderId: userId,
        OR: [
          { state: 'PENDING_UPLOAD', uploadExpiresAt: { gt: new Date() } },
          { state: 'STAGED', expiresAt: { gt: new Date() } },
        ],
      },
    });
    if (!media) throw new AdminNotFoundError('Banner media');
    if (media.state === 'STAGED' && media.width !== null && media.height !== null && media.expiresAt) {
      return this.completionResponse(media);
    }
    if (!media.checksumSha256) throw new AdminInvalidInputError('Banner media upload is unavailable.');
    const verified = await this.storage.verifyUploadedObject(
      media.storageKey,
      {
        mimeType: media.mimeType,
        byteSize: media.byteSize,
        checksumSha256: media.checksumSha256,
      },
      ADMIN_BANNER_MEDIA_PREFIX,
    );
    if (!verified) throw new AdminInvalidInputError('Banner image could not be verified. Please retry the upload.');

    const expiresAt = new Date(Date.now() + STAGED_MEDIA_TTL_MS);
    const updated = await this.prisma.homepageBannerMediaAsset.updateMany({
      where: { id: media.id, uploaderId: userId, state: 'PENDING_UPLOAD' },
      data: {
        state: 'STAGED',
        width: verified.width,
        height: verified.height,
        expiresAt,
        uploadExpiresAt: null,
      },
    });
    if (updated.count === 0) {
      const existing = await this.prisma.homepageBannerMediaAsset.findFirst({
        where: { id: media.id, uploaderId: userId, state: 'STAGED' },
      });
      if (existing?.width !== null && existing?.height !== null && existing?.expiresAt) {
        return this.completionResponse(existing);
      }
      throw new AdminInvalidInputError('Banner media upload is unavailable.');
    }
    const complete = await this.prisma.homepageBannerMediaAsset.findUnique({ where: { id: media.id } });
    if (!complete) throw new AdminNotFoundError('Banner media');
    return this.completionResponse(complete);
  }

  async requireStagedAsset(
    client: PrismaService | Prisma.TransactionClient,
    userId: string,
    mediaId: string,
  ) {
    const media = await client.homepageBannerMediaAsset.findFirst({
      where: {
        id: mediaId,
        uploaderId: userId,
        bannerId: null,
        state: 'STAGED',
        expiresAt: { gt: new Date() },
      },
    });
    if (!media) throw new AdminInvalidInputError('Banner image upload is missing or expired.');
    return media;
  }

  publicUrl(storageKey: string): string {
    const imageUrl = publicManagedMediaUrl(storageKey, ADMIN_BANNER_MEDIA_PREFIX);
    if (!imageUrl) throw new AdminInvalidInputError('Banner media delivery is unavailable.');
    return imageUrl;
  }

  async attachAsset(
    client: PrismaService | Prisma.TransactionClient,
    mediaId: string,
    bannerId: string,
  ): Promise<void> {
    const updated = await client.homepageBannerMediaAsset.updateMany({
      where: { id: mediaId, state: 'STAGED', bannerId: null },
      data: { state: 'ATTACHED', bannerId, expiresAt: null },
    });
    if (updated.count !== 1) throw new AdminInvalidInputError('Banner image upload is no longer available.');
  }

  async detachAsset(
    client: PrismaService | Prisma.TransactionClient,
    mediaId: string,
  ): Promise<void> {
    await client.homepageBannerMediaAsset.updateMany({
      where: { id: mediaId, state: 'ATTACHED' },
      data: { state: 'STAGED', bannerId: null, expiresAt: new Date() },
    });
  }

  @Cron('*/15 * * * *')
  async cleanupExpired(): Promise<void> {
    const now = new Date();
    const candidates = await this.prisma.homepageBannerMediaAsset.findMany({
      where: {
        OR: [
          { state: 'PENDING_UPLOAD', uploadExpiresAt: { lt: now } },
          { state: 'STAGED', expiresAt: { lt: now } },
          { state: 'DELETING' },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { id: true, storageKey: true, state: true, uploadExpiresAt: true, expiresAt: true },
    });
    const claimed = await this.prisma.$transaction(async (tx) => {
      const rows: Array<{ id: string; storageKey: string }> = [];
      for (const candidate of candidates) {
        if (candidate.state === 'DELETING') {
          rows.push({ id: candidate.id, storageKey: candidate.storageKey });
          continue;
        }
        const expiry = candidate.state === 'PENDING_UPLOAD' ? candidate.uploadExpiresAt : candidate.expiresAt;
        if (!expiry || expiry >= now) continue;
        const updated = await tx.homepageBannerMediaAsset.updateMany({
          where: { id: candidate.id, state: candidate.state, ...(candidate.state === 'PENDING_UPLOAD' ? { uploadExpiresAt: { lt: now } } : { expiresAt: { lt: now } }) },
          data: { state: 'DELETING' },
        });
        if (updated.count === 1) rows.push({ id: candidate.id, storageKey: candidate.storageKey });
      }
      return rows;
    });
    for (const item of claimed) {
      try {
        await this.storage.remove(item.storageKey, ADMIN_BANNER_MEDIA_PREFIX);
        await this.prisma.homepageBannerMediaAsset.deleteMany({ where: { id: item.id, state: 'DELETING' } });
      } catch {
        // Keep the DELETING row so the next scheduled sweep retries the object removal.
      }
    }
  }

  private completionResponse(media: {
    id: string;
    mimeType: string;
    byteSize: number;
    width: number | null;
    height: number | null;
    storageKey: string;
    expiresAt: Date | null;
  }): AdminBannerMediaCompletionResponse {
    if (media.width === null || media.height === null || !media.expiresAt) {
      throw new AdminInvalidInputError('Banner media upload is unavailable.');
    }
    return {
      id: media.id,
      mimeType: media.mimeType as AdminBannerMediaMimeType,
      byteSize: media.byteSize,
      width: media.width,
      height: media.height,
      imageUrl: this.publicUrl(media.storageKey),
      expiresAt: media.expiresAt.toISOString(),
    };
  }
}

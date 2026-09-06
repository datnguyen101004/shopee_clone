import {
  generateSellerProductCombinations,
  isSellerProductLifecycleRequest,
  isSellerProductUpsertRequest,
  normalizeSellerProductText,
  type SellerProductDetail,
  type SellerProductLifecycle,
  type SellerProductPage,
  type SellerProductPageQuery,
  type SellerProductUpsertRequest,
  type SellerProductCampaignEntry,
} from '@shopee-clone/contracts';
import { campaignLifecycleAt } from '@shopee-clone/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { InventoryAdjustmentReason, MarketplaceCampaignParticipationState, ProductModerationStatus, ProductStatus, ShopOnboardingStatus, ShopStatus, VariantStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { SellerProductConflictError, SellerProductInputError, SellerProductMediaError, SellerProductNotFoundError, SellerProductUnavailableError } from './seller-products.errors';
import { SellerProductMediaStorage, stableProductMediaUrl } from './seller-product-media.storage';

const detailInclude = {
  category: true,
  images: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] },
  attributes: { include: { definition: true } },
  optionGroups: { include: { values: { include: { image: true }, orderBy: { sortOrder: 'asc' as const } } }, orderBy: { sortOrder: 'asc' as const } },
  variants: {
    include: { inventory: true, optionValues: { include: { optionValue: { include: { group: true, image: true } } } } },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
} satisfies Prisma.ProductInclude;
type ProductDetailRow = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;
type Transaction = Prisma.TransactionClient;

function lifecycle(status: ProductStatus): SellerProductLifecycle {
  if (status === ProductStatus.ACTIVE) return 'published';
  if (status === ProductStatus.HIDDEN) return 'hidden';
  if (status === ProductStatus.ARCHIVED) return 'archived';
  return 'draft';
}

function moderation(status: ProductModerationStatus): 'active' | 'suspended' {
  return status === ProductModerationStatus.SUSPENDED ? 'suspended' : 'active';
}

function safeMoney(value: bigint): number {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < 0) throw new SellerProductUnavailableError();
  return numberValue;
}

function mapDetail(product: ProductDetailRow): SellerProductDetail {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    attributes: product.attributes.map((attribute) => ({ definitionId: attribute.definitionId, value: attribute.value })),
    media: product.images.map((image) => ({ id: image.id, url: image.url, altText: image.altText, sortOrder: image.sortOrder, variantId: image.variantId })),
    packageLengthMm: product.packageLengthMm,
    packageWidthMm: product.packageWidthMm,
    packageHeightMm: product.packageHeightMm,
    optionGroups: product.optionGroups.map((group) => ({ name: group.name, values: group.values.map((value) => value.value) })),
    optionValueMedia: product.optionGroups.filter((group) => group.sortOrder === 0).flatMap((group) => group.values.map((value) => ({ groupIndex: 0, value: value.value, mediaRef: value.image ? { imageId: value.image.id } : null }))),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      combination: variant.optionValues
        .sort((left, right) => left.optionValue.group.sortOrder - right.optionValue.group.sortOrder || left.optionValue.sortOrder - right.optionValue.sortOrder)
        .map((entry) => entry.optionValue.value),
      sku: variant.sku,
      priceMinor: safeMoney(variant.priceMinor),
      compareAtPriceMinor: variant.compareAtPriceMinor === null ? null : safeMoney(variant.compareAtPriceMinor),
      stock: variant.inventory?.quantityOnHand ?? 0,
      weightGrams: variant.weightGrams,
      maxPurchaseQuantity: variant.maxPurchaseQuantity,
      active: variant.status === VariantStatus.ACTIVE && variant.deletedAt === null,
      imageUrl: variant.optionValues.find((entry) => entry.optionValue.group.sortOrder === 0)?.optionValue.image?.url ?? null,
      inventoryVersion: variant.inventory?.version ?? 0,
    })),
    lifecycle: lifecycle(product.status),
    moderationStatus: moderation(product.moderationStatus),
    moderationReason: product.moderationStatus === ProductModerationStatus.SUSPENDED ? 'Sản phẩm đang bị tạm ngưng bởi kiểm duyệt.' : null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function currentCombinationName(combination: string[]) { return combination.join(' · ') || 'Mặc định'; }
function combinationKey(combination: string[]) { return combination.join('\u001f'); }
const excludedSellerCategorySlugs = new Set(['mobile-accessories', 'kitchen-appliances']);

function slugifyProductName(value: string): string {
  const ascii = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd');
  return ascii.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'san-pham';
}

type ResolvedMedia = {
  url: string;
  altText: string | null;
  sortOrder: number;
  aliases: string[];
  assetId: string | null;
};

function mediaReferenceKey(reference: { assetId?: string; imageId?: string } | null | undefined): string | null {
  if (reference?.assetId) return `asset:${reference.assetId}`;
  if (reference?.imageId) return `image:${reference.imageId}`;
  return null;
}

export function generatedProductSlug(name: string): string {
  const hash = createHash('sha256').update(`${new Date().toISOString()}:${randomUUID()}`).digest('hex').slice(0, 10);
  return `${slugifyProductName(name)}-${hash}`;
}

export function generatedVariantSku(productSlug: string, combination: string[]): string {
  const suffix = createHash('sha256').update(`${productSlug}:${combination.join('\u001f')}`).digest('hex').slice(0, 12).toUpperCase();
  return `SKU-${suffix}`;
}

function normalizedInput(raw: SellerProductUpsertRequest): SellerProductUpsertRequest {
  const name = normalizeSellerProductText(raw.name, 240);
  if (!name) throw new SellerProductInputError(['name']);
  return {
    ...raw,
    name,
    description: raw.description.trim(),
    attributes: raw.attributes.map((attribute) => ({ ...attribute, value: attribute.value.trim() })),
    media: raw.media.map((media) => ({ ...media, ...(media.url ? { url: media.url.trim() } : {}), altText: media.altText?.trim() || null })),
    optionGroups: raw.optionGroups.map((group) => ({ name: group.name.trim(), values: group.values.map((value) => value.trim()) })),
    optionValueMedia: raw.optionValueMedia?.map((entry) => ({ ...entry, value: entry.value.trim(), mediaRef: entry.mediaRef ? { ...entry.mediaRef } : null })),
    variants: raw.variants.map((variant) => ({ ...variant, combination: variant.combination.map((value) => value.trim()) })),
  };
}

@Injectable()
export class SellerProductsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InventoryService) private readonly inventory: InventoryService = null as never,
    @Inject(SellerProductMediaStorage) private readonly mediaStorage: SellerProductMediaStorage = new SellerProductMediaStorage(),
  ) {}

  async categories() {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true, deletedAt: null },
      include: { children: { where: { isActive: true, deletedAt: null }, select: { id: true } }, attributeDefinitions: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.filter((category) => !excludedSellerCategorySlugs.has(category.slug)).map((category) => ({
      id: category.id, name: category.name, slug: category.slug, parentId: category.parentId, isLeaf: category.children.length === 0,
      attributes: category.attributeDefinitions.map((definition) => ({ id: definition.id, code: definition.code, label: definition.label, required: definition.isRequired, allowedValues: Array.isArray(definition.allowedValues) ? definition.allowedValues.filter((value): value is string => typeof value === 'string') : null })),
    }));
  }

  async list(userId: string, query: SellerProductPageQuery): Promise<SellerProductPage> {
    const shop = await this.requireShop(userId);
    const now = new Date();
    const campaignTypeFilter = query.campaignTypeCode ? { code: query.campaignTypeCode } : undefined;
    const campaignWindow: Prisma.MarketplaceCampaignWhereInput | undefined = query.campaign === 'ACTIVE'
      ? { publishedAt: { not: null }, cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now } }
      : query.campaign === 'UPCOMING'
        ? { publishedAt: { not: null }, cancelledAt: null, startsAt: { gt: now } }
        : query.campaign === 'HISTORY'
          ? { OR: [{ cancelledAt: { not: null } }, { endsAt: { lte: now } }] }
          : undefined;
    const campaignFilter: Prisma.ProductWhereInput = campaignTypeFilter || campaignWindow
      ? {
          sellerCampaignProducts: {
            some: {
              participation: {
                state: { in: [MarketplaceCampaignParticipationState.JOINED, MarketplaceCampaignParticipationState.LOCKED] },
                campaign: {
                  ...(campaignTypeFilter ? { type: campaignTypeFilter } : {}),
                  ...(campaignWindow ?? {}),
                },
              },
            },
          },
        }
      : {};
    const where: Prisma.ProductWhereInput = {
      shopId: shop.id,
      deletedAt: null,
      ...(query.lifecycle ? { status: this.statusFor(query.lifecycle) } : {}),
      ...campaignFilter,
    };
    const rows = await this.prisma.product.findMany({
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      where,
      include: { category: true, images: { take: 1, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }, variants: { include: { inventory: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    const page = rows.slice(0, query.limit);
    const productIds = page.map((product) => product.id);
    const [campaignRows, campaignCounts, promotionRows] = await Promise.all([
      productIds.length
        ? this.prisma.sellerCampaignProduct.findMany({
            where: { productId: { in: productIds }, participation: { state: { in: [MarketplaceCampaignParticipationState.JOINED, MarketplaceCampaignParticipationState.LOCKED] } } },
            include: { participation: { include: { campaign: { include: { type: true } } } } },
            orderBy: [{ acceptedAt: 'desc' }, { productId: 'asc' }],
            // Four rows per product is enough to render three chips and a
            // truthful bounded "more" indicator without an N+1 query.
            take: Math.min(productIds.length * 4, 200),
          })
        : [],
      productIds.length
        ? this.prisma.sellerCampaignProduct.groupBy({
            by: ['productId'],
            where: { productId: { in: productIds }, participation: { state: { in: [MarketplaceCampaignParticipationState.JOINED, MarketplaceCampaignParticipationState.LOCKED] } } },
            _count: { _all: true },
          })
        : [],
      productIds.length
        ? this.prisma.shopDiscountProduct.findMany({
            where: {
              productId: { in: productIds },
              campaign: { isEnabled: true, archivedAt: null, endsAt: { gt: now } },
            },
            select: { productId: true, campaign: { select: { startsAt: true } } },
          })
        : [],
    ]);
    const campaignByProduct = new Map<string, typeof campaignRows>();
    for (const row of campaignRows) {
      const list = campaignByProduct.get(row.productId) ?? [];
      list.push(row);
      campaignByProduct.set(row.productId, list);
    }
    const campaignCountByProduct = new Map(campaignCounts.map((row) => [row.productId, row._count._all]));
    const promotionByProduct = new Map<string, { activeCount: number; upcomingCount: number }>();
    for (const row of promotionRows) {
      const summary = promotionByProduct.get(row.productId) ?? { activeCount: 0, upcomingCount: 0 };
      if (row.campaign.startsAt <= now) summary.activeCount += 1;
      else summary.upcomingCount += 1;
      promotionByProduct.set(row.productId, summary);
    }
    return {
      items: page.map((product) => {
        const campaignEntries = campaignByProduct.get(product.id) ?? [];
        const campaigns = campaignEntries.slice(0, 3).map((entry) => {
          const campaign = entry.participation.campaign;
          const state = entry.participation.state;
          const at = campaignLifecycleAt(campaign, now);
          return {
            campaignId: campaign.id,
            typeCode: campaign.type.code,
            typeLabel: campaign.type.displayName,
            title: campaign.name,
            state,
            group: at === 'ACTIVE' ? 'ACTIVE' as const : at === 'SCHEDULED' || at === 'ENROLLMENT_OPEN' ? 'UPCOMING_LOCKED' as const : 'HISTORY' as const,
            startsAt: campaign.startsAt.toISOString(),
            endsAt: campaign.endsAt.toISOString(),
            discountBasisPoints: entry.discountBasisPoints,
          };
        });
        const prices = product.variants.map((variant) => safeMoney(variant.priceMinor));
        return {
          id: product.id,
          slug: product.slug,
          name: product.name,
          categoryName: product.category.name,
          lifecycle: lifecycle(product.status),
          moderationStatus: moderation(product.moderationStatus),
          primaryMediaUrl: product.images[0]?.url ?? null,
          variantCount: product.variants.length,
          stockQuantity: product.variants.reduce((total, variant) => total + Math.max(0, (variant.inventory?.quantityOnHand ?? 0) - (variant.inventory?.quantityReserved ?? 0)), 0),
          operationalPriceRange: { minPriceMinor: prices.length ? Math.min(...prices) : null, maxPriceMinor: prices.length ? Math.max(...prices) : null },
          ...(promotionByProduct.has(product.id) ? { sellerPromotionSummary: promotionByProduct.get(product.id) } : {}),
          ...(campaigns.length ? { campaigns } : {}),
          ...((campaignCountByProduct.get(product.id) ?? 0) > 3
            ? { additionalCampaignCount: (campaignCountByProduct.get(product.id) ?? 0) - 3 }
            : {}),
          updatedAt: product.updatedAt.toISOString(),
        };
      }),
      nextCursor: rows.length > query.limit ? page.at(-1)?.id ?? null : null,
    };
  }

  async read(userId: string, productId: string): Promise<SellerProductDetail> {
    const product = await this.requireProduct(userId, productId);
    const detail = mapDetail(product);
    const campaignRows = await this.prisma.sellerCampaignProduct.findMany({
      where: { productId, participation: { shopId: product.shopId } },
      include: { participation: { include: { campaign: { include: { type: true } } } } },
      orderBy: { acceptedAt: 'desc' },
      take: 20,
    });
    const campaigns: SellerProductCampaignEntry[] = campaignRows.map((entry) => {
      const campaign = entry.participation.campaign;
      const lifecycleValue = campaignLifecycleAt(campaign);
      const group = lifecycleValue === 'ACTIVE' ? 'ACTIVE' : lifecycleValue === 'SCHEDULED' || lifecycleValue === 'ENROLLMENT_OPEN' ? 'UPCOMING_LOCKED' : 'HISTORY';
      const eligibility = lifecycleValue === 'ENDED' ? 'ENDED' : lifecycleValue === 'CANCELLED' ? 'CANCELLED' : entry.participation.state === 'WITHDRAWN' ? 'WITHDRAWN' : 'ELIGIBLE';
      const basePriceMinor = product.variants.reduce((min, variant) => Math.min(min, safeMoney(variant.priceMinor)), Number.MAX_SAFE_INTEGER);
      const effectivePriceMinor = lifecycleValue === 'ACTIVE' && basePriceMinor !== Number.MAX_SAFE_INTEGER
        ? Math.floor(basePriceMinor * (10_000 - entry.discountBasisPoints) / 10_000)
        : null;
      return { campaignId: campaign.id, type: { code: campaign.type.code, displayName: campaign.type.displayName, description: campaign.type.description, importanceClass: campaign.importanceClassSnapshot ?? campaign.type.importanceClass, policyVersion: campaign.policyVersionSnapshot ?? campaign.type.policyVersion, presentationKey: (campaign.presentationKeySnapshot ?? campaign.type.presentationKey) as never, productOrderKey: (campaign.productOrderKeySnapshot ?? campaign.type.productOrderKey) as never, rankingProfileKey: (campaign.rankingProfileKeySnapshot ?? campaign.type.rankingProfileKey) as never, enabled: campaign.type.isEnabled }, title: campaign.name, state: entry.participation.state, group, startsAt: campaign.startsAt.toISOString(), endsAt: campaign.endsAt.toISOString(), discountBasisPoints: entry.discountBasisPoints, effectivePriceMinor, eligibility, reason: null, href: `/campaigns/${encodeURIComponent(campaign.id)}` };
    });
    const prices = detail.variants.map((variant) => variant.priceMinor);
    return { ...detail, campaigns, operationalSummary: { variantCount: detail.variants.length, stockQuantity: detail.variants.reduce((sum, variant) => sum + Math.max(0, variant.stock), 0), soldCount: product.soldCount, ratingAverageBasisPoints: product.ratingAverageBasisPoints, ratingCount: product.ratingCount, minPriceMinor: prices.length ? Math.min(...prices) : null, maxPriceMinor: prices.length ? Math.max(...prices) : null } };
  }

  async stageMedia(userId: string, input: { storageKey: string; mimeType: string; byteSize: number; width: number; height: number }) {
    const shop = await this.requireShop(userId);
    return this.prisma.sellerProductMediaAsset.create({ data: { uploaderId: userId, shopId: shop.id, storageKey: input.storageKey, mimeType: input.mimeType, byteSize: input.byteSize, width: input.width, height: input.height, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
  }

  async createMediaUploadIntent(userId: string, input: { mimeType: string; byteSize: number; checksumSha256: string }) {
    if (process.env.AWS_SELLER_PRODUCT_MEDIA_UPLOAD_ENABLED === 'false') throw new SellerProductMediaError('seller-product-media-upload-disabled');
    const shop = await this.requireShop(userId);
    const extension = input.mimeType === 'image/jpeg' ? 'jpg' : input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : null;
    if (!extension || !Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > 5 * 1024 * 1024 || !/^[A-Za-z0-9+/]{43}=$/.test(input.checksumSha256)) throw new SellerProductMediaError('invalid-seller-product-upload-intent');
    const mediaId = randomUUID();
    const storageKey = `${process.env.AWS_S3_PREFIX?.trim() || 'seller-product-media'}/${mediaId}.${extension}`;
    const pending = await this.prisma.sellerProductMediaAsset.create({ data: { id: mediaId, uploaderId: userId, shopId: shop.id, storageKey, mimeType: input.mimeType, byteSize: input.byteSize, checksumSha256: input.checksumSha256, uploadExpiresAt: new Date(Date.now() + 300_000), state: 'PENDING_UPLOAD' } });
    try {
      const signed = await this.mediaStorage.createUploadUrl(storageKey, input.mimeType, input.checksumSha256);
      const updated = await this.prisma.sellerProductMediaAsset.update({ where: { id: pending.id }, data: { uploadExpiresAt: signed.expiresAt } });
      return { mediaId: updated.id, upload: { url: signed.url, method: 'PUT' as const, headers: { 'Content-Type': input.mimeType, 'x-amz-checksum-sha256': input.checksumSha256 }, expiresAt: signed.expiresAt.toISOString() } };
    } catch (error) {
      await this.prisma.sellerProductMediaAsset.deleteMany({ where: { id: pending.id, state: 'PENDING_UPLOAD' } });
      throw error;
    }
  }

  async completeMediaUpload(userId: string, mediaId: string) {
    const media = await this.prisma.sellerProductMediaAsset.findFirst({ where: { id: mediaId, uploaderId: userId, state: { in: ['PENDING_UPLOAD', 'STAGED'] } } });
    if (!media) throw new SellerProductMediaError('seller-product-media-unavailable');
    if (media.state === 'STAGED' && media.width !== null && media.height !== null && media.expiresAt) return this.mediaCompletionResponse(media);
    if (!media.checksumSha256) throw new SellerProductMediaError('seller-product-media-unavailable');
    const verified = await this.mediaStorage.verifyUploadedObject(media.storageKey, { mimeType: media.mimeType, byteSize: media.byteSize, checksumSha256: media.checksumSha256 });
    if (!verified) throw new SellerProductMediaError('seller-product-media-upload-invalid');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const updated = await this.prisma.sellerProductMediaAsset.updateMany({ where: { id: media.id, uploaderId: userId, state: 'PENDING_UPLOAD' }, data: { state: 'STAGED', width: verified.width, height: verified.height, expiresAt, uploadExpiresAt: null } });
    if (updated.count === 0) {
      const existing = await this.prisma.sellerProductMediaAsset.findFirst({ where: { id: media.id, uploaderId: userId, state: 'STAGED' } });
      if (existing && existing.width !== null && existing.height !== null && existing.expiresAt) return this.mediaCompletionResponse(existing);
      throw new SellerProductMediaError('seller-product-media-unavailable');
    }
    const complete = await this.prisma.sellerProductMediaAsset.findUnique({ where: { id: media.id } });
    if (!complete) throw new SellerProductMediaError('seller-product-media-unavailable');
    return this.mediaCompletionResponse(complete);
  }

  private mediaCompletionResponse(media: { id: string; mimeType: string; byteSize: number; width: number | null; height: number | null; expiresAt: Date | null }) {
    if (media.width === null || media.height === null || !media.expiresAt) throw new SellerProductMediaError('seller-product-media-unavailable');
    return { id: media.id, mimeType: media.mimeType, byteSize: media.byteSize, width: media.width, height: media.height, previewUrl: `/api/v1/seller/products/media/${media.id}/preview`, expiresAt: media.expiresAt.toISOString() };
  }

  async stagedMedia(userId: string, mediaId: string) {
    return this.prisma.sellerProductMediaAsset.findFirst({ where: { id: mediaId, uploaderId: userId, state: 'STAGED', expiresAt: { gt: new Date() } } });
  }

  async attachedMedia(mediaId: string) {
    return this.prisma.sellerProductMediaAsset.findFirst({ where: { id: mediaId, state: 'ATTACHED', product: { deletedAt: null } }, select: { id: true, storageKey: true, mimeType: true } });
  }

  async cleanupExpiredMedia(storage: { remove(key: string): Promise<void> }): Promise<number> {
    const expired = await this.prisma.sellerProductMediaAsset.findMany({ where: { state: 'STAGED', expiresAt: { lt: new Date() } }, select: { id: true, storageKey: true } });
    for (const item of expired) await storage.remove(item.storageKey);
    if (expired.length) await this.prisma.sellerProductMediaAsset.deleteMany({ where: { id: { in: expired.map((item) => item.id) }, state: 'STAGED' } });
    return expired.length;
  }

  async cleanupExpiredPendingMedia(storage: { remove(key: string): Promise<void> }): Promise<number> {
    const expired = await this.prisma.sellerProductMediaAsset.findMany({ where: { state: 'PENDING_UPLOAD', uploadExpiresAt: { lt: new Date() } }, select: { id: true, storageKey: true } });
    for (const item of expired) await storage.remove(item.storageKey);
    if (expired.length) await this.prisma.sellerProductMediaAsset.deleteMany({ where: { id: { in: expired.map((item) => item.id) }, state: 'PENDING_UPLOAD' } });
    return expired.length;
  }

  async create(userId: string, rawInput: SellerProductUpsertRequest): Promise<SellerProductDetail> {
    const input = this.acceptInput(rawInput);
    return this.prisma.$transaction(async (transaction) => {
      const shop = await this.requireShop(userId, transaction);
      await this.validateCategoryInput(transaction, input);
      const resolvedMedia = await this.resolveMedia(transaction, userId, shop.id, null, input);
      try {
        const product = await transaction.product.create({
          data: { shopId: shop.id, categoryId: input.categoryId, slug: generatedProductSlug(input.name), name: input.name, description: input.description, status: ProductStatus.DRAFT, packageLengthMm: input.packageLengthMm, packageWidthMm: input.packageWidthMm, packageHeightMm: input.packageHeightMm, attributes: { create: input.attributes.map((attribute) => ({ definitionId: attribute.definitionId, value: attribute.value })) }, optionGroups: { create: input.optionGroups.map((group, index) => ({ name: group.name, sortOrder: index, values: { create: group.values.map((value, valueIndex) => ({ value, sortOrder: valueIndex })) } })) } },
          include: detailInclude,
        });
        const mediaMap = await this.replaceProductMedia(transaction, product.id, resolvedMedia);
        await this.applyOptionValueMedia(transaction, product.id, input, mediaMap);
        await this.replaceVariants(transaction, product.id, product.slug, shop.id, input, [], userId);
        return mapDetail(await this.findDetail(transaction, product.id));
      } catch (error) {
        if (error instanceof SellerProductInputError || error instanceof SellerProductConflictError) throw error;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new SellerProductConflictError(['slugOrSku']);
        throw error;
      }
    });
  }

  async update(userId: string, productId: string, rawInput: SellerProductUpsertRequest): Promise<SellerProductDetail> {
    const input = this.acceptInput(rawInput);
    return this.prisma.$transaction(async (transaction) => {
      const current = await this.requireProduct(userId, productId, transaction);
      if (current.status === ProductStatus.ARCHIVED) throw new SellerProductConflictError(['lifecycle']);
      // Reuse every existing variant by combination. Deleting an apparently
      // unprotected variant is unsafe because inventory adjustments retain a
      // RESTRICT foreign-key history; replaceVariants marks removed variants
      // inactive instead.
      const protectedVariants = await transaction.productVariant.findMany({ where: { productId }, select: { id: true, sku: true, combinationKey: true } });
      await this.validateCategoryInput(transaction, input);
      const reuseMedia = this.existingMediaUnchanged(current.images, input.media);
      const resolvedMedia = reuseMedia ? null : await this.resolveMedia(transaction, userId, current.shopId, productId, input);
      try {
        await transaction.product.update({ where: { id: productId }, data: { categoryId: input.categoryId, name: input.name, description: input.description, packageLengthMm: input.packageLengthMm, packageWidthMm: input.packageWidthMm, packageHeightMm: input.packageHeightMm, attributes: { deleteMany: {}, create: input.attributes.map((attribute) => ({ definitionId: attribute.definitionId, value: attribute.value })) }, optionGroups: { deleteMany: {}, create: input.optionGroups.map((group, index) => ({ name: group.name, sortOrder: index, values: { create: group.values.map((value, valueIndex) => ({ value, sortOrder: valueIndex })) } })) } } });
        const mediaMap = reuseMedia
          ? this.imageAliasesFromCurrent(current.images)
          : await this.replaceProductMedia(transaction, productId, resolvedMedia!);
        await this.applyOptionValueMedia(transaction, productId, input, mediaMap);
        await this.replaceVariants(transaction, productId, current.slug, current.shopId, input, protectedVariants, userId);
        return mapDetail(await this.findDetail(transaction, productId));
      } catch (error) {
        if (error instanceof SellerProductInputError || error instanceof SellerProductConflictError) throw error;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new SellerProductConflictError(['slugOrSku']);
        throw error;
      }
    });
  }

  async transition(userId: string, productId: string, input: unknown): Promise<SellerProductDetail> {
    if (!isSellerProductLifecycleRequest(input)) throw new SellerProductInputError(['lifecycle']);
    return this.prisma.$transaction(async (transaction) => {
      const product = await this.requireProduct(userId, productId, transaction);
      if (product.status === ProductStatus.ARCHIVED) throw new SellerProductConflictError(['lifecycle']);
      if (input.lifecycle === 'published') this.assertPublishable(product);
      await transaction.product.update({ where: { id: productId }, data: { status: this.statusFor(input.lifecycle) } });
      return mapDetail(await this.findDetail(transaction, productId));
    });
  }

  async deleteDraft(userId: string, productId: string): Promise<void> {
    return this.prisma.$transaction(async (transaction) => {
      const shop = await this.requireShop(userId, transaction);
      const product = await transaction.product.findFirst({ where: { id: productId, shopId: shop.id }, select: { id: true, deletedAt: true } });
      if (!product || product.deletedAt !== null) throw new SellerProductNotFoundError();

      const cartLines = await transaction.cartLine.findMany({ where: { variant: { productId } }, select: { cartId: true } });
      const cartIds = [...new Set(cartLines.map((line) => line.cartId))];
      await transaction.cartLine.deleteMany({ where: { variant: { productId } } });
      await transaction.productFavorite.deleteMany({ where: { productId } });
      await transaction.recentlyViewedProduct.deleteMany({ where: { productId } });
      await transaction.homepageModuleProduct.deleteMany({ where: { productId } });
      await transaction.voucherProductScope.deleteMany({ where: { productId } });
      if (cartIds.length > 0) await transaction.cart.updateMany({ where: { id: { in: cartIds } }, data: { version: { increment: 1 } } });
      const nowRows = await transaction.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`);
      const databaseNow = nowRows[0]?.now;
      if (!(databaseNow instanceof Date) || Number.isNaN(databaseNow.getTime())) throw new SellerProductUnavailableError();
      await transaction.product.update({
        where: { id: productId },
        data: { deletedAt: databaseNow, purgeBlockedAt: null, purgeBlockReason: null },
      });
    });
  }

  private acceptInput(input: SellerProductUpsertRequest): SellerProductUpsertRequest {
    if (!isSellerProductUpsertRequest(input)) throw new SellerProductInputError(['request']);
    return normalizedInput(input);
  }

  private async requireShop(userId: string, client: PrismaService | Transaction = this.prisma) {
    const shop = await client.shop.findFirst({ where: { ownerId: userId, status: ShopStatus.ACTIVE, onboardingStatus: ShopOnboardingStatus.APPROVED, deletedAt: null } });
    if (!shop) throw new SellerProductNotFoundError();
    return shop;
  }

  private async requireProduct(userId: string, productId: string, client: PrismaService | Transaction = this.prisma): Promise<ProductDetailRow> {
    const shop = await this.requireShop(userId, client);
    const product = await client.product.findFirst({ where: { id: productId, shopId: shop.id, deletedAt: null }, include: detailInclude });
    if (!product) throw new SellerProductNotFoundError();
    return product;
  }

  private async findDetail(client: Transaction, productId: string): Promise<ProductDetailRow> {
    const product = await client.product.findUnique({ where: { id: productId }, include: detailInclude });
    if (!product) throw new SellerProductNotFoundError();
    return product;
  }

  private async validateCategoryInput(client: Transaction, input: SellerProductUpsertRequest): Promise<void> {
    const category = await client.category.findFirst({ where: { id: input.categoryId, isActive: true, deletedAt: null, children: { none: { isActive: true, deletedAt: null } } }, include: { attributeDefinitions: true } });
    if (!category || excludedSellerCategorySlugs.has(category.slug)) throw new SellerProductInputError(['categoryId']);
    const definitions = new Map(category.attributeDefinitions.map((definition) => [definition.id, definition]));
    const given = new Map(input.attributes.map((attribute) => [attribute.definitionId, attribute.value]));
    if (given.size !== input.attributes.length) throw new SellerProductInputError(['attributes']);
    for (const definition of definitions.values()) {
      const value = given.get(definition.id);
      if (definition.isRequired && value === undefined) throw new SellerProductInputError([`attributes.${definition.code}`]);
      if (value !== undefined && Array.isArray(definition.allowedValues) && !definition.allowedValues.includes(value)) throw new SellerProductInputError([`attributes.${definition.code}`]);
    }
    for (const id of given.keys()) if (!definitions.has(id)) throw new SellerProductInputError(['attributes']);
  }

  private existingMediaUnchanged(
    current: Array<{ id: string; url: string; altText: string | null; sortOrder: number }>,
    media: SellerProductUpsertRequest['media'],
  ): boolean {
    if (current.length !== media.length) return false;
    return media.every((item, index) => {
      const image = current[index];
      return Boolean(
        image &&
          !image.url.startsWith('/api/v1/product-media/') &&
          item.imageId === image.id &&
          (item.altText?.trim() || null) === image.altText &&
          item.sortOrder === image.sortOrder,
      );
    });
  }

  private imageAliasesFromCurrent(current: Array<{ id: string; url: string }>): Map<string, string> {
    const imageIds = new Map<string, string>();
    for (const image of current) {
      imageIds.set(`image:${image.id}`, image.id);
      imageIds.set(`url:${image.url}`, image.id);
    }
    return imageIds;
  }

  private async resolveMedia(client: Transaction, userId: string, shopId: string, productId: string | null, input: SellerProductUpsertRequest): Promise<ResolvedMedia[]> {
    const currentImages = productId
      ? await client.productImage.findMany({ where: { productId }, include: { sellerProductMediaAsset: true } })
      : [];
    const currentById = new Map(currentImages.map((image) => [image.id, image]));
    const resolved: ResolvedMedia[] = [];
    for (const media of input.media) {
      const altText = media.altText?.trim() || null;
      if (media.url) {
        resolved.push({ url: media.url, altText, sortOrder: media.sortOrder, aliases: [`url:${media.url}`], assetId: null });
        continue;
      }
      if (media.imageId) {
        const image = currentById.get(media.imageId);
        if (!image) throw new SellerProductMediaError('seller-product-media-not-owned');
        const assetId = image.sellerProductMediaAsset?.id ?? null;
        const cdnUrl = image.sellerProductMediaAsset
          ? this.mediaStorage.publicUrl(image.sellerProductMediaAsset.storageKey)
          : null;
        resolved.push({ url: cdnUrl ?? (assetId ? stableProductMediaUrl(assetId) : image.url), altText, sortOrder: media.sortOrder, aliases: [`image:${media.imageId}`, ...(assetId ? [`asset:${assetId}`] : [])], assetId });
        continue;
      }
      if (!media.assetId) throw new SellerProductMediaError('seller-product-media-unavailable');
      const asset = await client.sellerProductMediaAsset.findFirst({ where: { id: media.assetId, uploaderId: userId, shopId, state: 'STAGED', expiresAt: { gt: new Date() } } });
      if (!asset) throw new SellerProductMediaError('seller-product-media-unavailable');
      resolved.push({ url: this.mediaStorage.publicUrl(asset.storageKey) ?? stableProductMediaUrl(asset.id), altText, sortOrder: media.sortOrder, aliases: [`asset:${asset.id}`], assetId: asset.id });
    }
    return resolved;
  }

  private async replaceProductMedia(client: Transaction, productId: string, resolved: ResolvedMedia[]): Promise<Map<string, string>> {
    const previousAssets = await client.sellerProductMediaAsset.findMany({ where: { productId, state: 'ATTACHED' }, select: { id: true } });
    await client.productImage.deleteMany({ where: { productId } });
    if (previousAssets.length) await client.sellerProductMediaAsset.updateMany({ where: { id: { in: previousAssets.map((asset) => asset.id) } }, data: { productId: null, productImageId: null, state: 'STAGED', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    const imageIds = new Map<string, string>();
    for (const media of resolved) {
      const image = await client.productImage.create({ data: { productId, url: media.url, altText: media.altText, sortOrder: media.sortOrder } });
      for (const alias of media.aliases) imageIds.set(alias, image.id);
      if (media.assetId) {
        await client.sellerProductMediaAsset.update({ where: { id: media.assetId }, data: { productId, productImageId: image.id, state: 'ATTACHED', expiresAt: null } });
      }
    }
    return imageIds;
  }

  private async applyOptionValueMedia(client: Transaction, productId: string, input: SellerProductUpsertRequest, imageIds: Map<string, string>): Promise<void> {
    if (!input.optionValueMedia?.length) return;
    const groups = await client.productOptionGroup.findMany({ where: { productId }, include: { values: true }, orderBy: { sortOrder: 'asc' } });
    const seen = new Set<string>();
    for (const mapping of input.optionValueMedia) {
      if (mapping.groupIndex !== 0) throw new SellerProductMediaError('seller-product-classification-image-group');
      const value = groups[mapping.groupIndex]?.values.find((item) => item.value === mapping.value);
      if (!value) throw new SellerProductMediaError('seller-product-classification-image-value');
      if (seen.has(mapping.value)) throw new SellerProductMediaError('seller-product-classification-image-duplicate');
      seen.add(mapping.value);
      if (!mapping.mediaRef) continue;
      const key = mediaReferenceKey(mapping.mediaRef);
      const imageId = key ? imageIds.get(key) : null;
      if (!imageId) throw new SellerProductMediaError('seller-product-classification-image-unavailable');
      await client.productOptionValue.update({ where: { id: value.id }, data: { imageId } });
    }
  }

  private async replaceVariants(client: Transaction, productId: string, productSlug: string, shopId: string, input: SellerProductUpsertRequest, protectedVariants: Array<{ id: string; sku: string; combinationKey: string }> = [], actorUserId?: string): Promise<void> {
    const groups = await client.productOptionGroup.findMany({ where: { productId }, include: { values: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } });
    const expected = generateSellerProductCombinations(input.optionGroups);
    if (expected.length !== input.variants.length) throw new SellerProductInputError(['variants']);
    const reusable = new Map(protectedVariants.map((variant) => [variant.combinationKey, variant]));
    for (const variant of input.variants) {
      const key = combinationKey(variant.combination);
      const protectedVariant = reusable.get(key);
      const sku = protectedVariant?.sku.startsWith('DRAFT-') ? generatedVariantSku(productSlug, variant.combination) : protectedVariant?.sku ?? generatedVariantSku(productSlug, variant.combination);
      const ids = variant.combination.map((value, index) => groups[index]?.values.find((option) => option.value === value)?.id);
      if (ids.some((id) => !id)) throw new SellerProductInputError(['variants.combination']);
      const existing = protectedVariant;
      if (existing) {
        reusable.delete(key);
        await client.productVariant.update({ where: { id: existing.id }, data: { shopId, combinationKey: combinationKey(variant.combination), name: currentCombinationName(variant.combination), priceMinor: BigInt(variant.priceMinor), compareAtPriceMinor: variant.compareAtPriceMinor === null ? null : BigInt(variant.compareAtPriceMinor), weightGrams: variant.weightGrams, maxPurchaseQuantity: variant.maxPurchaseQuantity, status: variant.active ? VariantStatus.ACTIVE : VariantStatus.INACTIVE, optionValues: { deleteMany: {}, create: ids.map((optionValueId) => ({ optionValueId: optionValueId! })) } } });
        const currentInventory = await client.inventory.findUnique({ where: { variantId: existing.id } });
        const before = currentInventory?.quantityOnHand ?? 0;
        const reserved = currentInventory?.quantityReserved ?? 0;
        if (variant.stock < reserved) throw new SellerProductInputError(['variants.stock']);
        if (before !== variant.stock) {
          if (currentInventory && actorUserId && this.inventory) {
            await this.inventory.adjustInTransaction(
              client,
              actorUserId,
              existing.id,
              currentInventory.version,
              randomUUID(),
              createHash('sha256').update(`${existing.id}:${variant.stock}`).digest('hex'),
              { delta: variant.stock - before, reason: InventoryAdjustmentReason.PRODUCT_EDIT, note: 'seller-product-edit' },
            );
          } else {
            const nextInventory = currentInventory
              ? await client.inventory.update({ where: { variantId: existing.id }, data: { quantityOnHand: variant.stock, version: { increment: 1 } } })
              : await client.inventory.create({ data: { variantId: existing.id, quantityOnHand: variant.stock } });
            await client.inventoryAdjustment.create({ data: { variantId: existing.id, shopId, actorUserId: actorUserId ?? null, reason: InventoryAdjustmentReason.PRODUCT_EDIT, delta: variant.stock - before, quantityOnHandBefore: before, quantityOnHandAfter: nextInventory.quantityOnHand, quantityReserved: nextInventory.quantityReserved, quantitySold: nextInventory.quantitySold, inventoryVersion: nextInventory.version } });
          }
        }
      } else {
        const created = await client.productVariant.create({ data: { productId, shopId, combinationKey: combinationKey(variant.combination), sku, name: currentCombinationName(variant.combination), priceMinor: BigInt(variant.priceMinor), compareAtPriceMinor: variant.compareAtPriceMinor === null ? null : BigInt(variant.compareAtPriceMinor), weightGrams: variant.weightGrams, maxPurchaseQuantity: variant.maxPurchaseQuantity, status: variant.active ? VariantStatus.ACTIVE : VariantStatus.INACTIVE, inventory: { create: { quantityOnHand: variant.stock } }, optionValues: { create: ids.map((optionValueId) => ({ optionValueId: optionValueId! })) } } });
        if (variant.stock !== 0) await client.inventoryAdjustment.create({ data: { variantId: created.id, shopId, actorUserId: actorUserId ?? null, reason: InventoryAdjustmentReason.INITIAL_STOCK, delta: variant.stock, quantityOnHandBefore: 0, quantityOnHandAfter: variant.stock, quantityReserved: 0, quantitySold: 0, inventoryVersion: 0 } });
      }
    }
    for (const variant of reusable.values()) await client.productVariant.update({ where: { id: variant.id }, data: { status: VariantStatus.INACTIVE } });
  }

  private assertPublishable(product: ProductDetailRow): void {
    const fields: string[] = [];
    if (product.moderationStatus !== ProductModerationStatus.ACTIVE) fields.push('moderationStatus');
    if (product.images.length === 0) fields.push('media');
    if (product.packageLengthMm === null || product.packageWidthMm === null || product.packageHeightMm === null) fields.push('packageDimensions');
    if (!product.variants.some((variant) => variant.status === VariantStatus.ACTIVE && variant.deletedAt === null && variant.sku.length > 0 && !variant.sku.startsWith('DRAFT-'))) fields.push('variants');
    const requiredMissing = product.category ? false : true;
    if (requiredMissing) fields.push('category');
    if (fields.length) throw new SellerProductInputError(fields);
  }

  private statusFor(value: SellerProductLifecycle): ProductStatus {
    if (value === 'published') return ProductStatus.ACTIVE;
    if (value === 'hidden') return ProductStatus.HIDDEN;
    if (value === 'archived') return ProductStatus.ARCHIVED;
    return ProductStatus.DRAFT;
  }
}

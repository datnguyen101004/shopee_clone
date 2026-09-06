import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  CampaignAdminPage, CampaignAdminSummary, CampaignBannerDetail, CampaignContentBlock,
  CampaignParticipationPage, CampaignParticipationResponse, CampaignSummary, CampaignTypeSummary, CreateCampaignRequest,
  SellerCampaignDetail, SellerCampaignPage, SellerCampaignParticipationRequest,
} from '@shopee-clone/contracts';
import { campaignLifecycleAt, isAllowedMediaUrl } from '@shopee-clone/contracts';
import { Prisma } from '../generated/prisma/client';
import { MarketplaceCampaignParticipationState, ProductStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SellerShopScopeNotFoundError, SellerShopScopeService } from '../seller-scope/seller-shop-scope.service';
import { NotificationService } from '../notifications/notification.service';
import { homepageBannerCampaignTargetUnavailableEvent } from '../notifications/notification-events';
import { CAMPAIGN_POLICY_REGISTRY, campaignPolicyFor } from './campaign-policy';
import {
  MarketplaceCampaignConflictError, MarketplaceCampaignError, MarketplaceCampaignNotFoundError,
  MarketplaceCampaignStaleError, MarketplaceCampaignValidationError,
} from './marketplace-campaigns.errors';

type CampaignGraph = Prisma.MarketplaceCampaignGetPayload<{ include: {
  type: true; categories: true; participations: { include: { products: true } };
} }>;
type ProductGraph = Prisma.ProductGetPayload<{ include: {
  shop: { select: { name: true; status: true; onboardingStatus: true; deletedAt: true } }; images: { orderBy: { sortOrder: 'asc' }; take: 1 };
  variants: { where: { status: 'ACTIVE'; deletedAt: null }; include: { inventory: true } };
} }>;

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const commandKey = (value: string | undefined): string => {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new MarketplaceCampaignValidationError(['idempotencyKey'], 'A canonical UUID idempotency key is required.');
  }
  return value;
};
const date = (value: string) => new Date(value);
const containsControlCharacter = (value: string) => Array.from(value).some((character) => {
  const code = character.charCodeAt(0);
  return (code >= 0 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);
});
const safeText = (value: unknown, max: number) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 && normalized.length <= max && !containsControlCharacter(normalized) ? normalized : null;
};

function validateContent(input: unknown): CampaignContentBlock[] {
  if (!Array.isArray(input) || input.length === 0) throw new MarketplaceCampaignValidationError(['content'], 'Campaign content cannot be empty.');
  if (input.length > 40) throw new MarketplaceCampaignValidationError(['content'], 'Campaign content is limited to 40 blocks.');
  const blocks = input as readonly CampaignContentBlock[];
  return blocks.map((block, index) => {
    if (!block || !['heading', 'paragraph', 'list', 'link'].includes(block.kind)) throw new MarketplaceCampaignValidationError([`content.${index}`]);
    if (block.kind === 'heading') {
      const text = safeText(block.text, 240);
      if (!text || ![2, 3].includes(block.level)) throw new MarketplaceCampaignValidationError([`content.${index}`]);
      return { kind: 'heading', level: block.level, text };
    }
    if (block.kind === 'paragraph') {
      const text = safeText(block.text, 2000);
      if (!text) throw new MarketplaceCampaignValidationError([`content.${index}`]);
      return { kind: 'paragraph', text };
    }
    if (block.kind === 'list') {
      if (!Array.isArray(block.items) || block.items.length === 0 || block.items.length > 20) throw new MarketplaceCampaignValidationError([`content.${index}`]);
      const items = block.items.map((item) => safeText(item, 240));
      if (items.some((item): item is null => item === null)) throw new MarketplaceCampaignValidationError([`content.${index}`]);
      return { kind: 'list', items: items as string[] };
    }
    const label = safeText(block.label, 120);
    const href = typeof block.href === 'string' && /^\/(?!\/)[^\s<>{}]*$/.test(block.href) ? block.href : null;
    if (!label || !href) throw new MarketplaceCampaignValidationError([`content.${index}`], 'Only same-origin campaign links are allowed.');
    return { kind: 'link', label, href };
  });
}

function cursorFor(row: { createdAt: Date; id: string }): string { return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }), 'utf8').toString('base64url'); }
function cursorWhere(cursor: string | undefined): { OR?: Array<{ createdAt: { lt: Date } } | { createdAt: Date; id: { lt: string } }> } {
  if (!cursor) return {};
  try { const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { createdAt?: string; id?: string }; const createdAt = new Date(parsed.createdAt ?? ''); if (!parsed.id || Number.isNaN(createdAt.getTime())) throw new Error(); return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: parsed.id } }] }; } catch { throw new MarketplaceCampaignValidationError(['cursor']); }
}

function toType(row: CampaignGraph['type'], campaign?: Pick<CampaignGraph, 'policyVersionSnapshot' | 'importanceClassSnapshot' | 'presentationKeySnapshot' | 'productOrderKeySnapshot' | 'rankingProfileKeySnapshot'>): CampaignTypeSummary {
  return { code: row.code, displayName: row.displayName, description: row.description, importanceClass: campaign?.importanceClassSnapshot ?? row.importanceClass, policyVersion: campaign?.policyVersionSnapshot ?? row.policyVersion, presentationKey: (campaign?.presentationKeySnapshot ?? row.presentationKey) as CampaignTypeSummary['presentationKey'], productOrderKey: (campaign?.productOrderKeySnapshot ?? row.productOrderKey) as CampaignTypeSummary['productOrderKey'], rankingProfileKey: (campaign?.rankingProfileKeySnapshot ?? row.rankingProfileKey) as CampaignTypeSummary['rankingProfileKey'], enabled: row.isEnabled };
}
function campaignHref(id: string): string { return `/campaigns/${encodeURIComponent(id)}`; }

@Injectable()
export class MarketplaceCampaignsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SellerShopScopeService) private readonly sellerScope: SellerShopScopeService,
    @Optional() @Inject(NotificationService) private readonly notifications?: NotificationService,
  ) {}

  private async emitCancelledCampaignTargetNotice(campaignId: string): Promise<void> {
    if (!this.notifications) return;
    try {
      const [banners, admins] = await Promise.all([
        this.prisma.homepageBanner.findMany({
          where: { isEnabled: true, targetType: 'CAMPAIGN', targetId: campaignId },
          select: { id: true },
        }),
        this.prisma.user.findMany({
          where: { status: 'ACTIVE', deletedAt: null, roleAssignments: { some: { role: 'ADMIN' } } },
          select: { id: true },
        }),
      ]);
      if (!banners.length || !admins.length) return;
      await Promise.all(banners.map((banner) => this.notifications!.notify(
        homepageBannerCampaignTargetUnavailableEvent({
          bannerId: banner.id,
          campaignId,
          reason: 'CANCELLED',
          adminUserIds: admins.map(({ id }) => id),
        }),
      )));
    } catch (error) {
      // Notification delivery must not make a successful campaign cancel fail.
      console.warn(`[campaigns] cancelled-target notification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async campaign(id: string): Promise<CampaignGraph> {
    const campaign = await this.prisma.marketplaceCampaign.findUnique({ where: { id }, include: { type: true, categories: true, participations: { include: { products: true } } } });
    if (!campaign) throw new MarketplaceCampaignNotFoundError();
    return campaign;
  }

  private summary(row: CampaignGraph, now = new Date(), shopId?: string): CampaignSummary {
    const participation = shopId ? row.participations.find((item) => item.shopId === shopId) : undefined;
    const lifecycle = campaignLifecycleAt(row, now);
    const sellerState = participation?.state === 'JOINED' && ['SCHEDULED', 'ACTIVE', 'ENDED'].includes(lifecycle)
      ? 'LOCKED'
      : participation?.state;
    return { id: row.id, type: toType(row.type, row), title: row.name, description: row.description, lifecycle, announceAt: row.announceAt.toISOString(), enrollmentStartsAt: row.enrollmentStartsAt.toISOString(), enrollmentEndsAt: row.enrollmentEndsAt.toISOString(), startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), minimumDiscountBasisPoints: row.minimumDiscountBasisPoints, ...(participation && sellerState ? { sellerState, submittedProductCount: participation.products.length } : {}), href: campaignHref(row.id) };
  }

  async listTypes(): Promise<CampaignTypeSummary[]> {
    const rows = await this.prisma.marketplaceCampaignType.findMany({ where: { isEnabled: true }, orderBy: { code: 'asc' } });
    return rows.filter((row) => campaignPolicyFor(row.code)).map((row) => toType(row as CampaignGraph['type']));
  }

  private validateTimeline(input: Pick<CreateCampaignRequest, 'announceAt' | 'enrollmentStartsAt' | 'enrollmentEndsAt' | 'startsAt' | 'endsAt'>): Date[] {
    const values = [input.announceAt, input.enrollmentStartsAt, input.enrollmentEndsAt, input.startsAt, input.endsAt].map(date);
    const [announceAt, enrollmentStartsAt, enrollmentEndsAt, startsAt, endsAt] = values;
    if (!announceAt || !enrollmentStartsAt || !enrollmentEndsAt || !startsAt || !endsAt || values.some((item) => Number.isNaN(item.getTime())) || !(announceAt <= enrollmentStartsAt && enrollmentStartsAt < enrollmentEndsAt && enrollmentEndsAt <= startsAt && startsAt < endsAt)) throw new MarketplaceCampaignValidationError(['announceAt', 'enrollmentStartsAt', 'enrollmentEndsAt', 'startsAt', 'endsAt'], 'Campaign timeline must be ordered and non-overlapping.');
    return values;
  }

  private normalizedInput(input: CreateCampaignRequest) {
    const policy = campaignPolicyFor(input.typeCode);
    if (!policy) throw new MarketplaceCampaignValidationError(['typeCode'], 'Unsupported campaign type.');
    const title = safeText(input.title, 160); const altText = safeText(input.altText, 240);
    if (!title || !altText) throw new MarketplaceCampaignValidationError(['title', 'altText']);
    const timeline = this.validateTimeline(input); const content = validateContent(input.content);
    const minimumDiscountBasisPoints = input.minimumDiscountBasisPoints ?? policy.minimumDiscountBasisPoints;
    if (minimumDiscountBasisPoints < policy.minimumDiscountBasisPoints || minimumDiscountBasisPoints > 9000) throw new MarketplaceCampaignValidationError(['minimumDiscountBasisPoints'], 'Discount must be between the type minimum and 9000 basis points.');
    if (input.imageUrl && !isAllowedMediaUrl(input.imageUrl)) throw new MarketplaceCampaignValidationError(['imageUrl'], 'Campaign media must be a trusted HTTPS or internal path.');
    return {
      policy,
      title,
      altText,
      timeline,
      content,
      minimumDiscountBasisPoints,
      eyebrow: safeText(input.eyebrow, 80),
      imageUrl: input.imageUrl ?? null,
      theme: safeText(input.theme, 40) ?? 'brand',
    };
  }

  private async validateCategoryIds(
    tx: Prisma.TransactionClient,
    categoryIds: readonly string[] | undefined,
  ): Promise<string[]> {
    const unique = [...new Set(categoryIds ?? [])];
    if (unique.length > 30) {
      throw new MarketplaceCampaignValidationError(['categoryIds'], 'A campaign can target at most 30 categories.');
    }
    if (!unique.length) return [];
    const rows = await tx.category.findMany({
      where: { id: { in: unique }, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (rows.length !== unique.length) {
      throw new MarketplaceCampaignValidationError(['categoryIds'], 'One or more categories are unavailable.');
    }
    return unique;
  }

  async createAdmin(input: CreateCampaignRequest, actorUserId: string, rawIdempotencyKey?: string): Promise<CampaignAdminSummary> {
    const normalized = this.normalizedInput(input); const id = randomUUID();
    const idempotencyKey = commandKey(rawIdempotencyKey);
    const requestDigest = digest(input);
    const replay = await this.prisma.marketplaceCampaignCommand.findUnique({ where: { actorUserId_idempotencyKey: { actorUserId, idempotencyKey } } });
    if (replay) { if (replay.requestDigest !== requestDigest) throw new MarketplaceCampaignConflictError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for different input.'); return replay.response as unknown as CampaignAdminSummary; }
    const [announceAt, enrollmentStartsAt, enrollmentEndsAt, startsAt, endsAt] = normalized.timeline;
    const row = await this.prisma.$transaction(async (tx) => {
      const type = await tx.marketplaceCampaignType.findUnique({ where: { code: input.typeCode } });
      if (!type || !type.isEnabled) throw new MarketplaceCampaignValidationError(['typeCode'], 'Campaign type is disabled.');
      const categoryIds = await this.validateCategoryIds(tx, input.categoryIds);
      const campaign = await tx.marketplaceCampaign.create({ data: { id, typeId: type.id, name: normalized.title, description: input.description ?? null, announceAt: announceAt!, enrollmentStartsAt: enrollmentStartsAt!, enrollmentEndsAt: enrollmentEndsAt!, startsAt: startsAt!, endsAt: endsAt!, minimumDiscountBasisPoints: normalized.minimumDiscountBasisPoints, detailEyebrow: normalized.eyebrow, detailImageUrl: normalized.imageUrl, detailAltText: normalized.altText, detailThemeKey: normalized.theme, detailContentJson: normalized.content as unknown as Prisma.InputJsonValue }, include: { type: true, categories: true, participations: { include: { products: true } } } });
      if (categoryIds.length) await tx.marketplaceCampaignCategory.createMany({ data: categoryIds.map((categoryId) => ({ campaignId: id, categoryId })), skipDuplicates: true });
      const createdSummary = this.adminSummary(campaign as unknown as CampaignGraph);
      await tx.marketplaceCampaignCommand.create({ data: { id: randomUUID(), actorUserId, campaignId: id, scope: 'ADMIN_CREATE', idempotencyKey, requestDigest, response: createdSummary as unknown as Prisma.InputJsonValue } });
      await tx.marketplaceCampaignAudit.create({ data: { id: randomUUID(), actorUserId, campaignId: id, action: 'CREATED', versionTo: campaign.version, metadata: { typeCode: type.code } } });
      return campaign;
    }) as unknown as CampaignGraph;
    return this.adminSummary(row);
  }

  private adminSummary(row: CampaignGraph): CampaignAdminSummary {
    const summary = this.summary(row);
    return { ...summary, version: row.version, sellerJoinedCount: row.participations.filter((item) => item.state === 'JOINED' || item.state === 'LOCKED').length, sellerDeclinedCount: row.participations.filter((item) => item.state === 'DECLINED').length, productCount: row.participations.reduce((count, item) => count + item.products.length, 0), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }

  async listAdmin(query: { cursor?: string; limit?: number; typeCode?: string; state?: string }): Promise<CampaignAdminPage> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const now = new Date(); const stateWhere = query.state === 'DRAFT' ? { publishedAt: null } : query.state === 'CANCELLED' ? { cancelledAt: { not: null } } : query.state === 'ANNOUNCED' ? { publishedAt: { not: null }, cancelledAt: null, announceAt: { lte: now }, enrollmentStartsAt: { gt: now } } : query.state === 'ENROLLMENT_OPEN' ? { publishedAt: { not: null }, cancelledAt: null, enrollmentStartsAt: { lte: now }, enrollmentEndsAt: { gt: now } } : query.state === 'SCHEDULED' ? { publishedAt: { not: null }, cancelledAt: null, enrollmentEndsAt: { lte: now }, startsAt: { gt: now } } : query.state === 'ACTIVE' ? { publishedAt: { not: null }, cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now } } : query.state === 'ENDED' ? { publishedAt: { not: null }, cancelledAt: null, endsAt: { lte: now } } : query.state === 'UPCOMING' ? { publishedAt: { not: null }, cancelledAt: null, startsAt: { gt: now } } : {};
    const rows = await this.prisma.marketplaceCampaign.findMany({ where: { ...(query.typeCode ? { type: { code: query.typeCode } } : {}), ...stateWhere, ...cursorWhere(query.cursor) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, include: { type: true, categories: true, participations: { include: { products: true } } } });
    const items = rows.slice(0, limit).map((row) => this.adminSummary(row)); const last = items.at(-1);
    return { items, nextCursor: rows.length > limit && last ? cursorFor(rows[limit - 1]!) : null };
  }

  async readAdmin(id: string): Promise<CampaignAdminSummary> { return this.adminSummary(await this.campaign(id)); }

  async placeAdmin(id: string, input: { moduleId: string; sortOrder?: number; enabled?: boolean }, actorUserId: string): Promise<{ id: string; moduleId: string; campaignId: string; enabled: boolean; sortOrder: number }> {
    const campaign = await this.campaign(id);
    const module = await this.prisma.homepageModule.findUnique({ where: { id: input.moduleId } });
    if (!module) throw new MarketplaceCampaignValidationError(['moduleId'], 'Homepage module does not exist.');
    const row = await this.prisma.homepageCampaignCollection.upsert({ where: { moduleId_campaignId: { moduleId: input.moduleId, campaignId: campaign.id } }, create: { id: randomUUID(), moduleId: input.moduleId, campaignId: campaign.id, typeId: campaign.typeId, sortOrder: input.sortOrder ?? 0, isEnabled: input.enabled ?? true }, update: { sortOrder: input.sortOrder ?? 0, isEnabled: input.enabled ?? true } });
    await this.prisma.marketplaceCampaignAudit.create({ data: { id: randomUUID(), actorUserId, campaignId: id, action: 'PLACED', metadata: { moduleId: input.moduleId, enabled: row.isEnabled } } });
    return { id: row.id, moduleId: row.moduleId, campaignId: row.campaignId, enabled: row.isEnabled, sortOrder: row.sortOrder };
  }

  async participationReport(id: string, query: { cursor?: string; limit?: number }): Promise<CampaignParticipationPage> {
    await this.campaign(id); const limit = Math.min(Math.max(query.limit ?? 20, 1), 50); const rows = await this.prisma.sellerCampaignParticipation.findMany({ where: { campaignId: id, ...cursorWhere(query.cursor) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, include: { products: { select: { productId: true } } } });
    return { items: rows.slice(0, limit).map((row) => ({ shopId: row.shopId, state: row.state, version: row.version, submittedProductCount: row.products.length, respondedAt: row.respondedAt?.toISOString() ?? null })), nextCursor: rows.length > limit ? cursorFor(rows[limit - 1]!) : null };
  }

  async updateAdmin(id: string, input: CreateCampaignRequest & { version: number }, actorUserId: string): Promise<CampaignAdminSummary> {
    const normalized = this.normalizedInput(input);
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.marketplaceCampaign.findUnique({ where: { id }, include: { type: true, categories: true, participations: { include: { products: true } } } });
      if (!current) throw new MarketplaceCampaignNotFoundError();
      if (current.version !== input.version) throw new MarketplaceCampaignStaleError(current.version);
      if (current.publishedAt && current.type.code !== input.typeCode) throw new MarketplaceCampaignConflictError('CAMPAIGN_TYPE_IMMUTABLE', 'Campaign type is locked after publication.');
      const type = await tx.marketplaceCampaignType.findUnique({ where: { code: input.typeCode } });
      if (!type || !type.isEnabled) throw new MarketplaceCampaignValidationError(['typeCode'], 'Campaign type is disabled.');
      const categoryIds = await this.validateCategoryIds(tx, input.categoryIds);
      const [announceAt, enrollmentStartsAt, enrollmentEndsAt, startsAt, endsAt] = normalized.timeline;
      const currentCategoryIds = current.categories.map(({ categoryId }) => categoryId).sort();
      const nextCategoryIds = [...categoryIds].sort();
      const sameCategories = currentCategoryIds.length === nextCategoryIds.length && currentCategoryIds.every((value, index) => value === nextCategoryIds[index]);
      const scheduleChanged = [announceAt, enrollmentStartsAt, enrollmentEndsAt, startsAt, endsAt].some((value, index) => value?.getTime() !== [current.announceAt, current.enrollmentStartsAt, current.enrollmentEndsAt, current.startsAt, current.endsAt][index]?.getTime());
      const economicsLocked = current.publishedAt && campaignLifecycleAt(current) !== 'DRAFT' && campaignLifecycleAt(current) !== 'ANNOUNCED';
      if (economicsLocked && (scheduleChanged || normalized.minimumDiscountBasisPoints !== current.minimumDiscountBasisPoints || !sameCategories)) {
        throw new MarketplaceCampaignConflictError('CAMPAIGN_ECONOMICS_IMMUTABLE', 'Schedule, categories, and discount rules are locked after enrollment opens.');
      }
      await tx.marketplaceCampaign.update({
        where: { id },
        data: {
          typeId: type.id,
          name: normalized.title,
          description: input.description ?? null,
          announceAt: announceAt!,
          enrollmentStartsAt: enrollmentStartsAt!,
          enrollmentEndsAt: enrollmentEndsAt!,
          startsAt: startsAt!,
          endsAt: endsAt!,
          minimumDiscountBasisPoints: normalized.minimumDiscountBasisPoints,
          detailEyebrow: normalized.eyebrow,
          detailImageUrl: normalized.imageUrl,
          detailAltText: normalized.altText,
          detailThemeKey: normalized.theme,
          detailContentJson: normalized.content as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
          categories: {
            deleteMany: {},
            create: categoryIds.map((categoryId) => ({ categoryId })),
          },
        },
      });
      await tx.homepageCampaignCollection.updateMany({ where: { campaignId: id }, data: { typeId: type.id } });
      await tx.marketplaceCampaignAudit.create({ data: { id: randomUUID(), actorUserId, campaignId: id, action: 'UPDATED', versionFrom: current.version, versionTo: current.version + 1 } });
      return tx.marketplaceCampaign.findUniqueOrThrow({ where: { id }, include: { type: true, categories: true, participations: { include: { products: true } } } });
    });
    return this.adminSummary(row);
  }

  async preview(input: CreateCampaignRequest): Promise<CampaignBannerDetail> {
    const normalized = this.normalizedInput(input); const now = new Date();
    const type = CAMPAIGN_POLICY_REGISTRY[input.typeCode as keyof typeof CAMPAIGN_POLICY_REGISTRY];
    if (!type) throw new MarketplaceCampaignValidationError(['typeCode']);
    const [announceAt, enrollmentStartsAt, enrollmentEndsAt, startsAt, endsAt] = normalized.timeline;
    return { id: 'preview', type: { code: type.code, displayName: type.displayName, description: type.description, importanceClass: type.importanceClass, policyVersion: type.policyVersion, presentationKey: type.presentationKey, productOrderKey: type.productOrderKey, rankingProfileKey: type.rankingProfileKey, enabled: true }, title: normalized.title, description: input.description ?? null, lifecycle: 'DRAFT', announceAt: announceAt!.toISOString(), enrollmentStartsAt: enrollmentStartsAt!.toISOString(), enrollmentEndsAt: enrollmentEndsAt!.toISOString(), startsAt: startsAt!.toISOString(), endsAt: endsAt!.toISOString(), minimumDiscountBasisPoints: normalized.minimumDiscountBasisPoints, href: '/campaigns/preview', eyebrow: normalized.eyebrow, content: normalized.content, imageUrl: normalized.imageUrl, altText: normalized.altText, theme: normalized.theme, products: [], nextCursor: null, evaluatedAt: now.toISOString() };
  }

  async publish(id: string, version: number, actorUserId: string, rawIdempotencyKey?: string): Promise<CampaignAdminSummary> {
    const idempotencyKey = commandKey(rawIdempotencyKey);
    const requestDigest = digest({ id, version });
    const replay = await this.prisma.marketplaceCampaignCommand.findUnique({ where: { actorUserId_idempotencyKey: { actorUserId, idempotencyKey } } });
    if (replay) { if (replay.requestDigest !== requestDigest) throw new MarketplaceCampaignConflictError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for different input.'); return replay.response as unknown as CampaignAdminSummary; }
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.marketplaceCampaign.findUnique({ where: { id }, include: { type: true, categories: true, participations: { include: { products: true } } } }); if (!current) throw new MarketplaceCampaignNotFoundError();
      if (current.version !== version) throw new MarketplaceCampaignStaleError(current.version); if (current.cancelledAt) throw new MarketplaceCampaignConflictError('CAMPAIGN_CANCELLED', 'Cancelled campaigns cannot be published.');
      if (current.publishedAt) throw new MarketplaceCampaignConflictError('CAMPAIGN_ALREADY_PUBLISHED', 'Published campaigns cannot be published again.');
      const campaignContent = current.detailContentJson;
      if (!Array.isArray(campaignContent)) throw new MarketplaceCampaignValidationError(['content'], 'Campaign content is required before publishing.');
      validateContent(campaignContent as unknown as CampaignContentBlock[]);
      const updated = await tx.marketplaceCampaign.update({ where: { id }, data: { publishedAt: current.publishedAt ?? new Date(), policyVersionSnapshot: current.type.policyVersion, importanceClassSnapshot: current.type.importanceClass, presentationKeySnapshot: current.type.presentationKey, productOrderKeySnapshot: current.type.productOrderKey, rankingProfileKeySnapshot: current.type.rankingProfileKey, version: { increment: 1 } }, include: { type: true, categories: true, participations: { include: { products: true } } } });
      await tx.marketplaceCampaignCommand.create({ data: { id: randomUUID(), actorUserId, campaignId: id, scope: 'ADMIN_PUBLISH', idempotencyKey, requestDigest, response: this.adminSummary(updated) as unknown as Prisma.InputJsonValue } });
      await tx.marketplaceCampaignAudit.create({ data: { id: randomUUID(), actorUserId, campaignId: id, action: 'PUBLISHED', versionFrom: current.version, versionTo: updated.version } }); return updated;
    });
    return this.adminSummary(row);
  }

  async cancel(id: string, version: number, reason: string, actorUserId: string, rawIdempotencyKey?: string): Promise<CampaignAdminSummary> {
    const cleanReason = safeText(reason, 240); if (!cleanReason) throw new MarketplaceCampaignValidationError(['reason']);
    const idempotencyKey = commandKey(rawIdempotencyKey);
    const requestDigest = digest({ id, version, reason: cleanReason });
    const replay = await this.prisma.marketplaceCampaignCommand.findUnique({ where: { actorUserId_idempotencyKey: { actorUserId, idempotencyKey } } });
    if (replay) { if (replay.requestDigest !== requestDigest) throw new MarketplaceCampaignConflictError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for different input.'); return replay.response as unknown as CampaignAdminSummary; }
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.marketplaceCampaign.findUnique({ where: { id }, include: { type: true, categories: true, participations: { include: { products: true } } } }); if (!current) throw new MarketplaceCampaignNotFoundError(); if (current.version !== version) throw new MarketplaceCampaignStaleError(current.version); if (current.cancelledAt) throw new MarketplaceCampaignConflictError('CAMPAIGN_ALREADY_CANCELLED', 'Campaign is already cancelled.');
      const updated = await tx.marketplaceCampaign.update({ where: { id }, data: { cancelledAt: new Date(), cancellationReason: cleanReason, version: { increment: 1 } }, include: { type: true, categories: true, participations: { include: { products: true } } } });
      await tx.productPromotionReservation.updateMany({ where: { marketplaceCampaignId: id }, data: { isEnabled: false } });
      await tx.marketplaceCampaignCommand.create({ data: { id: randomUUID(), actorUserId, campaignId: id, scope: 'ADMIN_CANCEL', idempotencyKey, requestDigest, response: this.adminSummary(updated) as unknown as Prisma.InputJsonValue } });
      await tx.marketplaceCampaignAudit.create({ data: { id: randomUUID(), actorUserId, campaignId: id, action: 'CANCELLED', reason: cleanReason, versionFrom: current.version, versionTo: updated.version } }); return updated;
    });
    await this.emitCancelledCampaignTargetNotice(id);
    return this.adminSummary(row);
  }

  private async publicDetailForRow(row: CampaignGraph): Promise<CampaignBannerDetail> {
    if (!row.publishedAt) throw new MarketplaceCampaignNotFoundError();
    const lifecycle = campaignLifecycleAt(row);
    let content: CampaignContentBlock[];
    try { content = validateContent(Array.isArray(row.detailContentJson) ? row.detailContentJson as unknown as CampaignContentBlock[] : []); } catch { throw new MarketplaceCampaignNotFoundError(); }
    const productIds = row.participations.flatMap((item) => item.products.map((product) => product.productId));
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds }, status: ProductStatus.ACTIVE, moderationStatus: 'ACTIVE', deletedAt: null, shop: { status: 'ACTIVE', onboardingStatus: 'APPROVED', deletedAt: null }, category: { isActive: true, deletedAt: null } }, include: { shop: { select: { name: true, status: true, onboardingStatus: true, deletedAt: true } }, images: { orderBy: { sortOrder: 'asc' }, take: 1 }, variants: { where: { status: 'ACTIVE', deletedAt: null }, include: { inventory: true } } }, orderBy: { id: 'asc' }, take: 50 }) as unknown as ProductGraph[];
    const orderedProducts = products.filter((product) =>
      product.variants.some((variant) =>
        Math.max(0, (variant.inventory?.quantityOnHand ?? 0) - (variant.inventory?.quantityReserved ?? 0)) > 0,
      ),
    ).sort((left, right) => {
      const leftSummary = this.productSummary(left, row);
      const rightSummary = this.productSummary(right, row);
      const productOrderKey = row.productOrderKeySnapshot ?? row.type.productOrderKey;
      const comparison = productOrderKey === 'DISCOUNT_DESC'
        ? rightSummary.discountBasisPoints - leftSummary.discountBasisPoints
        : productOrderKey === 'PRICE_ASC'
          ? leftSummary.effectivePriceMinor - rightSummary.effectivePriceMinor
          : 0;
      return comparison || left.id.localeCompare(right.id);
    });
    return { ...this.summary(row), eyebrow: row.detailEyebrow ?? null, content, imageUrl: row.detailImageUrl ?? null, altText: row.detailAltText ?? row.name, theme: row.detailThemeKey ?? 'brand', products: lifecycle === 'ACTIVE' ? orderedProducts.map((product) => this.productSummary(product, row)) : [], nextCursor: null, evaluatedAt: new Date().toISOString() };
  }

  async publicById(id: string): Promise<CampaignBannerDetail> {
    const row = await this.prisma.marketplaceCampaign.findUnique({ where: { id }, include: { type: true, categories: true, participations: { where: { state: { in: ['JOINED', 'LOCKED'] } }, include: { products: true } } } });
    if (!row) throw new MarketplaceCampaignNotFoundError();
    return this.publicDetailForRow(row as CampaignGraph);
  }

  async publicByBanner(bannerId: string): Promise<CampaignBannerDetail> {
    const banner = await this.prisma.homepageBanner.findUnique({
      where: { id: bannerId },
      select: { targetType: true, targetId: true },
    });
    const campaignId = banner?.targetType === 'CAMPAIGN' ? banner.targetId : null;
    if (!campaignId) throw new MarketplaceCampaignNotFoundError();
    const campaign = await this.campaign(campaignId);
    if (campaignLifecycleAt(campaign) !== 'ACTIVE') throw new MarketplaceCampaignNotFoundError();
    return this.publicDetailForRow(campaign);
  }

  private productSummary(product: ProductGraph, row: CampaignGraph): CampaignBannerDetail['products'][number] {
    const base = product.variants.reduce((min, variant) => Math.min(min, Number(variant.priceMinor)), Number.MAX_SAFE_INTEGER); const campaignProduct = row.participations.flatMap((participation) => participation.products).find((item) => item.productId === product.id); const discount = campaignProduct?.discountBasisPoints ?? row.minimumDiscountBasisPoints; const effective = Number.isSafeInteger(base) ? Math.max(0, Math.floor(base * (10000 - discount) / 10000)) : 0; const inventory = product.variants.reduce((sum, variant) => sum + Math.max(0, (variant.inventory?.quantityOnHand ?? 0) - (variant.inventory?.quantityReserved ?? 0)), 0);
    return { id: product.id, name: product.name, slug: product.slug, shopName: product.shop.name, imageUrl: product.images[0]?.url ?? null, basePriceMinor: base === Number.MAX_SAFE_INTEGER ? 0 : base, effectivePriceMinor: effective, discountBasisPoints: discount, soldCount: product.soldCount, inventoryAvailable: inventory, href: `/products/${encodeURIComponent(product.slug)}` };
  }

  private async shopId(userId: string): Promise<string> { try { return (await this.sellerScope.resolve(userId)).id; } catch (error) { if (error instanceof SellerShopScopeNotFoundError) throw new MarketplaceCampaignNotFoundError(); throw error; } }

  async listSeller(userId: string, query: { cursor?: string; limit?: number; typeCode?: string; state?: string }): Promise<SellerCampaignPage> {
    const shopId = await this.shopId(userId); const limit = Math.min(Math.max(query.limit ?? 20, 1), 50); const now = new Date();
    const stateWhere: Prisma.MarketplaceCampaignWhereInput = query.state === 'JOINED' ? { participations: { some: { shopId, state: { in: [MarketplaceCampaignParticipationState.JOINED, MarketplaceCampaignParticipationState.LOCKED] } } } } : query.state === 'AVAILABLE' ? { cancelledAt: null, enrollmentEndsAt: { gt: now }, participations: { none: { shopId, state: { in: [MarketplaceCampaignParticipationState.JOINED, MarketplaceCampaignParticipationState.LOCKED] } } } } : query.state === 'UPCOMING' ? { cancelledAt: null, startsAt: { gt: now } } : query.state === 'ACTIVE' ? { cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now } } : query.state === 'ENDED' ? { cancelledAt: null, endsAt: { lte: now } } : {};
    const rows = await this.prisma.marketplaceCampaign.findMany({ where: { publishedAt: { not: null }, OR: [{ cancelledAt: null }, { participations: { some: { shopId } } }], ...(query.typeCode ? { type: { code: query.typeCode } } : {}), ...stateWhere, ...cursorWhere(query.cursor) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, include: { type: true, categories: true, participations: { where: { shopId }, include: { products: true } } } }) as unknown as CampaignGraph[];
    const items = rows.slice(0, limit).map((row) => this.summary(row, now, shopId)); return { items, nextCursor: rows.length > limit ? cursorFor(rows[limit - 1]!) : null };
  }

  async sellerDetail(userId: string, id: string): Promise<SellerCampaignDetail> {
    const shopId = await this.shopId(userId); const row = await this.campaign(id); const participation = row.participations.find((item) => item.shopId === shopId);
    if (!row.publishedAt || (row.cancelledAt && !participation)) throw new MarketplaceCampaignNotFoundError();
    const categoryIds = row.categories.map((category) => category.categoryId); const products = await this.prisma.product.findMany({ where: { shopId, ...(categoryIds.length ? { categoryId: { in: categoryIds } } : {}), deletedAt: null }, include: { shop: { select: { name: true, status: true, onboardingStatus: true, deletedAt: true } }, images: { orderBy: { sortOrder: 'asc' }, take: 1 }, variants: { where: { status: 'ACTIVE', deletedAt: null }, include: { inventory: true } } }, orderBy: { id: 'asc' }, take: 100 }) as unknown as ProductGraph[]; const conflicts = await this.prisma.productPromotionReservation.findMany({ where: { productId: { in: products.map((product) => product.id) }, isEnabled: true, startsAt: { lt: row.endsAt }, endsAt: { gt: row.startsAt }, marketplaceCampaignId: { not: id } }, select: { productId: true } }); const conflictIds = new Set(conflicts.map((conflict) => conflict.productId));
    let content: CampaignContentBlock[] = [];
    try {
      content = validateContent(Array.isArray(row.detailContentJson) ? row.detailContentJson as unknown as CampaignContentBlock[] : []);
    } catch {
      // Do not expose malformed stored content to a seller client.
      content = [];
    }
    return { ...this.summary(row, new Date(), shopId), content, imageUrl: row.detailImageUrl ?? null, altText: row.detailAltText ?? row.name, eligibleProducts: products.map((product) => { const hasInventory = product.variants.some((variant) => Math.max(0, (variant.inventory?.quantityOnHand ?? 0) - (variant.inventory?.quantityReserved ?? 0)) > 0); const sellable = product.status === ProductStatus.ACTIVE && product.moderationStatus === 'ACTIVE' && product.deletedAt === null && product.shop.status === 'ACTIVE' && product.shop.onboardingStatus === 'APPROVED' && product.shop.deletedAt === null && hasInventory; const conflict = conflictIds.has(product.id); const reason = conflict ? 'Sản phẩm đã có promotion khác trong cùng khung giờ.' : !sellable ? 'Sản phẩm chưa đủ điều kiện mở bán hoặc không còn tồn kho.' : null; return { ...this.productSummary(product, row), eligible: sellable && !conflict, reason, submittedDiscountBasisPoints: participation?.products.find((item) => item.productId === product.id)?.discountBasisPoints ?? null }; }), participationVersion: participation?.version ?? null };
  }

  async participate(userId: string, id: string, input: SellerCampaignParticipationRequest, rawIdempotencyKey?: string): Promise<CampaignParticipationResponse> {
    const shopId = await this.shopId(userId);
    const row = await this.campaign(id);
    const lifecycle = campaignLifecycleAt(row, new Date());
    if (lifecycle !== 'ENROLLMENT_OPEN') throw new MarketplaceCampaignConflictError('ENROLLMENT_CLOSED', 'Seller enrollment is closed.');
    const policy = campaignPolicyFor(row.type.code);
    if (!policy) throw new MarketplaceCampaignValidationError(['typeCode']);
    const products = input.products ?? [];
    const productIds = products.map((product) => product.productId);
    if (input.decision === 'JOINED' && (products.length === 0 || products.length > policy.maximumProductsPerSeller || new Set(productIds).size !== productIds.length)) {
      throw new MarketplaceCampaignValidationError(['products'], 'Select a unique set of eligible products for this campaign.');
    }
    const idempotencyKey = commandKey(rawIdempotencyKey);
    const requestDigest = digest({ id, input });
    const replay = await this.prisma.marketplaceCampaignCommand.findUnique({ where: { actorUserId_idempotencyKey: { actorUserId: userId, idempotencyKey } } });
    if (replay) { if (replay.requestDigest !== requestDigest) throw new MarketplaceCampaignConflictError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for different input.'); return replay.response as unknown as CampaignParticipationResponse; }
    const result = await this.prisma.$transaction(async (tx) => {
      const clock = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`);
      const transactionNow = clock[0]?.now;
      const currentCampaign = await tx.marketplaceCampaign.findUnique({
        where: { id },
        select: {
          publishedAt: true,
          cancelledAt: true,
          enrollmentStartsAt: true,
          enrollmentEndsAt: true,
          startsAt: true,
          endsAt: true,
          minimumDiscountBasisPoints: true,
          categories: { select: { categoryId: true } },
        },
      });
      if (
        !currentCampaign?.publishedAt ||
        currentCampaign.cancelledAt ||
        !(transactionNow instanceof Date) ||
        transactionNow < currentCampaign.enrollmentStartsAt ||
        transactionNow >= currentCampaign.enrollmentEndsAt
      ) {
        throw new MarketplaceCampaignConflictError('ENROLLMENT_CLOSED', 'Seller enrollment is closed.');
      }
      const existing = await tx.sellerCampaignParticipation.findUnique({ where: { campaignId_shopId: { campaignId: id, shopId } }, include: { products: true } });
      if (existing && input.version !== null && input.version !== undefined && existing.version !== input.version) throw new MarketplaceCampaignStaleError(existing.version);
      const state = input.decision === 'JOINED' ? 'JOINED' : 'DECLINED';
      if (state === 'JOINED') {
        const owned = await tx.product.findMany({ where: { shopId, id: { in: productIds }, deletedAt: null }, select: { id: true, status: true, moderationStatus: true, categoryId: true, variants: { where: { status: 'ACTIVE', deletedAt: null }, include: { inventory: true } } } });
        if (owned.length !== productIds.length) throw new MarketplaceCampaignValidationError(['products'], 'One or more products do not belong to this shop.');
        const categoryIds = new Set(currentCampaign.categories.map(({ categoryId }) => categoryId));
        for (const product of products) {
          const ownedProduct = owned.find((candidate) => candidate.id === product.productId)!;
          const hasInventory = ownedProduct.variants.some((variant) => Math.max(0, (variant.inventory?.quantityOnHand ?? 0) - (variant.inventory?.quantityReserved ?? 0)) > 0);
          if (product.discountBasisPoints < currentCampaign.minimumDiscountBasisPoints || product.discountBasisPoints > 9000) throw new MarketplaceCampaignValidationError(['products'], 'Each discount must satisfy the campaign policy.');
          if (ownedProduct.status !== ProductStatus.ACTIVE || ownedProduct.moderationStatus !== 'ACTIVE' || !hasInventory || (categoryIds.size > 0 && !categoryIds.has(ownedProduct.categoryId))) throw new MarketplaceCampaignValidationError(['products'], 'One or more products are not eligible for this campaign.');
        }
      }
      // Complete-set replacement must release the previous window before the
      // new reservation rows are inserted, otherwise a revision would collide
      // with its own prior reservation at the database exclusion constraint.
      await tx.productPromotionReservation.updateMany({ where: { marketplaceCampaignId: id, shopId }, data: { isEnabled: false } });
      const saved = existing ? await tx.sellerCampaignParticipation.update({ where: { id: existing.id }, data: { state, respondedAt: transactionNow, version: { increment: 1 } }, include: { products: true } }) : await tx.sellerCampaignParticipation.create({ data: { campaignId: id, shopId, state, respondedAt: transactionNow }, include: { products: true } });
      await tx.sellerCampaignProduct.deleteMany({ where: { participationId: saved.id } });
      if (state === 'JOINED') {
        await tx.sellerCampaignProduct.createMany({ data: products.map((product) => ({ participationId: saved.id, productId: product.productId, discountBasisPoints: product.discountBasisPoints })) });
        await tx.productPromotionReservation.createMany({ data: products.map((product) => ({ id: randomUUID(), productId: product.productId, shopId, source: 'MARKETPLACE_CAMPAIGN', marketplaceCampaignId: id, discountBasisPoints: product.discountBasisPoints, startsAt: currentCampaign.startsAt, endsAt: currentCampaign.endsAt })) });
      }
      const final = await tx.sellerCampaignParticipation.findUniqueOrThrow({ where: { id: saved.id }, include: { products: true } }); const response: CampaignParticipationResponse = { campaignId: id, state: final.state, version: final.version, products: final.products.map((product) => ({ productId: product.productId, discountBasisPoints: product.discountBasisPoints })), updatedAt: final.updatedAt.toISOString() }; await tx.marketplaceCampaignAudit.create({ data: { id: randomUUID(), actorUserId: userId, campaignId: id, participationId: saved.id, action: state === 'JOINED' ? 'SELLER_JOINED' : 'SELLER_DECLINED', versionTo: final.version } }); await tx.marketplaceCampaignCommand.create({ data: { id: randomUUID(), actorUserId: userId, campaignId: id, scope: 'SELLER_PARTICIPATION', idempotencyKey, requestDigest, response: response as unknown as Prisma.InputJsonValue } }); return response;
    }).catch((error) => {
      if (error instanceof MarketplaceCampaignError) throw error;
      if (error?.code === '23P01' || /exclusion constraint/i.test(String(error?.message ?? ''))) {
        throw new MarketplaceCampaignConflictError(
          'PRODUCT_PROMOTION_CONFLICT',
          'A product already has another promotion in this time window.',
        );
      }
      throw error;
    });
    return result;
  }

  async withdraw(userId: string, id: string, version: number, actorUserId: string, rawIdempotencyKey?: string): Promise<CampaignParticipationResponse> {
    const idempotencyKey = commandKey(rawIdempotencyKey);
    const campaign = await this.campaign(id);
    if (campaign.cancelledAt || new Date() >= campaign.enrollmentEndsAt) {
      throw new MarketplaceCampaignConflictError('ENROLLMENT_CLOSED', 'Seller withdrawal is closed.');
    }
    const requestDigest = digest({ id, version, action: 'WITHDRAW' });
    const replay = await this.prisma.marketplaceCampaignCommand.findUnique({ where: { actorUserId_idempotencyKey: { actorUserId, idempotencyKey } } });
    if (replay) { if (replay.requestDigest !== requestDigest) throw new MarketplaceCampaignConflictError('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for different input.'); return replay.response as unknown as CampaignParticipationResponse; }
    const shopId = await this.shopId(userId);
    const result = await this.prisma.$transaction(async (tx) => {
      const clock = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT clock_timestamp() AS "now"`);
      const currentCampaign = await tx.marketplaceCampaign.findUnique({
        where: { id },
        select: { publishedAt: true, cancelledAt: true, enrollmentEndsAt: true },
      });
      if (
        !currentCampaign?.publishedAt ||
        currentCampaign.cancelledAt ||
        !(clock[0]?.now instanceof Date) ||
        clock[0]!.now >= currentCampaign.enrollmentEndsAt
      ) {
        throw new MarketplaceCampaignConflictError('ENROLLMENT_CLOSED', 'Seller withdrawal is closed.');
      }
      const current = await tx.sellerCampaignParticipation.findUnique({ where: { campaignId_shopId: { campaignId: id, shopId } }, include: { products: true } });
      if (!current) throw new MarketplaceCampaignNotFoundError();
      if (current.version !== version) throw new MarketplaceCampaignStaleError(current.version);
      const saved = await tx.sellerCampaignParticipation.update({ where: { id: current.id }, data: { state: 'WITHDRAWN', version: { increment: 1 }, respondedAt: clock[0]!.now }, include: { products: true } });
      await tx.productPromotionReservation.updateMany({ where: { marketplaceCampaignId: id, shopId }, data: { isEnabled: false } });
      const response: CampaignParticipationResponse = { campaignId: id, state: saved.state, version: saved.version, products: saved.products.map((product) => ({ productId: product.productId, discountBasisPoints: product.discountBasisPoints })), updatedAt: saved.updatedAt.toISOString() };
      await tx.marketplaceCampaignAudit.create({ data: { id: randomUUID(), actorUserId, campaignId: id, participationId: current.id, action: 'SELLER_WITHDRAWN', versionFrom: current.version, versionTo: saved.version } });
      await tx.marketplaceCampaignCommand.create({ data: { id: randomUUID(), actorUserId, campaignId: id, scope: 'SELLER_WITHDRAW', idempotencyKey, requestDigest, response: response as unknown as Prisma.InputJsonValue } });
      return response;
    });
    return result;
  }
}

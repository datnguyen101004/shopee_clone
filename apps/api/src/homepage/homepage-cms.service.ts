import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminBannerListResponse,
  AdminBannerSummary,
  CreateAdminBannerRequest,
  ReorderAdminBannersRequest,
  UpdateAdminBannerRequest,
} from '@shopee-clone/contracts';
import {
  campaignLifecycleAt,
  isAllowedMediaUrl,
  isValidBannerDestination,
} from '@shopee-clone/contracts';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client';
import { PrivilegedAction, PrivilegedTargetType } from '../generated/prisma/client';
import { AdminInvalidInputError, AdminNotFoundError } from '../admin/admin.errors';
import { recordPrivilegedAudit } from '../admin/privileged-audit.helper';
import { PrismaService } from '../prisma/prisma.service';

type BannerTargetType = 'CAMPAIGN' | 'PRODUCT' | 'SHOP' | 'CATEGORY' | 'SEARCH' | 'URL';

const BANNER_TARGET_TYPES: readonly BannerTargetType[] = [
  'CAMPAIGN',
  'PRODUCT',
  'SHOP',
  'CATEGORY',
  'SEARCH',
  'URL',
];

function asText(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 && normalized.length <= max ? normalized : null;
}

function asDate(value: string | null | undefined, field: string): Date | null {
  if (value == null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new AdminInvalidInputError(`${field} must be a valid ISO date.`);
  return parsed;
}

function targetTypeOf(banner: { targetType: string | null }): BannerTargetType {
  if (banner.targetType && BANNER_TARGET_TYPES.includes(banner.targetType as BannerTargetType)) {
    return banner.targetType as BannerTargetType;
  }
  return 'URL';
}

@Injectable()
export class HomepageCmsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async campaignIsActive(client: PrismaService | Prisma.TransactionClient, id: string) {
    const campaign = await client.marketplaceCampaign.findUnique({
      where: { id },
      select: {
        id: true,
        publishedAt: true,
        cancelledAt: true,
        announceAt: true,
        enrollmentStartsAt: true,
        enrollmentEndsAt: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (!campaign || campaignLifecycleAt(campaign) !== 'ACTIVE') {
      throw new AdminInvalidInputError(
        'Campaign target must reference an existing published campaign that is currently ACTIVE.',
        { field: 'targetId', targetType: 'CAMPAIGN', targetId: id },
      );
    }
    return campaign;
  }

  private async validateTarget(
    client: PrismaService | Prisma.TransactionClient,
    input: Pick<CreateAdminBannerRequest, 'targetType' | 'targetId' | 'targetQuery' | 'href'>,
  ): Promise<{ type: BannerTargetType; id: string | null; query: string | null }> {
    const type = input.targetType;
    if (!type || !BANNER_TARGET_TYPES.includes(type)) {
      throw new AdminInvalidInputError('A typed banner target is required.');
    }

    if (['CAMPAIGN', 'PRODUCT', 'SHOP', 'CATEGORY'].includes(type)) {
      if (!input.targetId) throw new AdminInvalidInputError(`${type} target requires targetId.`);
      if (type === 'CAMPAIGN') await this.campaignIsActive(client, input.targetId);
      if (type === 'PRODUCT') {
        const row = await client.product.findUnique({
          where: { id: input.targetId },
          select: { id: true },
        });
        if (!row) throw new AdminInvalidInputError('Product target does not exist.');
      }
      if (type === 'SHOP') {
        const row = await client.shop.findUnique({
          where: { id: input.targetId },
          select: { id: true },
        });
        if (!row) throw new AdminInvalidInputError('Shop target does not exist.');
      }
      if (type === 'CATEGORY') {
        const row = await client.category.findFirst({
          where: { id: input.targetId, deletedAt: null },
          select: { id: true },
        });
        if (!row) throw new AdminInvalidInputError('Category target does not exist.');
      }
      return { type, id: input.targetId, query: null };
    }

    const query = asText(input.targetQuery ?? input.href, 500);
    if (!query) throw new AdminInvalidInputError(`${type} target requires a value.`);
    if (type === 'SEARCH') return { type, id: null, query };
    if (!isValidBannerDestination(query))
      throw new AdminInvalidInputError('URL target must be a safe same-origin relative path.');
    return { type, id: null, query };
  }

  private async resolveHref(
    client: PrismaService | Prisma.TransactionClient,
    banner: {
      targetType: string | null;
      targetId: string | null;
      targetQuery: string | null;
    },
  ): Promise<{
    type: BannerTargetType;
    href?: string;
    id: string | null;
    name?: string;
    imageUrl?: string | null;
    query: string | null;
    available: boolean;
  }> {
    const type = targetTypeOf(banner);
    const id = banner.targetId;
    const query = banner.targetQuery;
    if (type === 'CAMPAIGN') {
      if (!id) return { type, href: undefined, id: null, query: null, available: false };
      const campaign = await client.marketplaceCampaign.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          announceAt: true,
          enrollmentStartsAt: true,
          enrollmentEndsAt: true,
          startsAt: true,
          endsAt: true,
          publishedAt: true,
          cancelledAt: true,
        },
      });
      return campaign && campaignLifecycleAt(campaign) === 'ACTIVE'
        ? {
            type,
            href: `/campaigns/${encodeURIComponent(id)}`,
            id,
            name: campaign.name,
            imageUrl: null,
            query: null,
            available: true,
          }
        : {
            type,
            id,
            name: campaign?.name,
            imageUrl: null,
            query: null,
            available: false,
          };
    }
    if (type === 'PRODUCT') {
      const product = id
        ? await client.product.findUnique({
            where: { id },
            select: {
              id: true,
              slug: true,
              name: true,
              status: true,
              deletedAt: true,
              images: {
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                take: 1,
                select: { url: true },
              },
            },
          })
        : null;
      const imageUrl = product?.images[0]?.url ?? null;
      return product && product.status === 'ACTIVE' && product.deletedAt === null
        ? {
            type,
            href: `/products/${encodeURIComponent(product.slug || product.id)}`,
            id,
            name: product.name,
            imageUrl,
            query: null,
            available: true,
          }
        : { type, id, name: product?.name, imageUrl, query: null, available: false };
    }
    if (type === 'SHOP') {
      const shop = id
        ? await client.shop.findUnique({
            where: { id },
            select: {
              slug: true,
              name: true,
              logoUrl: true,
              status: true,
              onboardingStatus: true,
              deletedAt: true,
            },
          })
        : null;
      return shop &&
        shop.status === 'ACTIVE' &&
        shop.onboardingStatus === 'APPROVED' &&
        shop.deletedAt === null
        ? {
            type,
            href: `/shops/${encodeURIComponent(shop.slug)}`,
            id,
            name: shop.name,
            imageUrl: shop.logoUrl,
            query: null,
            available: true,
          }
        : {
            type,
            id,
            name: shop?.name,
            imageUrl: shop?.logoUrl ?? null,
            query: null,
            available: false,
          };
    }
    if (type === 'CATEGORY') {
      const category = id
        ? await client.category.findFirst({
            where: { id },
            select: { slug: true, name: true, isActive: true, deletedAt: true },
          })
        : null;
      return category
        ? {
            type,
            ...(category.isActive && category.deletedAt === null
              ? { href: `/search?category=${encodeURIComponent(category.slug)}` }
              : {}),
            id,
            name: category.name,
            imageUrl: null,
            query: null,
            available: category.isActive && category.deletedAt === null,
          }
        : { type, id, query: null, available: false };
    }
    if (type === 'SEARCH') {
      return query
        ? { type, href: `/search?q=${encodeURIComponent(query)}`, id: null, query, available: true }
        : { type, id: null, query: null, available: false };
    }
    return query && isValidBannerDestination(query)
      ? { type, href: query, id: null, query, available: true }
      : { type, id: null, query, available: false };
  }

  private summary(
    banner: {
      id: string;
      eyebrow: string | null;
      title: string;
      description: string | null;
      imageUrl: string | null;
      altText: string | null;
      themeKey: string;
      sortOrder: number;
      priority: number;
      targetType: string | null;
      targetId: string | null;
      targetQuery: string | null;
      displayFrom?: Date | null;
      displayUntil?: Date | null;
      isEnabled?: boolean;
    },
    target: Awaited<ReturnType<HomepageCmsService['resolveHref']>>,
  ): AdminBannerSummary {
    return {
      id: banner.id,
      eyebrow: banner.eyebrow ?? undefined,
      title: banner.title,
      description: banner.description ?? undefined,
      imageUrl: banner.imageUrl,
      altText: banner.altText ?? banner.title,
      ...(target.href ? { href: target.href } : {}),
      theme: banner.themeKey,
      targetType: target.type,
      targetId: target.id,
      ...(target.name ? { targetName: target.name } : {}),
      ...(target.imageUrl !== undefined ? { targetImageUrl: target.imageUrl } : {}),
      targetQuery: target.query,
      targetAvailable: target.available,
      displayFrom: banner.displayFrom?.toISOString() ?? null,
      displayUntil: banner.displayUntil?.toISOString() ?? null,
      isEnabled: banner.isEnabled,
      priority: banner.priority,
      sortOrder: banner.priority,
      // HomepageBanner predates timestamps; keep the stable id as the
      // compatibility value until the admin contract no longer requires it.
      createdAt: banner.id,
      updatedAt: banner.id,
    };
  }

  async listBanners(): Promise<AdminBannerListResponse> {
    const module = await this.prisma.homepageModule.findFirst({
      where: { type: 'CAMPAIGN_BANNER' },
    });
    if (!module) return { items: [] };
    const banners = await this.prisma.homepageBanner.findMany({
      where: { moduleId: module.id },
      orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
    const items = await Promise.all(
      banners.map(async (banner) =>
        this.summary(banner, await this.resolveHref(this.prisma, banner)),
      ),
    );
    return { items };
  }

  async createBanner(
    actorUserId: string,
    input: CreateAdminBannerRequest,
  ): Promise<AdminBannerSummary> {
    const title = asText(input.title, 160);
    const altText = asText(input.altText, 240);
    const theme = asText(input.theme, 50) ?? 'brand';
    if (!title || !altText)
      throw new AdminInvalidInputError('Banner title and alt text are required.');
    if (input.imageUrl && !isAllowedMediaUrl(input.imageUrl))
      throw new AdminInvalidInputError('Banner image URL is not allowlisted.');
    const displayFrom = asDate(input.displayFrom, 'displayFrom');
    const displayUntil = asDate(input.displayUntil, 'displayUntil');
    if (displayFrom && displayUntil && displayUntil <= displayFrom)
      throw new AdminInvalidInputError('displayUntil must be later than displayFrom.');

    return this.prisma.$transaction(async (tx) => {
      const module = await tx.homepageModule.findFirst({ where: { type: 'CAMPAIGN_BANNER' } });
      if (!module) throw new AdminNotFoundError('Campaign banner homepage module');
      const target = await this.validateTarget(tx, input);
      const priority = input.priority ?? input.sortOrder ?? 0;
      const lastBanner = await tx.homepageBanner.findFirst({
        where: { moduleId: module.id },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      const banner = await tx.homepageBanner.create({
        data: {
          id: randomUUID(),
          moduleId: module.id,
          eyebrow: asText(input.eyebrow, 80),
          title,
          description: asText(input.description, 320),
          imageUrl: input.imageUrl ?? null,
          altText,
          themeKey: theme,
          sortOrder: (lastBanner?.sortOrder ?? -1) + 1,
          targetType: target.type,
          targetId: target.id,
          targetQuery: target.query,
          displayFrom,
          displayUntil,
          isEnabled: input.isEnabled ?? true,
          priority,
        },
      });
      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.BANNER,
        targetId: banner.id,
        action: PrivilegedAction.CREATE,
        reason: `Created CMS banner ${banner.title}`,
        afterSummary: {
          title: banner.title,
          targetType: target.type,
          targetId: target.id,
          priority,
        },
      });
      return this.summary(banner, await this.resolveHref(tx, banner));
    });
  }

  async updateBanner(
    actorUserId: string,
    id: string,
    input: UpdateAdminBannerRequest,
  ): Promise<AdminBannerSummary> {
    if (
      input.imageUrl !== undefined &&
      input.imageUrl !== null &&
      !isAllowedMediaUrl(input.imageUrl)
    )
      throw new AdminInvalidInputError('Banner image URL is not allowlisted.');
    const displayFrom =
      input.displayFrom === undefined ? undefined : asDate(input.displayFrom, 'displayFrom');
    const displayUntil =
      input.displayUntil === undefined ? undefined : asDate(input.displayUntil, 'displayUntil');
    if (displayFrom && displayUntil && displayUntil <= displayFrom)
      throw new AdminInvalidInputError('displayUntil must be later than displayFrom.');

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.homepageBanner.findUnique({ where: { id } });
      if (!current) throw new AdminNotFoundError('Banner');
      const nextDisplayFrom = input.displayFrom === undefined ? current.displayFrom : displayFrom;
      const nextDisplayUntil =
        input.displayUntil === undefined ? current.displayUntil : displayUntil;
      if (nextDisplayFrom && nextDisplayUntil && nextDisplayUntil <= nextDisplayFrom) {
        throw new AdminInvalidInputError('displayUntil must be later than displayFrom.');
      }
      const targetChanged =
        input.targetType !== undefined ||
        input.targetId !== undefined ||
        input.targetQuery !== undefined ||
        input.href !== undefined;
      const validatedTarget = targetChanged
        ? await this.validateTarget(tx, {
            targetType: input.targetType ?? targetTypeOf(current),
            targetId: input.targetId === undefined ? current.targetId : input.targetId,
            targetQuery: input.targetQuery === undefined ? current.targetQuery : input.targetQuery,
            href: input.href,
          })
        : undefined;
      const target = validatedTarget ?? (await this.resolveHref(tx, current));
      const titleValue = input.title === undefined ? undefined : asText(input.title, 160);
      if (input.title !== undefined && !titleValue)
        throw new AdminInvalidInputError('Banner title is invalid.');
      const title = titleValue ?? undefined;
      const priority = input.priority ?? input.sortOrder;
      const banner = await tx.homepageBanner.update({
        where: { id },
        data: {
          eyebrow: input.eyebrow === undefined ? undefined : asText(input.eyebrow, 80),
          title,
          description: input.description === undefined ? undefined : asText(input.description, 320),
          imageUrl: input.imageUrl,
          altText: input.altText === undefined ? undefined : asText(input.altText, 240),
          themeKey: input.theme === undefined ? undefined : (asText(input.theme, 50) ?? 'brand'),
          sortOrder: priority,
          targetType: validatedTarget?.type,
          targetId: validatedTarget?.id,
          targetQuery: validatedTarget?.query,
          displayFrom,
          displayUntil,
          isEnabled: input.isEnabled,
          priority,
        },
      });
      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.BANNER,
        targetId: id,
        action: PrivilegedAction.UPDATE,
        reason: `Updated CMS banner ${banner.title}`,
        beforeSummary: {
          title: current.title,
          targetType: targetTypeOf(current),
          targetId: current.targetId,
        },
        afterSummary: {
          title: banner.title,
          targetType: target.type,
          targetId: target.id,
          priority: banner.priority,
        },
      });
      return this.summary(banner, await this.resolveHref(tx, banner));
    });
  }

  async deleteBanner(actorUserId: string, id: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const banner = await tx.homepageBanner.findUnique({ where: { id } });
      if (!banner) throw new AdminNotFoundError('Banner');
      await tx.homepageBanner.delete({ where: { id } });
      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.BANNER,
        targetId: id,
        action: PrivilegedAction.DELETE,
        reason: `Deleted CMS banner ${banner.title}`,
        beforeSummary: {
          title: banner.title,
          targetType: targetTypeOf(banner),
          targetId: banner.targetId,
        },
      });
    });
  }

  async reorderBanners(
    actorUserId: string,
    input: ReorderAdminBannersRequest,
  ): Promise<AdminBannerSummary[]> {
    return this.prisma.$transaction(async (tx) => {
      // Avoid transient unique(moduleId, sortOrder) conflicts while swapping rows.
      for (const [index, item] of input.items.entries()) {
        await tx.homepageBanner.update({
          where: { id: item.id },
          data: { sortOrder: -1_000_000 - index },
        });
      }
      for (const item of input.items) {
        await tx.homepageBanner.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder, priority: item.sortOrder },
        });
      }
      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.BANNER,
        targetId: input.items[0]?.id ?? actorUserId,
        action: PrivilegedAction.REORDER,
        reason: `Reordered ${input.items.length} CMS banners`,
        afterSummary: { reorderedCount: input.items.length },
      });
      const module = await tx.homepageModule.findFirst({ where: { type: 'CAMPAIGN_BANNER' } });
      if (!module) return [];
      const banners = await tx.homepageBanner.findMany({
        where: { moduleId: module.id },
        orderBy: [{ priority: 'asc' }, { id: 'asc' }],
      });
      return Promise.all(
        banners.map(async (banner) => this.summary(banner, await this.resolveHref(tx, banner))),
      );
    });
  }
}

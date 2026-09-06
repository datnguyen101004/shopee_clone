import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import {
  campaignAnnouncementNotificationEvent,
  campaignEnrollmentReminderNotificationEvent,
  homepageBannerCampaignTargetUnavailableEvent,
} from '../notifications/notification-events';

const SWEEP_LIMIT = 50;

function reminderHours(): number {
  const configured = Number(process.env.CAMPAIGN_ENROLLMENT_REMINDER_HOURS ?? 24);
  return Number.isFinite(configured) ? Math.min(Math.max(Math.floor(configured), 1), 168) : 24;
}

/** Lifecycle correctness remains database driven; this worker only claims a
 * bounded due set and fans out idempotent seller notifications. */
@Injectable()
export class CampaignNotificationScheduler {
  private readonly logger = new Logger(CampaignNotificationScheduler.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  @Cron('*/5 * * * *')
  async sweep(): Promise<void> {
    const now = new Date();
    await this.reconcileHomepageBannerTargets(now);
    const reminderAt = new Date(now.getTime() + reminderHours() * 60 * 60 * 1000);
    // Row locks avoid selecting the same due campaigns concurrently. The
    // versioned notification key remains the final retry/concurrency guard.
    const claimed = await this.prisma.$transaction((tx) =>
      tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "marketplace_campaigns"
        WHERE "published_at" IS NOT NULL
          AND "cancelled_at" IS NULL
          AND "announce_at" <= ${now}
          AND "enrollment_ends_at" > ${now}
        ORDER BY "announce_at" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${SWEEP_LIMIT}
      `),
    );
    if (!claimed.length) return;

    const campaigns = await this.prisma.marketplaceCampaign.findMany({
      where: { id: { in: claimed.map(({ id }) => id) } },
      include: {
        type: true,
        categories: { select: { categoryId: true } },
        participations: { select: { shopId: true, state: true } },
      },
    });
    const shops = await this.prisma.shop.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        onboardingStatus: 'APPROVED',
        products: { some: { status: 'ACTIVE', deletedAt: null, moderationStatus: 'ACTIVE' } },
      },
      select: { id: true, ownerId: true, products: { where: { status: 'ACTIVE', deletedAt: null, moderationStatus: 'ACTIVE' }, select: { categoryId: true } } },
    });
    for (const campaign of campaigns) {
      const categoryIds = new Set(campaign.categories.map(({ categoryId }) => categoryId));
      const eligibleShops = shops.filter((shop) =>
        (categoryIds.size === 0 || shop.products.some((product) => categoryIds.has(product.categoryId))) &&
        !campaign.participations.some((item) => item.shopId === shop.id && item.state !== 'UNRESPONDED'),
      );
      // Materialize the invitation row before fan-out. This makes a seller's
      // later response explicit and lets repeated sweeps skip responders even
      // when the notification provider is temporarily unavailable.
      if (eligibleShops.length) {
        await this.prisma.sellerCampaignParticipation.createMany({
          data: eligibleShops.map((shop) => ({ campaignId: campaign.id, shopId: shop.id, state: 'UNRESPONDED' })),
          skipDuplicates: true,
        });
      }
      const responses = await this.prisma.sellerCampaignParticipation.findMany({ where: { campaignId: campaign.id, shopId: { in: eligibleShops.map((shop) => shop.id) } }, select: { shopId: true, state: true } });
      const owners = [...new Set(eligibleShops.filter((shop) => !responses.some((response) => response.shopId === shop.id && response.state !== 'UNRESPONDED')).map((shop) => shop.ownerId))];
      if (!owners.length) continue;
      try {
        await this.notifications.notify(
          campaignAnnouncementNotificationEvent({ campaignId: campaign.id, typeCode: campaign.type.code, title: campaign.name, enrollmentEndsAt: campaign.enrollmentEndsAt, version: campaign.version, sellerOwnerIds: owners }),
        );
        if (campaign.enrollmentEndsAt <= reminderAt) {
          await this.notifications.notify(
            campaignEnrollmentReminderNotificationEvent({
            campaignId: campaign.id,
            typeCode: campaign.type.code,
            title: campaign.name,
            enrollmentEndsAt: campaign.enrollmentEndsAt,
            version: campaign.version,
            sellerOwnerIds: owners,
            }),
          );
        }
      } catch (error) {
        this.logger.warn(`campaign notification delivery failed campaign=${campaign.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
    this.logger.debug(`campaign notification sweep claimed=${campaigns.length} limit=${SWEEP_LIMIT}`);
  }

  /**
   * Campaigns are independent from CMS banners, so expiry/cancellation can
   * invalidate a target without a campaign write touching the banner row.
   * Reconciliation emits one stable admin notification per banner/failure
   * reason; NotificationService provides the final recipient-level dedupe.
   */
  private async reconcileHomepageBannerTargets(now: Date): Promise<void> {
    const banners = await this.prisma.homepageBanner.findMany({
      where: { isEnabled: true, targetType: 'CAMPAIGN', targetId: { not: null } },
      select: { id: true, targetId: true },
    });
    if (!banners.length) return;

    const campaignIds = banners.flatMap((banner) => banner.targetId ? [banner.targetId] : []);
    const [campaigns, admins] = await Promise.all([
      this.prisma.marketplaceCampaign.findMany({
        where: { id: { in: campaignIds } },
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
      }),
      this.prisma.user.findMany({
        where: { status: 'ACTIVE', deletedAt: null, roleAssignments: { some: { role: 'ADMIN' } } },
        select: { id: true },
      }),
    ]);
    if (!admins.length) return;

    const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
    await Promise.all(banners.map(async (banner) => {
      if (!banner.targetId) return;
      const campaign = campaignById.get(banner.targetId);
      let reason: 'ENDED' | 'CANCELLED' | 'MISSING' | 'FETCH_FAILED' = 'MISSING';
      if (campaign) {
        reason = campaign.cancelledAt
          ? 'CANCELLED'
          : campaign.endsAt <= now
            ? 'ENDED'
            : 'FETCH_FAILED';
      }
      if (campaign && campaign.publishedAt && campaign.cancelledAt === null && campaign.endsAt > now && campaign.startsAt <= now) return;
      await this.notifications.notify(
        homepageBannerCampaignTargetUnavailableEvent({
          bannerId: banner.id,
          campaignId: banner.targetId,
          reason,
          adminUserIds: admins.map(({ id }) => id),
        }),
      );
    }));
  }
}

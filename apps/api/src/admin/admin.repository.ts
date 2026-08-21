import {
  ADMIN_DEFAULT_LIMIT,
  ADMIN_MAX_LIMIT,
  type AdminCategorySummary,
  type AdminDashboardCounts,
  type AdminPrivilegedAction,
  type AdminPrivilegedTargetType,
  type AdminShopOnboardingStatus,
  type AdminShopStatus,
  type AdminUserStatus,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma ,
  PrivilegedAction,
  PrivilegedTargetType} from '../generated/prisma/client';
import {
  MarketplaceRole,
  ProductModerationStatus,
  ShopOnboardingStatus,
  ShopStatus,
  UserStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';


export interface AdminUserListItem {
  id: string;
  email: string;
  displayName: string;
  phoneNumber: string | null;
  status: AdminUserStatus;
  roles: ('buyer' | 'seller' | 'admin')[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminShopListItem {
  id: string;
  ownerUserId: string;
  slug: string;
  name: string;
  status: AdminShopStatus;
  onboardingStatus: AdminShopOnboardingStatus;
  onboardingReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AdminRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async countDashboardMetrics(): Promise<AdminDashboardCounts> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      usersCount,
      activeUsersCount,
      suspendedUsersCount,
      shopsCount,
      pendingShopApprovalsCount,
      categoriesCount,
      activeCategoriesCount,
      homepageBannersCount,
      enabledHomepageModulesCount,
      recentAuditEventsCount,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE, deletedAt: null } }),
      this.prisma.user.count({ where: { status: UserStatus.SUSPENDED, deletedAt: null } }),
      this.prisma.shop.count({ where: { deletedAt: null } }),
      this.prisma.shop.count({
        where: {
          onboardingStatus: ShopOnboardingStatus.PENDING_APPROVAL,
          deletedAt: null,
        },
      }),
      this.prisma.category.count({ where: { deletedAt: null } }),
      this.prisma.category.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.homepageBanner.count(),
      this.prisma.homepageModule.count({ where: { isEnabled: true } }),
      this.prisma.privilegedAuditEvent.count({ where: { createdAt: { gte: oneDayAgo } } }),
    ]);

    return {
      usersCount,
      activeUsersCount,
      suspendedUsersCount,
      shopsCount,
      pendingShopApprovalsCount,
      categoriesCount,
      activeCategoriesCount,
      homepageBannersCount,
      enabledHomepageModulesCount,
      recentAuditEventsCount,
    };
  }

  async listUsers(options: {
    limit?: number;
    cursor?: string;
    status?: AdminUserStatus;
    role?: 'buyer' | 'seller' | 'admin';
    q?: string;
  }): Promise<{ items: AdminUserListItem[]; nextCursor: string | null }> {
    const limit = Math.min(options.limit ?? ADMIN_DEFAULT_LIMIT, ADMIN_MAX_LIMIT);
    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (options.status) {
      where.status = options.status === 'ACTIVE' ? UserStatus.ACTIVE : UserStatus.SUSPENDED;
    }
    if (options.role) {
      const roleEnum =
        options.role === 'admin'
          ? MarketplaceRole.ADMIN
          : options.role === 'seller'
            ? MarketplaceRole.SELLER
            : MarketplaceRole.BUYER;
      where.roleAssignments = { some: { role: roleEnum } };
    }
    if (options.q && options.q.trim().length > 0) {
      const search = options.q.trim();
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.user.findMany({
      where,
      take: limit + 1,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        email: true,
        displayName: true,
        phoneNumber: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        roleAssignments: { select: { role: true } },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? (items[items.length - 1]?.id ?? null) : null;

    return {
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        phoneNumber: u.phoneNumber,
        status: u.status === UserStatus.ACTIVE ? 'ACTIVE' : 'SUSPENDED',
        roles: u.roleAssignments.map((r) =>
          r.role === MarketplaceRole.ADMIN
            ? 'admin'
            : r.role === MarketplaceRole.SELLER
              ? 'seller'
              : 'buyer',
        ),
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      nextCursor,
    };
  }

  async findUserById(id: string, tx?: Prisma.TransactionClient): Promise<AdminUserListItem | null> {
    const client = tx ?? this.prisma;
    const user = await client.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        displayName: true,
        phoneNumber: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        roleAssignments: { select: { role: true } },
      },
    });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber,
      status: user.status === UserStatus.ACTIVE ? 'ACTIVE' : 'SUSPENDED',
      roles: user.roleAssignments.map((r) =>
        r.role === MarketplaceRole.ADMIN
          ? 'admin'
          : r.role === MarketplaceRole.SELLER
            ? 'seller'
            : 'buyer',
      ),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async countActiveAdmins(tx?: Prisma.TransactionClient): Promise<number> {
    const client = tx ?? this.prisma;
    return client.user.count({
      where: {
        status: UserStatus.ACTIVE,
        deletedAt: null,
        roleAssignments: { some: { role: MarketplaceRole.ADMIN } },
      },
    });
  }

  async listShops(options: {
    limit?: number;
    cursor?: string;
    status?: AdminShopStatus;
    onboardingStatus?: AdminShopOnboardingStatus;
    q?: string;
  }): Promise<{ items: AdminShopListItem[]; nextCursor: string | null }> {
    const limit = Math.min(options.limit ?? ADMIN_DEFAULT_LIMIT, ADMIN_MAX_LIMIT);
    const where: Prisma.ShopWhereInput = { deletedAt: null };

    if (options.status) {
      where.status =
        options.status === 'ACTIVE'
          ? ShopStatus.ACTIVE
          : options.status === 'SUSPENDED'
            ? ShopStatus.SUSPENDED
            : ShopStatus.INACTIVE;
    }
    if (options.onboardingStatus) {
      where.onboardingStatus =
        options.onboardingStatus === 'APPROVED'
          ? ShopOnboardingStatus.APPROVED
          : options.onboardingStatus === 'REJECTED'
            ? ShopOnboardingStatus.REJECTED
            : ShopOnboardingStatus.PENDING_APPROVAL;
    }
    if (options.q && options.q.trim().length > 0) {
      const search = options.q.trim();
      where.OR = [
        { slug: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.shop.findMany({
      where,
      take: limit + 1,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        ownerId: true,
        slug: true,
        name: true,
        status: true,
        onboardingStatus: true,
        onboardingReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? (items[items.length - 1]?.id ?? null) : null;

    return {
      items: items.map((s) => ({
        id: s.id,
        ownerUserId: s.ownerId,
        slug: s.slug,
        name: s.name,
        status:
          s.status === ShopStatus.ACTIVE
            ? 'ACTIVE'
            : s.status === ShopStatus.SUSPENDED
              ? 'SUSPENDED'
              : 'INACTIVE',
        onboardingStatus:
          s.onboardingStatus === ShopOnboardingStatus.APPROVED
            ? 'APPROVED'
            : s.onboardingStatus === ShopOnboardingStatus.REJECTED
              ? 'REJECTED'
              : 'PENDING_APPROVAL',
        onboardingReason: s.onboardingReason,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      nextCursor,
    };
  }

  async findShopById(id: string, tx?: Prisma.TransactionClient): Promise<AdminShopListItem | null> {
    const client = tx ?? this.prisma;
    const s = await client.shop.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        ownerId: true,
        slug: true,
        name: true,
        status: true,
        onboardingStatus: true,
        onboardingReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!s) return null;
    return {
      id: s.id,
      ownerUserId: s.ownerId,
      slug: s.slug,
      name: s.name,
      status:
        s.status === ShopStatus.ACTIVE
          ? 'ACTIVE'
          : s.status === ShopStatus.SUSPENDED
            ? 'SUSPENDED'
            : 'INACTIVE',
      onboardingStatus:
        s.onboardingStatus === ShopOnboardingStatus.APPROVED
          ? 'APPROVED'
          : s.onboardingStatus === ShopOnboardingStatus.REJECTED
            ? 'REJECTED'
            : 'PENDING_APPROVAL',
      onboardingReason: s.onboardingReason,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  async listCategories(): Promise<AdminCategorySummary[]> {
    const rows = await this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
      },
    });

    return rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      productCount: c._count.products,
      childrenCount: c._count.children,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  async findCategoryById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.category.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            products: true,
            children: true,
            homepageEntries: true,
          },
        },
      },
    });
  }

  async findCategoryBySlug(slug: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.category.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  async listBanners() {
    const campaignModule = await this.prisma.homepageModule.findFirst({
      where: { type: 'CAMPAIGN_BANNER' },
    });
    if (!campaignModule) return [];

    return this.prisma.homepageBanner.findMany({
      where: { moduleId: campaignModule.id },
      orderBy: [{ sortOrder: 'asc' }],
    });
  }

  async findBannerById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.homepageBanner.findUnique({
      where: { id },
    });
  }

  async findCampaignBannerModule(tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.homepageModule.findFirst({
      where: { type: 'CAMPAIGN_BANNER' },
    });
  }

  async listHomepageModules() {
    return this.prisma.homepageModule.findMany({
      orderBy: [{ sortOrder: 'asc' }],
    });
  }

  async findHomepageModuleById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.homepageModule.findUnique({
      where: { id },
    });
  }

  async listPrivilegedAuditEvents(options: {
    limit?: number;
    cursor?: string;
    targetType?: AdminPrivilegedTargetType;
    targetId?: string;
    actorUserId?: string;
    action?: AdminPrivilegedAction;
  }) {
    const limit = Math.min(options.limit ?? ADMIN_DEFAULT_LIMIT, ADMIN_MAX_LIMIT);
    const where: Prisma.PrivilegedAuditEventWhereInput = {};

    if (options.targetType) {
      where.targetType = options.targetType as PrivilegedTargetType;
    }
    if (options.targetId) {
      where.targetId = options.targetId;
    }
    if (options.actorUserId) {
      where.actorUserId = options.actorUserId;
    }
    if (options.action) {
      where.action = options.action as PrivilegedAction;
    }

    const rows = await this.prisma.privilegedAuditEvent.findMany({
      where,
      take: limit + 1,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        actorUser: {
          select: {
            email: true,
            displayName: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && items.length > 0 ? (items[items.length - 1]?.id ?? null) : null;

    return {
      items: items.map((event) => ({
        id: event.id,
        actorUserId: event.actorUserId,
        actorEmail: event.actorUser?.email,
        actorDisplayName: event.actorUser?.displayName,
        targetType: event.targetType as AdminPrivilegedTargetType,
        targetId: event.targetId,
        action: event.action as AdminPrivilegedAction,
        reason: event.reason,
        beforeSummary: (event.beforeSummary as Record<string, unknown> | null) ?? null,
        afterSummary: (event.afterSummary as Record<string, unknown> | null) ?? null,
        decisionId: event.decisionId ?? null,
        reviewModerationEventId: event.reviewModerationEventId ?? null,
        createdAt: event.createdAt.toISOString(),
      })),
      nextCursor,
    };
  }

  async findProductBySlugOrId(identifier: string) {
    const trimmed = identifier.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed);

    return this.prisma.product.findFirst({
      where: {
        ...(isUuid ? { id: trimmed } : { slug: trimmed }),
        deletedAt: null,
      },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        images: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            url: true,
            altText: true,
            sortOrder: true,
          },
        },
        variants: {
          where: { deletedAt: null },
          orderBy: [{ priceMinor: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            sku: true,
            name: true,
            priceMinor: true,
            status: true,
            inventory: {
              select: {
                quantityOnHand: true,
                quantityReserved: true,
              },
            },
            optionValues: {
              select: {
                optionValue: {
                  select: {
                    value: true,
                    group: {
                      select: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }


  async updateProductModeration(
    id: string,
    moderationStatus: 'ACTIVE' | 'SUSPENDED',
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.product.update({
      where: { id },
      data: {
        moderationStatus:
          moderationStatus === 'ACTIVE' ? ProductModerationStatus.ACTIVE : ProductModerationStatus.SUSPENDED,
      },
    });
  }

  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}

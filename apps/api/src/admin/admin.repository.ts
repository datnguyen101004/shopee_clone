import {
  ADMIN_DEFAULT_LIMIT,
  ADMIN_MAX_LIMIT,
  ADMIN_PAGE_SIZE,
  type AdminCategorySummary,
  type AdminDashboardCounts,
  type AdminPrivilegedAction,
  type AdminPrivilegedTargetType,
  type AdminShopOnboardingStatus,
  type AdminShopStatus,
  type AdminUserStatus,
} from '@shopee-clone/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type {
  Prisma,
  PrivilegedAction,
  PrivilegedTargetType,
  ProductStatus,
} from '../generated/prisma/client';
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
  roles: ('buyer' | 'seller' | 'admin' | 'carrier_operator')[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminShopListItem {
  id: string;
  logoUrl?: string | null;
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
    page?: number;
    status?: AdminUserStatus;
    role?: 'buyer' | 'seller' | 'admin' | 'carrier_operator';
    q?: string;
  }): Promise<{
    items: AdminUserListItem[];
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  }> {
    const page = Math.max(1, options.page ?? 1);
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
            : options.role === 'carrier_operator'
              ? MarketplaceRole.CARRIER_OPERATOR
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

    const [totalItems, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
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
      }),
    ]);

    return {
      items: rows.map((u) => ({
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
              : r.role === MarketplaceRole.CARRIER_OPERATOR
                ? 'carrier_operator'
                : 'buyer',
        ),
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      page,
      pageSize: ADMIN_PAGE_SIZE,
      totalItems,
      totalPages: Math.ceil(totalItems / ADMIN_PAGE_SIZE),
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
            : r.role === MarketplaceRole.CARRIER_OPERATOR
              ? 'carrier_operator'
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
    page?: number;
    status?: AdminShopStatus;
    onboardingStatus?: AdminShopOnboardingStatus;
    q?: string;
  }): Promise<{
    items: AdminShopListItem[];
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  }> {
    const page = Math.max(1, options.page ?? 1);
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

    const [totalItems, rows] = await Promise.all([
      this.prisma.shop.count({ where }),
      this.prisma.shop.findMany({
        where,
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          logoUrl: true,
          ownerId: true,
          slug: true,
          name: true,
          status: true,
          onboardingStatus: true,
          onboardingReason: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      items: rows.map((s) => ({
        id: s.id,
        logoUrl: s.logoUrl,
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
      page,
      pageSize: ADMIN_PAGE_SIZE,
      totalItems,
      totalPages: Math.ceil(totalItems / ADMIN_PAGE_SIZE),
    };
  }

  async findShopById(id: string, tx?: Prisma.TransactionClient): Promise<AdminShopListItem | null> {
    const client = tx ?? this.prisma;
    const s = await client.shop.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        logoUrl: true,
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
      logoUrl: s.logoUrl,
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

    const idsByType = new Map<string, Set<string>>();
    for (const event of items) {
      const key = String(event.targetType);
      const ids = idsByType.get(key) ?? new Set<string>();
      ids.add(event.targetId);
      idsByType.set(key, ids);
    }
    const targetIds = (type: string) => [...(idsByType.get(type) ?? [])];
    const [
      users,
      shops,
      products,
      categories,
      banners,
      modules,
      moderationCases,
      reviews,
      returns,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: targetIds('USER') }, deletedAt: null },
        select: { id: true, displayName: true },
      }),
      this.prisma.shop.findMany({
        where: { id: { in: targetIds('SHOP') }, deletedAt: null },
        select: { id: true, name: true, logoUrl: true },
      }),
      this.prisma.product.findMany({
        where: { id: { in: targetIds('PRODUCT') }, deletedAt: null },
        select: {
          id: true,
          name: true,
          images: {
            take: 1,
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: { url: true },
          },
        },
      }),
      this.prisma.category.findMany({
        where: { id: { in: targetIds('CATEGORY') }, deletedAt: null },
        select: { id: true, name: true },
      }),
      this.prisma.homepageBanner.findMany({
        where: { id: { in: targetIds('BANNER') } },
        select: { id: true, title: true, imageUrl: true },
      }),
      this.prisma.homepageModule.findMany({
        where: { id: { in: targetIds('HOMEPAGE_MODULE') } },
        select: { id: true, title: true },
      }),
      this.prisma.moderationCase.findMany({
        where: { id: { in: targetIds('MODERATION_CASE') } },
        select: { id: true, targetSnapshot: true },
      }),
      this.prisma.productReview.findMany({
        where: { id: { in: targetIds('REVIEW') } },
        select: {
          id: true,
          product: {
            select: {
              name: true,
              images: {
                take: 1,
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                select: { url: true },
              },
            },
          },
        },
      }),
      this.prisma.returnRequest.findMany({
        where: { id: { in: targetIds('RETURN_REQUEST') } },
        select: {
          id: true,
          shop: { select: { name: true } },
          items: {
            take: 1,
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { orderLine: { select: { productName: true, productImageUrl: true } } },
          },
        },
      }),
    ]);
    const targets = new Map<string, { name: string; imageUrl?: string | null }>();
    users.forEach((item) => targets.set(`USER:${item.id}`, { name: item.displayName }));
    shops.forEach((item) =>
      targets.set(`SHOP:${item.id}`, { name: item.name, imageUrl: item.logoUrl }),
    );
    products.forEach((item) =>
      targets.set(`PRODUCT:${item.id}`, { name: item.name, imageUrl: item.images[0]?.url ?? null }),
    );
    categories.forEach((item) => targets.set(`CATEGORY:${item.id}`, { name: item.name }));
    banners.forEach((item) =>
      targets.set(`BANNER:${item.id}`, { name: item.title, imageUrl: item.imageUrl }),
    );
    modules.forEach((item) => targets.set(`HOMEPAGE_MODULE:${item.id}`, { name: item.title }));
    moderationCases.forEach((item) => {
      const snapshot = item.targetSnapshot as Record<string, unknown>;
      if (typeof snapshot?.name === 'string')
        targets.set(`MODERATION_CASE:${item.id}`, { name: snapshot.name });
    });
    reviews.forEach((item) =>
      targets.set(`REVIEW:${item.id}`, {
        name: item.product.name,
        imageUrl: item.product.images[0]?.url ?? null,
      }),
    );
    returns.forEach((item) =>
      targets.set(`RETURN_REQUEST:${item.id}`, {
        name: item.items[0]?.orderLine.productName ?? item.shop.name,
        imageUrl: item.items[0]?.orderLine.productImageUrl ?? null,
      }),
    );

    return {
      items: items.map((event) => ({
        id: event.id,
        actorUserId: event.actorUserId,
        actorEmail: event.actorUser?.email,
        actorDisplayName: event.actorUser?.displayName,
        targetType: event.targetType as AdminPrivilegedTargetType,
        targetId: event.targetId,
        targetName: targets.get(`${event.targetType}:${event.targetId}`)?.name,
        targetImageUrl: targets.get(`${event.targetType}:${event.targetId}`)?.imageUrl ?? null,
        action: event.action as AdminPrivilegedAction,
        reason: event.reason,
        beforeSummary: (event.beforeSummary as Record<string, unknown> | null) ?? null,
        afterSummary: (event.afterSummary as Record<string, unknown> | null) ?? null,
        decisionId: event.decisionId ?? null,
        reviewModerationEventId: event.reviewModerationEventId ?? null,
        returnDecisionId: event.returnDecisionId ?? null,
        createdAt: event.createdAt.toISOString(),
      })),
      nextCursor,
    };
  }

  async findProductBySlugOrId(identifier: string) {
    const trimmed = identifier.trim();
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed);

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

  async listProducts(options: {
    page?: number;
    q?: string;
    status?: 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';
    moderationStatus?: 'ACTIVE' | 'SUSPENDED';
  }) {
    const page = Math.max(1, options.page ?? 1);
    const normalizedQuery = options.q?.trim();
    const where: Prisma.ProductWhereInput = { deletedAt: null };

    if (normalizedQuery) {
      where.OR = [
        { name: { contains: normalizedQuery, mode: 'insensitive' } },
        { slug: { contains: normalizedQuery, mode: 'insensitive' } },
        { shop: { name: { contains: normalizedQuery, mode: 'insensitive' } } },
        { category: { name: { contains: normalizedQuery, mode: 'insensitive' } } },
      ];
    }
    if (options.status) where.status = options.status as ProductStatus;
    if (options.moderationStatus) {
      where.moderationStatus = options.moderationStatus as ProductModerationStatus;
    }

    const [totalItems, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          moderationStatus: true,
          soldCount: true,
          updatedAt: true,
          shop: { select: { id: true, name: true, slug: true } },
          category: { select: { id: true, name: true, slug: true } },
          images: {
            take: 1,
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: { url: true },
          },
          variants: {
            where: { deletedAt: null },
            select: {
              priceMinor: true,
              inventory: { select: { quantityOnHand: true, quantityReserved: true } },
            },
          },
        },
      }),
    ]);

    return {
      items: rows,
      page,
      pageSize: ADMIN_PAGE_SIZE,
      totalItems,
      totalPages: Math.ceil(totalItems / ADMIN_PAGE_SIZE),
    };
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
          moderationStatus === 'ACTIVE'
            ? ProductModerationStatus.ACTIVE
            : ProductModerationStatus.SUSPENDED,
      },
    });
  }

  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}

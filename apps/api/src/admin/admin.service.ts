import {
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
  ADMIN_VERSION,

  isAllowedMediaUrl,
  isCategorySlug,
  isIsoDateString,
  isValidAdminReason,
  isValidBannerDestination,
  type AdminBannerSummary,
  type AdminCategoryListResponse,
  type AdminCategorySummary,
  type AdminCategoryTreeNode,
  type AdminDashboardResponse,
  type AdminHomepageModuleListResponse,
  type AdminHomepageModuleSummary,
  type AdminPrivilegedAuditListQuery,
  type AdminPrivilegedAuditListResponse,
  type AdminProductActionInput,
  type AdminProductActionResult,
  type AdminProductLookupResponse,
  type AdminShopActionRequest,
  type AdminShopListQuery,
  type AdminShopListResponse,
  type AdminShopSummary,
  type AdminUserActionRequest,
  type AdminUserListQuery,
  type AdminUserListResponse,
  type AdminUserSummary,
  type CreateAdminBannerRequest,
  type CreateAdminCategoryRequest,
  type ReorderAdminBannersRequest,
  type ReorderAdminCategoriesRequest,
  type UpdateAdminBannerRequest,
  type UpdateAdminCategoryRequest,
  type UpdateAdminHomepageModuleSettingsRequest,
} from '@shopee-clone/contracts';

import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  PrivilegedAction,
  PrivilegedTargetType,
  ShopStatus,
  UserStatus,
} from '../generated/prisma/client';
import {
  AdminInvalidInputError,
  AdminNotFoundError,
  CategoryCycleConflictError,
  CategoryIntegrityConflictError,
  LastAdminConflictError,
  SelfActionForbiddenError,
  ShopRestoreNotApprovedError,
} from './admin.errors';
import { AdminRepository } from './admin.repository';
import { recordPrivilegedAudit } from './privileged-audit.helper';
import { SellerIdentityLifecycleService } from '../seller-identity/seller-identity-lifecycle.service';

@Injectable()
export class AdminService {
  constructor(
    @Inject(AdminRepository) private readonly repository: AdminRepository,
    @Optional() @Inject(SellerIdentityLifecycleService)
    private readonly sellerLifecycle?: SellerIdentityLifecycleService,
  ) {}

  async dashboard(): Promise<AdminDashboardResponse> {
    const counts = await this.repository.countDashboardMetrics();
    return {
      adminVersion: ADMIN_VERSION,
      generatedAt: new Date().toISOString(),
      counts,
    };
  }

  async listUsers(query: AdminUserListQuery): Promise<AdminUserListResponse> {
    const result = await this.repository.listUsers(query);
    return {
      items: result.items.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        phoneNumber: u.phoneNumber,
        status: u.status,
        roles: u.roles,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
      nextCursor: result.nextCursor,
    };
  }

  async getUser(id: string): Promise<AdminUserSummary> {
    const user = await this.repository.findUserById(id);
    if (!user) throw new AdminNotFoundError('User');
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber,
      status: user.status,
      roles: user.roles,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async executeUserAction(
    actorUserId: string,
    targetUserId: string,
    input: AdminUserActionRequest,
  ): Promise<AdminUserSummary> {
    if (actorUserId === targetUserId) {
      throw new SelfActionForbiddenError();
    }
    if (!isValidAdminReason(input.reason)) {
      throw new AdminInvalidInputError('Reason must be between 8 and 240 characters');
    }

    const now = new Date();

    return this.repository.transaction(async (tx) => {
      const user = await this.repository.findUserById(targetUserId, tx);
      if (!user) throw new AdminNotFoundError('User');

      if (this.sellerLifecycle) {
        if (input.action === 'SUSPEND') {
          await this.sellerLifecycle.suspendUserInTransaction(tx, actorUserId, targetUserId, input.reason);
        } else {
          await this.sellerLifecycle.restoreUserInTransaction(tx, actorUserId, targetUserId, input.reason);
        }
        const updated = await this.repository.findUserById(targetUserId, tx);
        if (!updated) throw new AdminNotFoundError('User');
        return {
          id: updated.id,
          email: updated.email,
          displayName: updated.displayName,
          phoneNumber: updated.phoneNumber,
          status: updated.status,
          roles: updated.roles,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        };
      }

      if (input.action === 'SUSPEND') {
        if (user.status === 'SUSPENDED') {
          // Idempotent: return without second audit
          return {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            phoneNumber: user.phoneNumber,
            status: user.status,
            roles: user.roles,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
          };
        }

        // Check last active admin protection
        if (user.roles.includes('admin')) {
          const activeAdmins = await this.repository.countActiveAdmins(tx);
          if (activeAdmins <= 1) {
            throw new LastAdminConflictError();
          }
        }

        // Update user status
        await tx.user.update({
          where: { id: targetUserId },
          data: { status: UserStatus.SUSPENDED },
        });

        // Revoke active sessions
        await tx.authSession.updateMany({
          where: { userId: targetUserId, revokedAt: null },
          data: { revokedAt: now },
        });

        // Record privileged audit
        await recordPrivilegedAudit(tx, {
          actorUserId,
          targetType: PrivilegedTargetType.USER,
          targetId: targetUserId,
          action: PrivilegedAction.SUSPEND,
          reason: input.reason,
          beforeSummary: { status: 'ACTIVE' },
          afterSummary: { status: 'SUSPENDED' },
          now,
        });

        return {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          phoneNumber: user.phoneNumber,
          status: 'SUSPENDED',
          roles: user.roles,
          createdAt: user.createdAt.toISOString(),
          updatedAt: now.toISOString(),
        };
      } else {
        // RESTORE
        if (user.status === 'ACTIVE') {
          return {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            phoneNumber: user.phoneNumber,
            status: user.status,
            roles: user.roles,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
          };
        }

        await tx.user.update({
          where: { id: targetUserId },
          data: { status: UserStatus.ACTIVE },
        });

        await recordPrivilegedAudit(tx, {
          actorUserId,
          targetType: PrivilegedTargetType.USER,
          targetId: targetUserId,
          action: PrivilegedAction.RESTORE,
          reason: input.reason,
          beforeSummary: { status: 'SUSPENDED' },
          afterSummary: { status: 'ACTIVE' },
          now,
        });

        return {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          phoneNumber: user.phoneNumber,
          status: 'ACTIVE',
          roles: user.roles,
          createdAt: user.createdAt.toISOString(),
          updatedAt: now.toISOString(),
        };
      }
    });
  }

  async listShops(query: AdminShopListQuery): Promise<AdminShopListResponse> {
    const result = await this.repository.listShops(query);
    return {
      items: result.items.map((s) => ({
        id: s.id,
        ownerUserId: s.ownerUserId,
        slug: s.slug,
        name: s.name,
        status: s.status,
        onboardingStatus: s.onboardingStatus,
        onboardingReason: s.onboardingReason,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      nextCursor: result.nextCursor,
    };
  }

  async getShop(id: string): Promise<AdminShopSummary> {
    const shop = await this.repository.findShopById(id);
    if (!shop) throw new AdminNotFoundError('Shop');
    return {
      id: shop.id,
      ownerUserId: shop.ownerUserId,
      slug: shop.slug,
      name: shop.name,
      status: shop.status,
      onboardingStatus: shop.onboardingStatus,
      onboardingReason: shop.onboardingReason,
      createdAt: shop.createdAt.toISOString(),
      updatedAt: shop.updatedAt.toISOString(),
    };
  }

  async executeShopAction(
    actorUserId: string,
    targetShopId: string,
    input: AdminShopActionRequest,
  ): Promise<AdminShopSummary> {
    if (!isValidAdminReason(input.reason)) {
      throw new AdminInvalidInputError('Reason must be between 8 and 240 characters');
    }

    const now = new Date();

    return this.repository.transaction(async (tx) => {
      const shop = await this.repository.findShopById(targetShopId, tx);
      if (!shop) throw new AdminNotFoundError('Shop');

      if (this.sellerLifecycle) {
        if (input.action === 'SUSPEND') {
          await this.sellerLifecycle.suspendShopInTransaction(tx, actorUserId, targetShopId, input.reason);
        } else {
          await this.sellerLifecycle.restoreShopInTransaction(tx, actorUserId, targetShopId, input.reason);
        }
        const updated = await this.repository.findShopById(targetShopId, tx);
        if (!updated) throw new AdminNotFoundError('Shop');
        return {
          id: updated.id,
          ownerUserId: updated.ownerUserId,
          slug: updated.slug,
          name: updated.name,
          status: updated.status,
          onboardingStatus: updated.onboardingStatus,
          onboardingReason: updated.onboardingReason,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        };
      }

      if (input.action === 'SUSPEND') {
        if (shop.status === 'SUSPENDED') {
          return {
            id: shop.id,
            ownerUserId: shop.ownerUserId,
            slug: shop.slug,
            name: shop.name,
            status: shop.status,
            onboardingStatus: shop.onboardingStatus,
            onboardingReason: shop.onboardingReason,
            createdAt: shop.createdAt.toISOString(),
            updatedAt: shop.updatedAt.toISOString(),
          };
        }

        await tx.shop.update({
          where: { id: targetShopId },
          data: { status: ShopStatus.SUSPENDED },
        });

        await recordPrivilegedAudit(tx, {
          actorUserId,
          targetType: PrivilegedTargetType.SHOP,
          targetId: targetShopId,
          action: PrivilegedAction.SUSPEND,
          reason: input.reason,
          beforeSummary: { status: shop.status },
          afterSummary: { status: 'SUSPENDED' },
          now,
        });

        return {
          id: shop.id,
          ownerUserId: shop.ownerUserId,
          slug: shop.slug,
          name: shop.name,
          status: 'SUSPENDED',
          onboardingStatus: shop.onboardingStatus,
          onboardingReason: shop.onboardingReason,
          createdAt: shop.createdAt.toISOString(),
          updatedAt: now.toISOString(),
        };
      } else {
        // RESTORE
        if (shop.onboardingStatus !== 'APPROVED') {
          throw new ShopRestoreNotApprovedError();
        }

        if (shop.status === 'ACTIVE') {
          return {
            id: shop.id,
            ownerUserId: shop.ownerUserId,
            slug: shop.slug,
            name: shop.name,
            status: shop.status,
            onboardingStatus: shop.onboardingStatus,
            onboardingReason: shop.onboardingReason,
            createdAt: shop.createdAt.toISOString(),
            updatedAt: shop.updatedAt.toISOString(),
          };
        }

        await tx.shop.update({
          where: { id: targetShopId },
          data: { status: ShopStatus.ACTIVE },
        });

        await recordPrivilegedAudit(tx, {
          actorUserId,
          targetType: PrivilegedTargetType.SHOP,
          targetId: targetShopId,
          action: PrivilegedAction.RESTORE,
          reason: input.reason,
          beforeSummary: { status: shop.status },
          afterSummary: { status: 'ACTIVE' },
          now,
        });

        return {
          id: shop.id,
          ownerUserId: shop.ownerUserId,
          slug: shop.slug,
          name: shop.name,
          status: 'ACTIVE',
          onboardingStatus: shop.onboardingStatus,
          onboardingReason: shop.onboardingReason,
          createdAt: shop.createdAt.toISOString(),
          updatedAt: now.toISOString(),
        };
      }
    });
  }

  async listCategories(): Promise<AdminCategoryListResponse> {
    const items = await this.repository.listCategories();
    const tree = this.buildCategoryTree(items);
    return { items, tree };
  }

  private buildCategoryTree(items: AdminCategorySummary[]): AdminCategoryTreeNode[] {
    const map = new Map<string, AdminCategoryTreeNode>();
    const roots: AdminCategoryTreeNode[] = [];

    for (const item of items) {
      map.set(item.id, { ...item, children: [] });
    }

    for (const item of items) {
      const node = map.get(item.id)!;
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  async createCategory(
    actorUserId: string,
    input: CreateAdminCategoryRequest,
  ): Promise<AdminCategorySummary> {
    if (!isCategorySlug(input.slug)) {
      throw new AdminInvalidInputError('Invalid category slug format');
    }
    if (!input.name || input.name.trim().length === 0) {
      throw new AdminInvalidInputError('Category name is required');
    }

    const now = new Date();

    return this.repository.transaction(async (tx) => {
      const existingSlug = await this.repository.findCategoryBySlug(input.slug, tx);
      if (existingSlug) {
        throw new AdminInvalidInputError(`Category with slug '${input.slug}' already exists`);
      }

      if (input.parentId) {
        const parent = await this.repository.findCategoryById(input.parentId, tx);
        if (!parent) throw new AdminNotFoundError('Parent category');
      }

      const created = await tx.category.create({
        data: {
          slug: input.slug,
          name: input.name.trim(),
          parentId: input.parentId ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        },
      });

      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.CATEGORY,
        targetId: created.id,
        action: PrivilegedAction.CREATE,
        reason: `Created category ${created.name} (${created.slug})`,
        afterSummary: {
          slug: created.slug,
          name: created.name,
          parentId: created.parentId,
          sortOrder: created.sortOrder,
          isActive: created.isActive,
        },
        now,
      });

      return {
        id: created.id,
        slug: created.slug,
        name: created.name,
        parentId: created.parentId,
        sortOrder: created.sortOrder,
        isActive: created.isActive,
        productCount: 0,
        childrenCount: 0,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    });
  }

  async updateCategory(
    actorUserId: string,
    id: string,
    input: UpdateAdminCategoryRequest,
  ): Promise<AdminCategorySummary> {
    if (input.slug !== undefined && !isCategorySlug(input.slug)) {
      throw new AdminInvalidInputError('Invalid category slug format');
    }

    const now = new Date();

    return this.repository.transaction(async (tx) => {
      const existing = await this.repository.findCategoryById(id, tx);
      if (!existing) throw new AdminNotFoundError('Category');

      if (input.slug !== undefined && input.slug !== existing.slug) {
        const existingSlug = await this.repository.findCategoryBySlug(input.slug, tx);
        if (existingSlug && existingSlug.id !== id) {
          throw new AdminInvalidInputError(`Category with slug '${input.slug}' already exists`);
        }
      }

      // Cycle detection if parentId changed
      if (input.parentId !== undefined && input.parentId !== null) {
        if (input.parentId === id) {
          throw new CategoryCycleConflictError();
        }

        const parent = await this.repository.findCategoryById(input.parentId, tx);
        if (!parent) throw new AdminNotFoundError('Parent category');

        // Traverse upwards from target parent to detect cycle
        let currentParentId: string | null = parent.parentId;
        while (currentParentId !== null) {
          if (currentParentId === id) {
            throw new CategoryCycleConflictError();
          }
          const ancestor = await this.repository.findCategoryById(currentParentId, tx);
          currentParentId = ancestor ? ancestor.parentId : null;
        }
      }

      const updated = await tx.category.update({
        where: { id },
        data: {
          slug: input.slug,
          name: input.name ? input.name.trim() : undefined,
          parentId: input.parentId !== undefined ? input.parentId : undefined,
          sortOrder: input.sortOrder !== undefined ? input.sortOrder : undefined,
          isActive: input.isActive !== undefined ? input.isActive : undefined,
          updatedAt: now,
        },
        include: {
          _count: {
            select: { products: true, children: true },
          },
        },
      });

      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.CATEGORY,
        targetId: id,
        action: PrivilegedAction.UPDATE,
        reason: `Updated category ${updated.name}`,
        beforeSummary: {
          slug: existing.slug,
          name: existing.name,
          parentId: existing.parentId,
          sortOrder: existing.sortOrder,
          isActive: existing.isActive,
        },
        afterSummary: {
          slug: updated.slug,
          name: updated.name,
          parentId: updated.parentId,
          sortOrder: updated.sortOrder,
          isActive: updated.isActive,
        },
        now,
      });

      return {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        parentId: updated.parentId,
        sortOrder: updated.sortOrder,
        isActive: updated.isActive,
        productCount: updated._count.products,
        childrenCount: updated._count.children,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }

  async deleteCategory(actorUserId: string, id: string): Promise<void> {
    const now = new Date();

    return this.repository.transaction(async (tx) => {
      const category = await this.repository.findCategoryById(id, tx);
      if (!category) throw new AdminNotFoundError('Category');

      if (category._count.products > 0) {
        throw new CategoryIntegrityConflictError(
          `Cannot delete category '${category.name}' because it contains ${category._count.products} products`,
          { productCount: category._count.products },
        );
      }

      if (category._count.children > 0) {
        throw new CategoryIntegrityConflictError(
          `Cannot delete category '${category.name}' because it contains ${category._count.children} child categories`,
          { childrenCount: category._count.children },
        );
      }

      if (category._count.homepageEntries > 0) {
        throw new CategoryIntegrityConflictError(
          `Cannot delete category '${category.name}' because it is referenced in homepage shortcuts`,
          { homepageEntriesCount: category._count.homepageEntries },
        );
      }

      await tx.category.delete({
        where: { id },
      });

      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.CATEGORY,
        targetId: id,
        action: PrivilegedAction.DELETE,
        reason: `Deleted category ${category.name} (${category.slug})`,
        beforeSummary: {
          slug: category.slug,
          name: category.name,
        },
        now,
      });
    });
  }

  async reorderCategories(
    actorUserId: string,
    input: ReorderAdminCategoriesRequest,
  ): Promise<AdminCategorySummary[]> {
    const now = new Date();

    return this.repository.transaction(async (tx) => {
      for (const item of input.items) {
        await tx.category.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder, updatedAt: now },
        });
      }

      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.CATEGORY,
        targetId: input.items[0]?.id || actorUserId,
        action: PrivilegedAction.REORDER,
        reason: `Reordered ${input.items.length} categories`,
        afterSummary: { reorderedCount: input.items.length },
        now,
      });

      const categories = await tx.category.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          _count: {
            select: { products: true, children: true },
          },
        },
      });

      return categories.map((c) => ({
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
    });
  }

  async listBanners(): Promise<AdminBannerSummary[]> {
    const rows = await this.repository.listBanners();
    return rows.map((b) => ({
      id: b.id,
      eyebrow: b.eyebrow ?? undefined,
      title: b.title,
      description: b.description ?? undefined,
      imageUrl: b.imageUrl,
      altText: b.altText ?? '',
      href: b.destinationPath,
      theme: b.themeKey,
      sortOrder: b.sortOrder,
      createdAt: b.id, // fallback or stable
      updatedAt: b.id,
    }));
  }

  async createBanner(
    actorUserId: string,
    input: CreateAdminBannerRequest,
  ): Promise<AdminBannerSummary> {
    if (!isValidBannerDestination(input.href)) {
      throw new AdminInvalidInputError('Banner destination must be a valid relative path');
    }
    if (input.imageUrl && !isAllowedMediaUrl(input.imageUrl)) {
      throw new AdminInvalidInputError('Banner image URL is not in allowlisted media domains');
    }

    const now = new Date();

    return this.repository.transaction(async (tx) => {
      const campaignModule = await this.repository.findCampaignBannerModule(tx);
      if (!campaignModule) {
        throw new AdminNotFoundError('Campaign banner homepage module');
      }

      const created = await tx.homepageBanner.create({
        data: {
          moduleId: campaignModule.id,
          eyebrow: input.eyebrow,
          title: input.title.trim(),
          description: input.description,
          imageUrl: input.imageUrl,
          altText: input.altText.trim(),
          destinationPath: input.href.trim(),
          themeKey: input.theme.trim(),
          sortOrder: input.sortOrder ?? 0,
        },
      });

      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.BANNER,
        targetId: created.id,
        action: PrivilegedAction.CREATE,
        reason: `Created banner ${created.title}`,
        afterSummary: {
          title: created.title,
          href: created.destinationPath,
          sortOrder: created.sortOrder,
        },
        now,
      });

      return {
        id: created.id,
        eyebrow: created.eyebrow ?? undefined,
        title: created.title,
        description: created.description ?? undefined,
        imageUrl: created.imageUrl,
        altText: created.altText ?? '',
        href: created.destinationPath,
        theme: created.themeKey,
        sortOrder: created.sortOrder,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    });
  }

  async updateBanner(
    actorUserId: string,
    id: string,
    input: UpdateAdminBannerRequest,
  ): Promise<AdminBannerSummary> {
    if (input.href !== undefined && !isValidBannerDestination(input.href)) {
      throw new AdminInvalidInputError('Banner destination must be a valid relative path');
    }
    if (input.imageUrl !== undefined && !isAllowedMediaUrl(input.imageUrl)) {
      throw new AdminInvalidInputError('Banner image URL is not in allowlisted media domains');
    }

    const now = new Date();

    return this.repository.transaction(async (tx) => {
      const banner = await this.repository.findBannerById(id, tx);
      if (!banner) throw new AdminNotFoundError('Banner');

      const updated = await tx.homepageBanner.update({
        where: { id },
        data: {
          eyebrow: input.eyebrow,
          title: input.title ? input.title.trim() : undefined,
          description: input.description,
          imageUrl: input.imageUrl,
          altText: input.altText ? input.altText.trim() : undefined,
          destinationPath: input.href ? input.href.trim() : undefined,
          themeKey: input.theme ? input.theme.trim() : undefined,
          sortOrder: input.sortOrder !== undefined ? input.sortOrder : undefined,
        },
      });

      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.BANNER,
        targetId: id,
        action: PrivilegedAction.UPDATE,
        reason: `Updated banner ${updated.title}`,
        beforeSummary: {
          title: banner.title,
          href: banner.destinationPath,
          sortOrder: banner.sortOrder,
        },
        afterSummary: {
          title: updated.title,
          href: updated.destinationPath,
          sortOrder: updated.sortOrder,
        },
        now,
      });

      return {
        id: updated.id,
        eyebrow: updated.eyebrow ?? undefined,
        title: updated.title,
        description: updated.description ?? undefined,
        imageUrl: updated.imageUrl,
        altText: updated.altText ?? '',
        href: updated.destinationPath,
        theme: updated.themeKey,
        sortOrder: updated.sortOrder,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    });
  }

  async deleteBanner(actorUserId: string, id: string): Promise<void> {
    const now = new Date();

    return this.repository.transaction(async (tx) => {
      const banner = await this.repository.findBannerById(id, tx);
      if (!banner) throw new AdminNotFoundError('Banner');

      await tx.homepageBanner.delete({ where: { id } });

      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.BANNER,
        targetId: id,
        action: PrivilegedAction.DELETE,
        reason: `Deleted banner ${banner.title}`,
        beforeSummary: {
          title: banner.title,
          href: banner.destinationPath,
        },
        now,
      });
    });
  }

  async reorderBanners(
    actorUserId: string,
    input: ReorderAdminBannersRequest,
  ): Promise<AdminBannerSummary[]> {
    const now = new Date();

    return this.repository.transaction(async (tx) => {
      for (const item of input.items) {
        await tx.homepageBanner.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        });
      }

      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.BANNER,
        targetId: input.items[0]?.id || actorUserId,
        action: PrivilegedAction.REORDER,
        reason: `Reordered ${input.items.length} banners`,
        afterSummary: { reorderedCount: input.items.length },
        now,
      });

      const campaignModule = await this.repository.findCampaignBannerModule(tx);
      const banners = await tx.homepageBanner.findMany({
        where: { moduleId: campaignModule?.id },
        orderBy: [{ sortOrder: 'asc' }],
      });

      return banners.map((b) => ({
        id: b.id,
        eyebrow: b.eyebrow ?? undefined,
        title: b.title,
        description: b.description ?? undefined,
        imageUrl: b.imageUrl,
        altText: b.altText ?? '',
        href: b.destinationPath,
        theme: b.themeKey,
        sortOrder: b.sortOrder,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }));
    });
  }

  async listHomepageModules(): Promise<AdminHomepageModuleListResponse> {
    const modules = await this.repository.listHomepageModules();
    return {
      items: modules.map((m) => ({
        id: m.id,
        key: m.key,
        type: m.type,
        title: m.title,
        subtitle: m.subtitle ?? undefined,
        sortOrder: m.sortOrder,
        isEnabled: m.isEnabled,
        activeFrom: m.activeFrom ? m.activeFrom.toISOString() : null,
        activeUntil: m.activeUntil ? m.activeUntil.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
    };
  }

  async updateHomepageModuleSettings(
    actorUserId: string,
    id: string,
    input: UpdateAdminHomepageModuleSettingsRequest,
  ): Promise<AdminHomepageModuleSummary> {
    const now = new Date();

    if (input.activeFrom && !isIsoDateString(input.activeFrom)) {
      throw new AdminInvalidInputError('activeFrom must be a valid ISO date string');
    }
    if (input.activeUntil && !isIsoDateString(input.activeUntil)) {
      throw new AdminInvalidInputError('activeUntil must be a valid ISO date string');
    }
    if (input.activeFrom && input.activeUntil) {
      if (new Date(input.activeUntil) <= new Date(input.activeFrom)) {
        throw new AdminInvalidInputError('activeUntil must be strictly after activeFrom');
      }
    }

    return this.repository.transaction(async (tx) => {
      const module = await this.repository.findHomepageModuleById(id, tx);
      if (!module) throw new AdminNotFoundError('Homepage module');

      const activeFromDate =
        input.activeFrom !== undefined
          ? input.activeFrom
            ? new Date(input.activeFrom)
            : null
          : module.activeFrom;
      const activeUntilDate =
        input.activeUntil !== undefined
          ? input.activeUntil
            ? new Date(input.activeUntil)
            : null
          : module.activeUntil;

      if (activeFromDate && activeUntilDate && activeUntilDate <= activeFromDate) {
        throw new AdminInvalidInputError('activeUntil must be strictly after activeFrom');
      }

      const updated = await tx.homepageModule.update({
        where: { id },
        data: {
          title: input.title ? input.title.trim() : undefined,
          subtitle: input.subtitle !== undefined ? input.subtitle : undefined,
          sortOrder: input.sortOrder !== undefined ? input.sortOrder : undefined,
          isEnabled: input.isEnabled !== undefined ? input.isEnabled : undefined,
          activeFrom: input.activeFrom !== undefined ? activeFromDate : undefined,
          activeUntil: input.activeUntil !== undefined ? activeUntilDate : undefined,
          updatedAt: now,
        },
      });

      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.HOMEPAGE_MODULE,
        targetId: id,
        action: PrivilegedAction.UPDATE,
        reason: `Updated homepage module settings for ${updated.key}`,
        beforeSummary: {
          title: module.title,
          isEnabled: module.isEnabled,
          sortOrder: module.sortOrder,
          activeFrom: module.activeFrom?.toISOString() ?? null,
          activeUntil: module.activeUntil?.toISOString() ?? null,
        },
        afterSummary: {
          title: updated.title,
          isEnabled: updated.isEnabled,
          sortOrder: updated.sortOrder,
          activeFrom: updated.activeFrom?.toISOString() ?? null,
          activeUntil: updated.activeUntil?.toISOString() ?? null,
        },
        now,
      });

      return {
        id: updated.id,
        key: updated.key,
        type: updated.type,
        title: updated.title,
        subtitle: updated.subtitle ?? undefined,
        sortOrder: updated.sortOrder,
        isEnabled: updated.isEnabled,
        activeFrom: updated.activeFrom ? updated.activeFrom.toISOString() : null,
        activeUntil: updated.activeUntil ? updated.activeUntil.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }

  async listAuditEvents(
    query: AdminPrivilegedAuditListQuery,
  ): Promise<AdminPrivilegedAuditListResponse> {
    return this.repository.listPrivilegedAuditEvents(query);
  }

  async lookupProduct(identifier: string): Promise<AdminProductLookupResponse> {
    if (!identifier || identifier.trim().length === 0) {
      return {
        adminVersion: ADMIN_VERSION,
        product: null,
      };
    }

    const found = await this.repository.findProductBySlugOrId(identifier);
    if (!found) {
      return {
        adminVersion: ADMIN_VERSION,
        product: null,
      };
    }

    return {
      adminVersion: ADMIN_VERSION,
      product: {
        id: found.id,
        shopId: found.shop.id,
        shopName: found.shop.name,
        shopSlug: found.shop.slug,
        shopStatus: found.shop.status,
        categoryId: found.category.id,
        categoryName: found.category.name,
        categorySlug: found.category.slug,
        slug: found.slug,
        name: found.name,
        description: found.description,
        status: found.status as 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED',
        moderationStatus: found.moderationStatus as 'ACTIVE' | 'SUSPENDED',
        ratingAverageBasisPoints: found.ratingAverageBasisPoints,
        ratingCount: found.ratingCount,
        soldCount: found.soldCount,
        images: found.images.map((img, idx) => ({
          id: img.id,
          url: img.url,
          isPrimary: idx === 0,
          sortOrder: img.sortOrder,
        })),
        variants: found.variants.map((v) => {
          const attributes: Record<string, string> = {};
          for (const sel of v.optionValues) {
            if (sel.optionValue?.group?.name && sel.optionValue?.value) {
              attributes[sel.optionValue.group.name] = sel.optionValue.value;
            }
          }
          const stock = (v.inventory?.quantityOnHand ?? 0) - (v.inventory?.quantityReserved ?? 0);
          return {
            id: v.id,
            sku: v.sku,
            price: Number(v.priceMinor),
            stock: Math.max(0, stock),
            isActive: v.status === 'ACTIVE',
            attributes,
          };
        }),
        createdAt: found.createdAt.toISOString(),
        updatedAt: found.updatedAt.toISOString(),
      },
    };
  }


  async applyProductAction(
    productId: string,
    input: AdminProductActionInput,
    actorUserId: string,
  ): Promise<AdminProductActionResult> {
    if (!isValidAdminReason(input.reason)) {
      throw new AdminInvalidInputError(
        `Reason must be between ${ADMIN_REASON_MIN_LENGTH} and ${ADMIN_REASON_MAX_LENGTH} characters.`,
      );
    }

    const now = new Date();

    return this.repository.transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product || product.deletedAt) {
        throw new AdminNotFoundError('Product');
      }

      const nextModerationStatus = input.action === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE';
      const prevModerationStatus = product.moderationStatus;

      const updated = await this.repository.updateProductModeration(
        productId,
        nextModerationStatus,
        tx,
      );

      await recordPrivilegedAudit(tx, {
        actorUserId,
        targetType: PrivilegedTargetType.PRODUCT,
        targetId: productId,
        action: input.action === 'SUSPEND' ? PrivilegedAction.SUSPEND : PrivilegedAction.RESTORE,
        reason: input.reason.trim(),
        beforeSummary: {
          moderationStatus: prevModerationStatus,
          slug: product.slug,
          name: product.name,
        },
        afterSummary: {
          moderationStatus: updated.moderationStatus,
          slug: updated.slug,
          name: updated.name,
        },
        now,
      });

      return {
        adminVersion: ADMIN_VERSION,
        productId: updated.id,
        moderationStatus: updated.moderationStatus as 'ACTIVE' | 'SUSPENDED',
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }
}

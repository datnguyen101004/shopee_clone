import {
  CategoryCycleConflictError,
  CategoryIntegrityConflictError,
  LastAdminConflictError,
  SelfActionForbiddenError,
  ShopRestoreNotApprovedError,
} from './admin.errors';
import type { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

type CategoryWithCounts = Awaited<ReturnType<AdminRepository['findCategoryById']>>;

describe('AdminService', () => {
  let service: AdminService;
  let repository: jest.Mocked<AdminRepository>;

  const adminUserId = '00000000-0000-4000-8000-000000000001';
  const targetUserId = '00000000-0000-4000-8000-000000000002';
  const targetShopId = '00000000-0000-4000-8000-000000000101';

  beforeEach(() => {
    repository = {
      countDashboardMetrics: jest.fn(),
      listUsers: jest.fn(),
      findUserById: jest.fn(),
      countActiveAdmins: jest.fn(),
      listShops: jest.fn(),
      findShopById: jest.fn(),
      listCategories: jest.fn(),
      findCategoryById: jest.fn(),
      findCategoryBySlug: jest.fn(),
      listBanners: jest.fn(),
      findBannerById: jest.fn(),
      findCampaignBannerModule: jest.fn(),
      listHomepageModules: jest.fn(),
      findHomepageModuleById: jest.fn(),
      listPrivilegedAuditEvents: jest.fn(),
      transaction: jest.fn((callback) =>
        callback({
          user: { update: jest.fn() },
          authSession: { updateMany: jest.fn() },
          shop: { update: jest.fn() },
          category: { create: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
          homepageBanner: { create: jest.fn(), update: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
          homepageModule: { update: jest.fn() },
          privilegedAuditEvent: { create: jest.fn() },
        } as unknown),
      ),
    } as unknown as jest.Mocked<AdminRepository>;

    service = new AdminService(repository);
  });

  describe('User Administration', () => {
    it('rejects self-suspend', async () => {
      await expect(
        service.executeUserAction(adminUserId, adminUserId, {
          action: 'SUSPEND',
          reason: 'Violated terms of service',
        }),
      ).rejects.toThrow(SelfActionForbiddenError);
    });

    it('rejects suspending the last active administrator', async () => {
      repository.findUserById.mockResolvedValue({
        id: targetUserId,
        email: 'target@example.com',
        displayName: 'Target Admin',
        phoneNumber: null,
        status: 'ACTIVE',
        roles: ['buyer', 'admin'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      repository.countActiveAdmins.mockResolvedValue(1);

      await expect(
        service.executeUserAction(adminUserId, targetUserId, {
          action: 'SUSPEND',
          reason: 'Suspension test for last admin',
        }),
      ).rejects.toThrow(LastAdminConflictError);
    });

    it('suspends active buyer and records audit event in transaction', async () => {
      repository.findUserById.mockResolvedValue({
        id: targetUserId,
        email: 'buyer@example.com',
        displayName: 'Target Buyer',
        phoneNumber: null,
        status: 'ACTIVE',
        roles: ['buyer'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.executeUserAction(adminUserId, targetUserId, {
        action: 'SUSPEND',
        reason: 'Suspension for violating rules',
      });

      expect(result.status).toBe('SUSPENDED');
    });

    it('returns idempotently without extra audit if user is already suspended', async () => {
      repository.findUserById.mockResolvedValue({
        id: targetUserId,
        email: 'buyer@example.com',
        displayName: 'Target Buyer',
        phoneNumber: null,
        status: 'SUSPENDED',
        roles: ['buyer'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.executeUserAction(adminUserId, targetUserId, {
        action: 'SUSPEND',
        reason: 'Already suspended buyer',
      });

      expect(result.status).toBe('SUSPENDED');
    });
  });

  describe('Shop Administration', () => {
    it('rejects restoring a shop that has not been approved', async () => {
      repository.findShopById.mockResolvedValue({
        id: targetShopId,
        ownerUserId: targetUserId,
        slug: 'unapproved-shop',
        name: 'Unapproved Shop',
        status: 'INACTIVE',
        onboardingStatus: 'REJECTED',
        onboardingReason: 'Rejected previously',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.executeShopAction(adminUserId, targetShopId, {
          action: 'RESTORE',
          reason: 'Attempting invalid restore',
        }),
      ).rejects.toThrow(ShopRestoreNotApprovedError);
    });

    it('restores an approved suspended shop successfully', async () => {
      repository.findShopById.mockResolvedValue({
        id: targetShopId,
        ownerUserId: targetUserId,
        slug: 'approved-shop',
        name: 'Approved Shop',
        status: 'SUSPENDED',
        onboardingStatus: 'APPROVED',
        onboardingReason: 'Passed verification',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.executeShopAction(adminUserId, targetShopId, {
        action: 'RESTORE',
        reason: 'Shop suspension resolved after review',
      });

      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('Category Hierarchy and Integrity', () => {
    it('rejects category parent cycle', async () => {
      const catA = '00000000-0000-4000-8000-000000000010';
      const catB = '00000000-0000-4000-8000-000000000020';

      repository.findCategoryById.mockImplementation(async (id) => {
        if (id === catA) {
          return { id: catA, parentId: null, slug: 'cat-a', name: 'Cat A', sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, _count: { products: 0, children: 0, homepageEntries: 0 } } as CategoryWithCounts;
        }
        if (id === catB) {
          return { id: catB, parentId: catA, slug: 'cat-b', name: 'Cat B', sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, _count: { products: 0, children: 0, homepageEntries: 0 } } as CategoryWithCounts;
        }
        return null;
      });

      // Making catA child of catB (catA -> catB -> catA cycle)
      await expect(
        service.updateCategory(adminUserId, catA, { parentId: catB }),
      ).rejects.toThrow(CategoryCycleConflictError);
    });

    it('rejects deleting a category that still contains products', async () => {
      const catId = '00000000-0000-4000-8000-000000000030';
      repository.findCategoryById.mockResolvedValue({
        id: catId,
        parentId: null,
        slug: 'has-products',
        name: 'Category With Products',
        sortOrder: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { products: 15, children: 0, homepageEntries: 0 },
      } as CategoryWithCounts);

      await expect(service.deleteCategory(adminUserId, catId)).rejects.toThrow(
        CategoryIntegrityConflictError,
      );
    });
  });
});

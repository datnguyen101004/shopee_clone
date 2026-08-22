export const ADMIN_VERSION = 'admin-v1' as const;
export const ADMIN_DEFAULT_LIMIT = 20;
export const ADMIN_MAX_LIMIT = 50;
export const ADMIN_REASON_MIN_LENGTH = 8;
export const ADMIN_REASON_MAX_LENGTH = 240;

export const ADMIN_USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type AdminUserStatus = (typeof ADMIN_USER_STATUSES)[number];

export const ADMIN_SHOP_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;
export type AdminShopStatus = (typeof ADMIN_SHOP_STATUSES)[number];

export const ADMIN_SHOP_ONBOARDING_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'REJECTED'] as const;
export type AdminShopOnboardingStatus = (typeof ADMIN_SHOP_ONBOARDING_STATUSES)[number];

export const ADMIN_PRIVILEGED_TARGET_TYPES = [
  'USER',
  'SHOP',
  'CATEGORY',
  'BANNER',
  'HOMEPAGE_MODULE',
  'PRODUCT',
  'REVIEW',
  'MODERATION_CASE',
  'RETURN_REQUEST',
] as const;

export type AdminPrivilegedTargetType = (typeof ADMIN_PRIVILEGED_TARGET_TYPES)[number];

export const ADMIN_PRIVILEGED_ACTIONS = [
  'SUSPEND',
  'RESTORE',
  'CREATE',
  'UPDATE',
  'DELETE',
  'REORDER',
  'APPROVE',
  'REJECT',
  'HIDE',
  'NO_ACTION',
  'APPROVE_RETURN',
  'APPROVE_REFUND',
] as const;
export type AdminPrivilegedAction = (typeof ADMIN_PRIVILEGED_ACTIONS)[number];

export interface AdminDashboardCounts {
  usersCount: number;
  activeUsersCount: number;
  suspendedUsersCount: number;
  shopsCount: number;
  pendingShopApprovalsCount: number;
  categoriesCount: number;
  activeCategoriesCount: number;
  homepageBannersCount: number;
  enabledHomepageModulesCount: number;
  recentAuditEventsCount: number;
}

export interface AdminDashboardResponse {
  adminVersion: typeof ADMIN_VERSION;
  generatedAt: string;
  counts: AdminDashboardCounts;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  displayName: string;
  phoneNumber: string | null;
  status: AdminUserStatus;
  roles: ('buyer' | 'seller' | 'admin')[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserListQuery {
  limit?: number;
  cursor?: string;
  status?: AdminUserStatus;
  role?: 'buyer' | 'seller' | 'admin';
  q?: string;
}

export interface AdminUserListResponse {
  items: AdminUserSummary[];
  nextCursor: string | null;
}

export interface AdminUserActionRequest {
  action: 'SUSPEND' | 'RESTORE';
  reason: string;
}

export interface AdminShopSummary {
  id: string;
  ownerUserId: string;
  slug: string;
  name: string;
  status: AdminShopStatus;
  onboardingStatus: AdminShopOnboardingStatus;
  onboardingReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminShopListQuery {
  limit?: number;
  cursor?: string;
  status?: AdminShopStatus;
  onboardingStatus?: AdminShopOnboardingStatus;
  q?: string;
}

export interface AdminShopListResponse {
  items: AdminShopSummary[];
  nextCursor: string | null;
}

export interface AdminShopActionRequest {
  action: 'SUSPEND' | 'RESTORE';
  reason: string;
}

export interface AdminCategorySummary {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  childrenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategoryTreeNode extends AdminCategorySummary {
  children: AdminCategoryTreeNode[];
}

export interface AdminCategoryListResponse {
  items: AdminCategorySummary[];
  tree: AdminCategoryTreeNode[];
}

export interface CreateAdminCategoryRequest {
  slug: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateAdminCategoryRequest {
  slug?: string;
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface ReorderAdminCategoriesRequest {
  items: { id: string; sortOrder: number }[];
}

export interface AdminBannerSummary {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  imageUrl: string | null;
  altText: string;
  href: string;
  theme: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminBannerListResponse {
  items: AdminBannerSummary[];
}

export interface CreateAdminBannerRequest {
  eyebrow?: string;
  title: string;
  description?: string;
  imageUrl?: string | null;
  altText: string;
  href: string;
  theme: string;
  sortOrder?: number;
}

export interface UpdateAdminBannerRequest {
  eyebrow?: string;
  title?: string;
  description?: string;
  imageUrl?: string | null;
  altText?: string;
  href?: string;
  theme?: string;
  sortOrder?: number;
}

export interface ReorderAdminBannersRequest {
  items: { id: string; sortOrder: number }[];
}

export interface AdminHomepageModuleSummary {
  id: string;
  key: string;
  type: string;
  title: string;
  subtitle?: string;
  sortOrder: number;
  isEnabled: boolean;
  activeFrom: string | null;
  activeUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminHomepageModuleListResponse {
  items: AdminHomepageModuleSummary[];
}

export interface UpdateAdminHomepageModuleSettingsRequest {
  title?: string;
  subtitle?: string;
  sortOrder?: number;
  isEnabled?: boolean;
  activeFrom?: string | null;
  activeUntil?: string | null;
}

export interface AdminPrivilegedAuditEventSummary {
  id: string;
  actorUserId: string;
  actorEmail?: string;
  actorDisplayName?: string;
  targetType: AdminPrivilegedTargetType;
  targetId: string;
  action: AdminPrivilegedAction;
  reason: string;
  beforeSummary: Record<string, unknown> | null;
  afterSummary: Record<string, unknown> | null;
  decisionId?: string | null;
  returnDecisionId?: string | null;
  reviewModerationEventId?: string | null;
  createdAt: string;
}

export interface AdminPrivilegedAuditListQuery {
  limit?: number;
  cursor?: string;
  targetType?: AdminPrivilegedTargetType;
  targetId?: string;
  actorUserId?: string;
  action?: AdminPrivilegedAction;
}

export interface AdminPrivilegedAuditListResponse {
  items: AdminPrivilegedAuditEventSummary[];
  nextCursor: string | null;
}

export interface AdminProductVariantSummary {
  id: string;
  sku: string;
  price: number;
  stock: number;
  isActive: boolean;
  attributes: Record<string, string>;
}

export interface AdminProductDetail {
  id: string;
  shopId: string;
  shopName: string;
  shopSlug: string;
  shopStatus: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  slug: string;
  name: string;
  description: string;
  status: 'DRAFT' | 'ACTIVE' | 'HIDDEN' | 'ARCHIVED';
  moderationStatus: 'ACTIVE' | 'SUSPENDED';
  ratingAverageBasisPoints: number;
  ratingCount: number;
  soldCount: number;
  images: Array<{ id: string; url: string; isPrimary: boolean; sortOrder: number }>;
  variants: AdminProductVariantSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductLookupResponse {
  adminVersion: typeof ADMIN_VERSION;
  product: AdminProductDetail | null;
}

export interface AdminProductActionInput {
  action: 'SUSPEND' | 'RESTORE';
  reason: string;
}

export interface AdminProductActionResult {
  adminVersion: typeof ADMIN_VERSION;
  productId: string;
  moderationStatus: 'ACTIVE' | 'SUSPENDED';
  updatedAt: string;
}

// Helpers / Validators
const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null;
const isString = (val: unknown): val is string => typeof val === 'string';
const isSafeInteger = (val: unknown): val is number => Number.isSafeInteger(val);

export function isValidAdminReason(val: unknown): val is string {
  if (!isString(val)) return false;
  const trimmed = val.trim();
  return trimmed.length >= ADMIN_REASON_MIN_LENGTH && trimmed.length <= ADMIN_REASON_MAX_LENGTH;
}

export function isValidBannerDestination(val: unknown): val is string {
  if (!isString(val)) return false;
  const trimmed = val.trim();
  if (!trimmed.startsWith('/')) return false;
  if (trimmed.startsWith('//')) return false;
  if (trimmed.includes('://')) return false;
  return true;
}

export function isAllowedMediaUrl(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (!isString(val)) return false;
  const trimmed = val.trim();
  if (trimmed.startsWith('/media/')) return true;
  if (
    /^https?:\/\/(?:localhost|127\.0\.0\.1|[\w.-]+\.s3\.amazonaws\.com|[\w.-]+\.shopee\.vn|[\w.-]+\.shopeemobile\.com)(?::\d+)?(?:\/.*)?$/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

export function isIsoDateString(val: unknown): val is string {
  if (!isString(val)) return false;
  return !Number.isNaN(Date.parse(val));
}

export function isNullableIsoDateString(val: unknown): val is string | null {
  if (val === null) return true;
  return isIsoDateString(val);
}

export function isOptionalNullableIsoDateString(val: unknown): val is string | null | undefined {
  if (val === undefined || val === null) return true;
  return isIsoDateString(val);
}

export function parseAdminDashboardResponse(val: unknown): AdminDashboardResponse | null {
  if (!isRecord(val)) return null;
  if (val.adminVersion !== ADMIN_VERSION) return null;
  if (!isIsoDateString(val.generatedAt)) return null;
  if (!isRecord(val.counts)) return null;
  const c = val.counts;
  if (
    !isSafeInteger(c.usersCount) ||
    !isSafeInteger(c.activeUsersCount) ||
    !isSafeInteger(c.suspendedUsersCount) ||
    !isSafeInteger(c.shopsCount) ||
    !isSafeInteger(c.pendingShopApprovalsCount) ||
    !isSafeInteger(c.categoriesCount) ||
    !isSafeInteger(c.activeCategoriesCount) ||
    !isSafeInteger(c.homepageBannersCount) ||
    !isSafeInteger(c.enabledHomepageModulesCount) ||
    !isSafeInteger(c.recentAuditEventsCount)
  ) {
    return null;
  }
  return {
    adminVersion: ADMIN_VERSION,
    generatedAt: val.generatedAt,
    counts: {
      usersCount: c.usersCount,
      activeUsersCount: c.activeUsersCount,
      suspendedUsersCount: c.suspendedUsersCount,
      shopsCount: c.shopsCount,
      pendingShopApprovalsCount: c.pendingShopApprovalsCount,
      categoriesCount: c.categoriesCount,
      activeCategoriesCount: c.activeCategoriesCount,
      homepageBannersCount: c.homepageBannersCount,
      enabledHomepageModulesCount: c.enabledHomepageModulesCount,
      recentAuditEventsCount: c.recentAuditEventsCount,
    },
  };
}

export function isCategorySlug(val: unknown): val is string {
  if (!isString(val)) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(val) && val.length >= 2 && val.length <= 100;
}

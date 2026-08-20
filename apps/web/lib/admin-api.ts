import type {
  AdminBannerListResponse,
  AdminBannerSummary,
  AdminCategoryListResponse,
  AdminCategorySummary,
  AdminDashboardResponse,
  AdminHomepageModuleListResponse,
  AdminHomepageModuleSummary,
  AdminPrivilegedAuditListQuery,
  AdminPrivilegedAuditListResponse,
  AdminProductActionInput,
  AdminProductActionResult,
  AdminProductLookupResponse,
  AdminShopActionRequest,
  AdminShopListQuery,
  AdminShopListResponse,
  AdminShopSummary,
  AdminUserActionRequest,
  AdminUserListQuery,
  AdminUserListResponse,
  AdminUserSummary,
  CreateAdminBannerRequest,
  CreateAdminCategoryRequest,
  ReorderAdminBannersRequest,
  ReorderAdminCategoriesRequest,
  UpdateAdminBannerRequest,
  UpdateAdminCategoryRequest,
  UpdateAdminHomepageModuleSettingsRequest,
} from '@shopee-clone/contracts';



const fallbackBaseUrl = 'http://localhost:3001';

export type AuthenticatedFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class AdminApiError extends Error {
  constructor(
    public readonly kind: 'status' | 'contract',
    public readonly status: number,
    public readonly problem?: { title?: string; detail?: string; code?: string },
  ) {
    super(`Admin API ${kind} error (${status}): ${problem?.detail || problem?.title || 'Unknown'}`);
    this.name = 'AdminApiError';
  }
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

async function requestJson<T>(
  url: URL,
  fetcher: AuthenticatedFetcher,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(url, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json, application/problem+json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let problem: any;
    try {
      problem = await response.json();
    } catch {
      // problem fallback
    }
    throw new AdminApiError('status', response.status, problem);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new AdminApiError('contract', response.status);
  }
}

export function fetchAdminDashboard(fetcher: AuthenticatedFetcher): Promise<AdminDashboardResponse> {
  return requestJson(endpoint('/api/v1/admin/dashboard'), fetcher);
}

export function fetchAdminUsers(
  fetcher: AuthenticatedFetcher,
  query?: AdminUserListQuery,
): Promise<AdminUserListResponse> {
  const url = endpoint('/api/v1/admin/users');
  if (query?.limit) url.searchParams.set('limit', String(query.limit));
  if (query?.cursor) url.searchParams.set('cursor', query.cursor);
  if (query?.status) url.searchParams.set('status', query.status);
  if (query?.role) url.searchParams.set('role', query.role);
  if (query?.q) url.searchParams.set('q', query.q);
  return requestJson(url, fetcher);
}

export function fetchAdminUser(
  fetcher: AuthenticatedFetcher,
  userId: string,
): Promise<AdminUserSummary> {
  return requestJson(endpoint(`/api/v1/admin/users/${userId}`), fetcher);
}

export function executeAdminUserAction(
  fetcher: AuthenticatedFetcher,
  userId: string,
  input: AdminUserActionRequest,
): Promise<AdminUserSummary> {
  return requestJson(endpoint(`/api/v1/admin/users/${userId}/actions`), fetcher, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchAdminShops(
  fetcher: AuthenticatedFetcher,
  query?: AdminShopListQuery,
): Promise<AdminShopListResponse> {
  const url = endpoint('/api/v1/admin/shops');
  if (query?.limit) url.searchParams.set('limit', String(query.limit));
  if (query?.cursor) url.searchParams.set('cursor', query.cursor);
  if (query?.status) url.searchParams.set('status', query.status);
  if (query?.onboardingStatus) url.searchParams.set('onboardingStatus', query.onboardingStatus);
  if (query?.q) url.searchParams.set('q', query.q);
  return requestJson(url, fetcher);
}

export function fetchAdminShop(
  fetcher: AuthenticatedFetcher,
  shopId: string,
): Promise<AdminShopSummary> {
  return requestJson(endpoint(`/api/v1/admin/shops/${shopId}`), fetcher);
}

export function executeAdminShopAction(
  fetcher: AuthenticatedFetcher,
  shopId: string,
  input: AdminShopActionRequest,
): Promise<AdminShopSummary> {
  return requestJson(endpoint(`/api/v1/admin/shops/${shopId}/actions`), fetcher, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchAdminCategories(
  fetcher: AuthenticatedFetcher,
): Promise<AdminCategoryListResponse> {
  return requestJson(endpoint('/api/v1/admin/categories'), fetcher);
}

export function createAdminCategory(
  fetcher: AuthenticatedFetcher,
  input: CreateAdminCategoryRequest,
): Promise<AdminCategorySummary> {
  return requestJson(endpoint('/api/v1/admin/categories'), fetcher, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAdminCategory(
  fetcher: AuthenticatedFetcher,
  categoryId: string,
  input: UpdateAdminCategoryRequest,
): Promise<AdminCategorySummary> {
  return requestJson(endpoint(`/api/v1/admin/categories/${categoryId}`), fetcher, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteAdminCategory(
  fetcher: AuthenticatedFetcher,
  categoryId: string,
): Promise<void> {
  return requestJson(endpoint(`/api/v1/admin/categories/${categoryId}`), fetcher, {
    method: 'DELETE',
  });
}

export function reorderAdminCategories(
  fetcher: AuthenticatedFetcher,
  input: ReorderAdminCategoriesRequest,
): Promise<AdminCategorySummary[]> {
  return requestJson(endpoint('/api/v1/admin/categories/reorder'), fetcher, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchAdminBanners(fetcher: AuthenticatedFetcher): Promise<AdminBannerListResponse> {
  return requestJson(endpoint('/api/v1/admin/homepage/banners'), fetcher);
}

export function createAdminBanner(
  fetcher: AuthenticatedFetcher,
  input: CreateAdminBannerRequest,
): Promise<AdminBannerSummary> {
  return requestJson(endpoint('/api/v1/admin/homepage/banners'), fetcher, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAdminBanner(
  fetcher: AuthenticatedFetcher,
  bannerId: string,
  input: UpdateAdminBannerRequest,
): Promise<AdminBannerSummary> {
  return requestJson(endpoint(`/api/v1/admin/homepage/banners/${bannerId}`), fetcher, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteAdminBanner(fetcher: AuthenticatedFetcher, bannerId: string): Promise<void> {
  return requestJson(endpoint(`/api/v1/admin/homepage/banners/${bannerId}`), fetcher, {
    method: 'DELETE',
  });
}

export function reorderAdminBanners(
  fetcher: AuthenticatedFetcher,
  input: ReorderAdminBannersRequest,
): Promise<AdminBannerSummary[]> {
  return requestJson(endpoint('/api/v1/admin/homepage/banners/reorder'), fetcher, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchAdminHomepageModules(
  fetcher: AuthenticatedFetcher,
): Promise<AdminHomepageModuleListResponse> {
  return requestJson(endpoint('/api/v1/admin/homepage/modules'), fetcher);
}

export function updateAdminHomepageModule(
  fetcher: AuthenticatedFetcher,
  moduleId: string,
  input: UpdateAdminHomepageModuleSettingsRequest,
): Promise<AdminHomepageModuleSummary> {
  return requestJson(endpoint(`/api/v1/admin/homepage/modules/${moduleId}`), fetcher, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function fetchAdminAudit(
  fetcher: AuthenticatedFetcher,
  query?: AdminPrivilegedAuditListQuery,
): Promise<AdminPrivilegedAuditListResponse> {
  const url = endpoint('/api/v1/admin/audit');
  if (query?.limit) url.searchParams.set('limit', String(query.limit));
  if (query?.cursor) url.searchParams.set('cursor', query.cursor);
  if (query?.targetType) url.searchParams.set('targetType', query.targetType);
  if (query?.targetId) url.searchParams.set('targetId', query.targetId);
  if (query?.actorUserId) url.searchParams.set('actorUserId', query.actorUserId);
  if (query?.action) url.searchParams.set('action', query.action);
  return requestJson(url, fetcher);
}

export function lookupAdminProduct(
  fetcher: AuthenticatedFetcher,
  query: { slug?: string; id?: string },
): Promise<AdminProductLookupResponse> {
  const url = endpoint('/api/v1/admin/products/lookup');
  if (query.slug) url.searchParams.set('slug', query.slug);
  if (query.id) url.searchParams.set('id', query.id);
  return requestJson(url, fetcher);
}

export function applyAdminProductAction(
  fetcher: AuthenticatedFetcher,
  productId: string,
  input: AdminProductActionInput,
): Promise<AdminProductActionResult> {
  return requestJson(endpoint(`/api/v1/admin/products/${productId}/actions`), fetcher, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}


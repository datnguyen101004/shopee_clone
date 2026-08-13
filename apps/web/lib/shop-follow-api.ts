import {
  FOLLOWED_SHOPS_DEFAULT_PAGE,
  FOLLOWED_SHOPS_DEFAULT_PAGE_SIZE,
  FOLLOWED_SHOPS_MAX_PAGE_SIZE,
  SHOP_FOLLOW_MAX_STATUS_IDS,
  isCanonicalShopId,
  parseFollowedShopPage,
  parseShopFollowMutationResponse,
  parseShopFollowStateList,
  parseShopStorefrontProblemDetails,
  type FollowedShopPage,
  type FollowedShopPageQuery,
  type ShopFollowMutationResponse,
  type ShopFollowStateList,
  type ShopStorefrontProblemDetails,
} from '@shopee-clone/contracts';

import type { AuthenticatedFetch } from './account-api';

const fallbackBaseUrl = 'http://localhost:3001';

export class ShopFollowApiError extends Error {
  constructor(
    readonly kind: 'input' | 'transport' | 'status' | 'contract',
    readonly status = 0,
    readonly problem: ShopStorefrontProblemDetails | null = null,
  ) {
    super(`Shop follow API ${kind} error`);
  }
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

async function request(
  path: string,
  method: 'GET' | 'PUT' | 'DELETE',
  authenticatedFetch: AuthenticatedFetch,
) {
  let response: Response;
  try {
    response = await authenticatedFetch(endpoint(path), {
      method,
      cache: 'no-store',
      headers: { Accept: 'application/json, application/problem+json' },
    });
  } catch {
    throw new ShopFollowApiError('transport');
  }
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // The status is still useful if an upstream returned malformed Problem Details.
    }
    throw new ShopFollowApiError(
      'status',
      response.status,
      parseShopStorefrontProblemDetails(body),
    );
  }
  return response;
}

function followedShopsQuery({
  page = FOLLOWED_SHOPS_DEFAULT_PAGE,
  pageSize = FOLLOWED_SHOPS_DEFAULT_PAGE_SIZE,
}: Partial<FollowedShopPageQuery> = {}): string {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > FOLLOWED_SHOPS_MAX_PAGE_SIZE
  ) {
    throw new ShopFollowApiError('input');
  }
  return new URLSearchParams({ page: String(page), pageSize: String(pageSize) }).toString();
}

export async function getFollowedShops(
  query: Partial<FollowedShopPageQuery>,
  authenticatedFetch: AuthenticatedFetch,
): Promise<FollowedShopPage> {
  const response = await request(
    `/api/v1/account/followed-shops?${followedShopsQuery(query)}`,
    'GET',
    authenticatedFetch,
  );
  const parsed = parseFollowedShopPage(await response.json());
  if (!parsed) throw new ShopFollowApiError('contract', response.status);
  return parsed;
}

export async function getShopFollowStatus(
  shopIds: string[],
  authenticatedFetch: AuthenticatedFetch,
): Promise<ShopFollowStateList> {
  if (
    shopIds.length < 1 ||
    shopIds.length > SHOP_FOLLOW_MAX_STATUS_IDS ||
    new Set(shopIds).size !== shopIds.length ||
    !shopIds.every(isCanonicalShopId)
  ) {
    throw new ShopFollowApiError('input');
  }
  const query = new URLSearchParams({ shopIds: shopIds.join(',') });
  const response = await request(
    `/api/v1/account/followed-shops/status?${query}`,
    'GET',
    authenticatedFetch,
  );
  const parsed = parseShopFollowStateList(await response.json());
  if (!parsed) throw new ShopFollowApiError('contract', response.status);
  return parsed;
}

export async function setShopFollowing(
  shopId: string,
  isFollowing: boolean,
  authenticatedFetch: AuthenticatedFetch,
): Promise<ShopFollowMutationResponse> {
  if (!isCanonicalShopId(shopId)) throw new ShopFollowApiError('input');
  const response = await request(
    `/api/v1/account/followed-shops/${encodeURIComponent(shopId)}`,
    isFollowing ? 'PUT' : 'DELETE',
    authenticatedFetch,
  );
  const parsed = parseShopFollowMutationResponse(await response.json());
  if (!parsed) throw new ShopFollowApiError('contract', response.status);
  return parsed;
}

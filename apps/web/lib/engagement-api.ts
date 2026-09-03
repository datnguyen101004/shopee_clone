import {
  ENGAGEMENT_DEFAULT_PAGE,
  ENGAGEMENT_DEFAULT_PAGE_SIZE,
  ENGAGEMENT_MAX_PAGE_SIZE,
  ENGAGEMENT_MAX_STATUS_PRODUCT_IDS,
  isCanonicalEngagementProductId,
  parseEngagementProblemDetails,
  parseFavoriteMutationResponse,
  parseFavoritePage,
  parseFavoriteStateList,
  parseRecentlyViewedMutationResponse,
  parseRecentlyViewedPage,
  type EngagementProblemDetails,
  type FavoriteMutationResponse,
  type FavoritePage,
  type FavoriteStateList,
  type RecentlyViewedMutationResponse,
  type RecentlyViewedPage,
} from '@shopee-clone/contracts';

import type { AuthenticatedFetch } from './account-api';

const fallbackBaseUrl = 'http://localhost:3001';

export class EngagementApiError extends Error {
  constructor(
    readonly kind: 'input' | 'transport' | 'status' | 'contract',
    readonly status = 0,
    readonly problem: EngagementProblemDetails | null = null,
  ) {
    super(`Engagement API ${kind} error`);
  }
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

function paginationQuery(page = ENGAGEMENT_DEFAULT_PAGE, pageSize = ENGAGEMENT_DEFAULT_PAGE_SIZE) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > ENGAGEMENT_MAX_PAGE_SIZE
  ) {
    throw new EngagementApiError('input');
  }
  return new URLSearchParams({ page: String(page), pageSize: String(pageSize) }).toString();
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
    throw new EngagementApiError('transport');
  }
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Status remains useful when a dependency returns a malformed error body.
    }
    throw new EngagementApiError('status', response.status, parseEngagementProblemDetails(body));
  }
  return response;
}

async function parsed<T>(response: Response, parser: (value: unknown) => T | null): Promise<T> {
  const value = parser(await response.json());
  if (!value) throw new EngagementApiError('contract', response.status);
  return value;
}

export async function getFavoriteStatus(
  productIds: string[],
  authenticatedFetch: AuthenticatedFetch,
): Promise<FavoriteStateList> {
  if (
    productIds.length < 1 ||
    productIds.length > ENGAGEMENT_MAX_STATUS_PRODUCT_IDS ||
    new Set(productIds).size !== productIds.length ||
    !productIds.every(isCanonicalEngagementProductId)
  ) {
    throw new EngagementApiError('input');
  }
  const query = new URLSearchParams({ productIds: productIds.join(',') });
  return parsed(
    await request(`/api/v1/account/favorites/status?${query}`, 'GET', authenticatedFetch),
    parseFavoriteStateList,
  );
}

export async function setFavorite(
  productId: string,
  isFavorite: boolean,
  authenticatedFetch: AuthenticatedFetch,
): Promise<FavoriteMutationResponse> {
  if (!isCanonicalEngagementProductId(productId)) throw new EngagementApiError('input');
  return parsed(
    await request(
      `/api/v1/account/favorites/${encodeURIComponent(productId)}`,
      isFavorite ? 'PUT' : 'DELETE',
      authenticatedFetch,
    ),
    parseFavoriteMutationResponse,
  );
}

export async function getFavorites(
  page: number,
  pageSize: number,
  authenticatedFetch: AuthenticatedFetch,
): Promise<FavoritePage> {
  return parsed(
    await request(
      `/api/v1/account/favorites?${paginationQuery(page, pageSize)}`,
      'GET',
      authenticatedFetch,
    ),
    parseFavoritePage,
  );
}

export async function recordRecentlyViewed(
  productId: string,
  authenticatedFetch: AuthenticatedFetch,
): Promise<RecentlyViewedMutationResponse> {
  if (!isCanonicalEngagementProductId(productId)) throw new EngagementApiError('input');
  return parsed(
    await request(
      `/api/v1/account/recently-viewed/${encodeURIComponent(productId)}`,
      'PUT',
      authenticatedFetch,
    ),
    parseRecentlyViewedMutationResponse,
  );
}

export async function getRecentlyViewed(
  page: number,
  pageSize: number,
  authenticatedFetch: AuthenticatedFetch,
): Promise<RecentlyViewedPage> {
  return parsed(
    await request(
      `/api/v1/account/recently-viewed?${paginationQuery(page, pageSize)}`,
      'GET',
      authenticatedFetch,
    ),
    parseRecentlyViewedPage,
  );
}

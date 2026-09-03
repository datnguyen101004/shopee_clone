import {
  isSellerShopProfile,
  isSellerShopWorkspace,
  type CreateSellerShopRequest,
  type SellerShopProfile,
  type SellerShopWorkspace,
  type ShopApprovalRequest,
  type UpdateSellerShopRequest,
} from '@shopee-clone/contracts';

import { RoleApiError, type AuthenticatedFetcher } from './role-api';

const fallbackBaseUrl = 'http://localhost:3001';

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

async function sendJson(
  url: URL,
  fetcher: AuthenticatedFetcher,
  init: RequestInit,
): Promise<{ body: unknown; status: number }> {
  const response = await fetcher(url, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json, application/problem+json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) throw new RoleApiError('status', response.status);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RoleApiError('contract', response.status);
  }
  return { body, status: response.status };
}

export async function fetchSellerShopWorkspace(
  fetcher: AuthenticatedFetcher,
): Promise<SellerShopWorkspace> {
  const { body, status } = await sendJson(endpoint('/api/v1/seller/shop/workspace'), fetcher, {
    method: 'GET',
  });
  if (!isSellerShopWorkspace(body)) throw new RoleApiError('contract', status);
  return body;
}

export async function createSellerShop(
  fetcher: AuthenticatedFetcher,
  input: CreateSellerShopRequest,
): Promise<SellerShopProfile> {
  const { body, status } = await sendJson(endpoint('/api/v1/seller/shop'), fetcher, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!isSellerShopProfile(body)) throw new RoleApiError('contract', status);
  return body;
}

export async function updateSellerShop(
  fetcher: AuthenticatedFetcher,
  input: UpdateSellerShopRequest,
): Promise<SellerShopProfile> {
  const { body, status } = await sendJson(endpoint('/api/v1/seller/shop'), fetcher, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (!isSellerShopProfile(body)) throw new RoleApiError('contract', status);
  return body;
}

export async function updateSellerRegistration(
  fetcher: AuthenticatedFetcher,
  input: UpdateSellerShopRequest,
): Promise<SellerShopProfile> {
  const { body, status } = await sendJson(endpoint('/api/v1/seller/shop/registration'), fetcher, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (!isSellerShopProfile(body)) throw new RoleApiError('contract', status);
  return body;
}

export async function approveSellerShop(
  fetcher: AuthenticatedFetcher,
  shopId: string,
  input: ShopApprovalRequest,
): Promise<SellerShopProfile> {
  const { body, status } = await sendJson(
    endpoint(`/api/v1/admin/shops/${shopId}/approval`),
    fetcher,
    { method: 'POST', body: JSON.stringify(input) },
  );
  if (!isSellerShopProfile(body)) throw new RoleApiError('contract', status);
  return body;
}

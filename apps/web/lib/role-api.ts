import {
  isRoleAuditPage,
  isSellerShop,
  type RoleAuditPage,
  type SellerShop,
} from '@shopee-clone/contracts';

const fallbackBaseUrl = 'http://localhost:3001';

export type AuthenticatedFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class RoleApiError extends Error {
  constructor(
    public readonly kind: 'status' | 'contract',
    public readonly status: number,
  ) {
    super(`Role API ${kind} error`);
    this.name = 'RoleApiError';
  }
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

async function readJson(
  url: URL,
  fetcher: AuthenticatedFetcher,
): Promise<{ body: unknown; status: number }> {
  const response = await fetcher(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json, application/problem+json' },
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

export async function fetchSellerShop(fetcher: AuthenticatedFetcher): Promise<SellerShop> {
  const { body, status } = await readJson(endpoint('/api/v1/seller/shop'), fetcher);
  if (!isSellerShop(body)) throw new RoleApiError('contract', status);
  return body;
}

export async function fetchRoleAuditPage(
  fetcher: AuthenticatedFetcher,
  limit = 20,
  cursor?: string,
): Promise<RoleAuditPage> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RoleApiError('contract', 0);
  }
  const url = endpoint('/api/v1/admin/role-audit');
  url.searchParams.set('limit', String(limit));
  if (cursor) url.searchParams.set('cursor', cursor);
  const { body, status } = await readJson(url, fetcher);
  if (!isRoleAuditPage(body)) throw new RoleApiError('contract', status);
  return body;
}

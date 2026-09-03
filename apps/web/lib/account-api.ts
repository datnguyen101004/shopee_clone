import {
  isAccountProblemDetails,
  isCreateShippingAddressRequest,
  isUpdateBuyerProfileRequest,
  isUpdateShippingAddressRequest,
  parseBuyerProfile,
  parseShippingAddress,
  parseShippingAddressList,
  type AccountProblemDetails,
  type BuyerProfile,
  type CreateShippingAddressRequest,
  type ShippingAddress,
  type ShippingAddressList,
  type UpdateBuyerProfileRequest,
  type UpdateShippingAddressRequest,
} from '@shopee-clone/contracts';

const fallbackBaseUrl = 'http://localhost:3001';

export type AuthenticatedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class AccountApiError extends Error {
  constructor(
    public readonly kind: 'input' | 'transport' | 'status' | 'contract',
    public readonly status = 0,
    public readonly problem: AccountProblemDetails | null = null,
  ) {
    super(`Account API ${kind} error`);
    this.name = 'AccountApiError';
  }
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

async function accountRequest(
  path: string,
  init: RequestInit,
  authenticatedFetch: AuthenticatedFetch,
): Promise<Response> {
  let response: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json, application/problem+json');
    if (init.body) headers.set('Content-Type', 'application/json');
    response = await authenticatedFetch(endpoint(path), {
      ...init,
      headers,
      cache: 'no-store',
    });
  } catch {
    throw new AccountApiError('transport');
  }
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Malformed dependency responses are reduced to a status-only error.
    }
    throw new AccountApiError(
      'status',
      response.status,
      isAccountProblemDetails(body) ? body : null,
    );
  }
  return response;
}

async function parsed<T>(response: Response, parser: (value: unknown) => T | null): Promise<T> {
  const value = parser(await response.json());
  if (!value) throw new AccountApiError('contract', response.status);
  return value;
}

export async function getBuyerProfile(
  authenticatedFetch: AuthenticatedFetch,
): Promise<BuyerProfile> {
  return parsed(
    await accountRequest('/api/v1/account/profile', { method: 'GET' }, authenticatedFetch),
    parseBuyerProfile,
  );
}

export async function updateBuyerProfile(
  input: UpdateBuyerProfileRequest,
  authenticatedFetch: AuthenticatedFetch,
): Promise<BuyerProfile> {
  if (!isUpdateBuyerProfileRequest(input)) throw new AccountApiError('input');
  return parsed(
    await accountRequest(
      '/api/v1/account/profile',
      { method: 'PATCH', body: JSON.stringify(input) },
      authenticatedFetch,
    ),
    parseBuyerProfile,
  );
}

export async function getShippingAddresses(
  authenticatedFetch: AuthenticatedFetch,
): Promise<ShippingAddressList> {
  return parsed(
    await accountRequest('/api/v1/account/addresses', { method: 'GET' }, authenticatedFetch),
    parseShippingAddressList,
  );
}

export async function createShippingAddress(
  input: CreateShippingAddressRequest,
  authenticatedFetch: AuthenticatedFetch,
): Promise<ShippingAddress> {
  if (!isCreateShippingAddressRequest(input)) throw new AccountApiError('input');
  return parsed(
    await accountRequest(
      '/api/v1/account/addresses',
      { method: 'POST', body: JSON.stringify(input) },
      authenticatedFetch,
    ),
    parseShippingAddress,
  );
}

export async function updateShippingAddress(
  addressId: string,
  input: UpdateShippingAddressRequest,
  authenticatedFetch: AuthenticatedFetch,
): Promise<ShippingAddress> {
  if (!isUpdateShippingAddressRequest(input)) throw new AccountApiError('input');
  return parsed(
    await accountRequest(
      `/api/v1/account/addresses/${encodeURIComponent(addressId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
      authenticatedFetch,
    ),
    parseShippingAddress,
  );
}

export async function selectDefaultShippingAddress(
  addressId: string,
  authenticatedFetch: AuthenticatedFetch,
): Promise<ShippingAddress> {
  return parsed(
    await accountRequest(
      `/api/v1/account/addresses/${encodeURIComponent(addressId)}/default`,
      { method: 'PUT' },
      authenticatedFetch,
    ),
    parseShippingAddress,
  );
}

export async function deleteShippingAddress(
  addressId: string,
  authenticatedFetch: AuthenticatedFetch,
): Promise<void> {
  await accountRequest(
    `/api/v1/account/addresses/${encodeURIComponent(addressId)}`,
    { method: 'DELETE' },
    authenticatedFetch,
  );
}

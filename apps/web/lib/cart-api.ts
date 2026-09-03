import {
  parseCartMutationResponse,
  parseCartProblemDetails,
  parseCartResponse,
  type CartMutationResponse,
  type CartProblemDetails,
  type CartResponse,
} from '@shopee-clone/contracts';

export type CartFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const fallbackBaseUrl = 'http://localhost:3001';

export class CartApiError extends Error {
  constructor(
    readonly kind: 'transport' | 'status' | 'contract',
    readonly status = 0,
    readonly problem: CartProblemDetails | null = null,
  ) {
    super(`Cart API ${kind} error`);
  }
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

async function request(path: string, init: RequestInit, cartFetch: CartFetch): Promise<Response> {
  let response: Response;
  try {
    response = await cartFetch(endpoint(path), {
      ...init,
      cache: 'no-store',
      credentials: 'include',
      headers: {
        Accept: 'application/json, application/problem+json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new CartApiError('transport');
  }
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Preserve the useful HTTP status even when an upstream body is malformed.
    }
    throw new CartApiError('status', response.status, parseCartProblemDetails(body));
  }
  return response;
}

function versionHeaders(version: number): HeadersInit {
  return { 'If-Match': `"cart-${version}"` };
}

async function mutation(
  path: string,
  init: RequestInit,
  cartFetch: CartFetch,
): Promise<CartMutationResponse> {
  const response = await request(path, init, cartFetch);
  const parsed = parseCartMutationResponse(await response.json());
  if (!parsed) throw new CartApiError('contract', response.status);
  return parsed;
}

export async function getCart(cartFetch: CartFetch): Promise<CartResponse> {
  const response = await request('/api/v1/cart', { method: 'GET' }, cartFetch);
  const parsed = parseCartResponse(await response.json());
  if (!parsed) throw new CartApiError('contract', response.status);
  return parsed;
}

export function addCartItem(
  variantId: string,
  quantity: number,
  version: number,
  cartFetch: CartFetch,
) {
  return mutation(
    '/api/v1/cart/items',
    {
      method: 'POST',
      headers: versionHeaders(version),
      body: JSON.stringify({ variantId, quantity }),
    },
    cartFetch,
  );
}

export function updateCartQuantity(
  lineId: string,
  quantity: number,
  version: number,
  cartFetch: CartFetch,
) {
  return mutation(
    `/api/v1/cart/items/${encodeURIComponent(lineId)}`,
    {
      method: 'PATCH',
      headers: versionHeaders(version),
      body: JSON.stringify({ quantity }),
    },
    cartFetch,
  );
}

export function removeCartItem(lineId: string, version: number, cartFetch: CartFetch) {
  return mutation(
    `/api/v1/cart/items/${encodeURIComponent(lineId)}`,
    { method: 'DELETE', headers: versionHeaders(version) },
    cartFetch,
  );
}

export function setCartLineSelection(
  lineId: string,
  selected: boolean,
  version: number,
  cartFetch: CartFetch,
) {
  return mutation(
    `/api/v1/cart/items/${encodeURIComponent(lineId)}/selection`,
    {
      method: 'PUT',
      headers: versionHeaders(version),
      body: JSON.stringify({ selected }),
    },
    cartFetch,
  );
}

export function setCartShopSelection(
  shopId: string,
  selected: boolean,
  version: number,
  cartFetch: CartFetch,
) {
  return mutation(
    `/api/v1/cart/shops/${encodeURIComponent(shopId)}/selection`,
    {
      method: 'PUT',
      headers: versionHeaders(version),
      body: JSON.stringify({ selected }),
    },
    cartFetch,
  );
}

export function setAllCartSelection(selected: boolean, version: number, cartFetch: CartFetch) {
  return mutation(
    '/api/v1/cart/selection',
    {
      method: 'PUT',
      headers: versionHeaders(version),
      body: JSON.stringify({ selected }),
    },
    cartFetch,
  );
}

import {
  ORDER_LIST_FILTERS,
  ORDER_LIST_MAX_LIMIT,
  formatOrderVersionEtag,
  isOrderHistoryProblemDetails,
  parseBuyerOrderDetailResponse,
  parseBuyerOrderListResponse,
  parseCancelOrderRequest,
  parseCanonicalOrderReference,
  parseOrderIdempotencyKey,
  type BuyerOrderDetailResponse,
  type BuyerOrderListFilter,
  type BuyerOrderListResponse,
  type CancelOrderRequest,
  type OrderHistoryProblemDetails,
} from '@shopee-clone/contracts';

import type { AuthenticatedFetch } from './account-api';

const fallbackBaseUrl = 'http://localhost:3001';

export class OrderHistoryApiError extends Error {
  constructor(
    readonly kind: 'input' | 'transport' | 'status' | 'contract' | 'aborted',
    readonly status = 0,
    readonly problem: OrderHistoryProblemDetails | null = null,
  ) {
    super(`Order history API ${kind} error`);
  }
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

async function orderRequest(
  path: string,
  init: RequestInit,
  authenticatedFetch: AuthenticatedFetch,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json, application/problem+json');
    if (init.body) headers.set('Content-Type', 'application/json');
    const response = await authenticatedFetch(endpoint(path), {
      ...init,
      headers,
      cache: 'no-store',
      credentials: 'include',
      signal,
    });
    if (response.ok) return response;
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      /* Status remains authoritative. */
    }
    throw new OrderHistoryApiError(
      'status',
      response.status,
      isOrderHistoryProblemDetails(body) ? body : null,
    );
  } catch (error) {
    if (error instanceof OrderHistoryApiError) throw error;
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new OrderHistoryApiError('aborted');
    }
    throw new OrderHistoryApiError('transport');
  }
}

export async function getBuyerOrders(
  filter: BuyerOrderListFilter,
  cursor: string | null,
  authenticatedFetch: AuthenticatedFetch,
  signal?: AbortSignal,
  limit = 20,
): Promise<BuyerOrderListResponse> {
  if (
    !ORDER_LIST_FILTERS.includes(filter) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > ORDER_LIST_MAX_LIMIT
  ) {
    throw new OrderHistoryApiError('input');
  }
  const query = new URLSearchParams({ filter, limit: String(limit) });
  if (cursor) query.set('cursor', cursor);
  const response = await orderRequest(
    `/api/v1/account/orders?${query}`,
    { method: 'GET' },
    authenticatedFetch,
    signal,
  );
  const parsed = parseBuyerOrderListResponse(await response.json());
  if (!parsed || parsed.page.limit !== limit)
    throw new OrderHistoryApiError('contract', response.status);
  return parsed;
}

export async function getBuyerOrderDetail(
  orderReference: string,
  authenticatedFetch: AuthenticatedFetch,
  signal?: AbortSignal,
): Promise<BuyerOrderDetailResponse> {
  if (!parseCanonicalOrderReference(orderReference)) throw new OrderHistoryApiError('input');
  const response = await orderRequest(
    `/api/v1/account/orders/${encodeURIComponent(orderReference)}`,
    { method: 'GET' },
    authenticatedFetch,
    signal,
  );
  const parsed = parseBuyerOrderDetailResponse(await response.json());
  if (!parsed || parsed.order.orderReference !== orderReference)
    throw new OrderHistoryApiError('contract', response.status);
  return parsed;
}

export async function cancelBuyerOrder(
  orderReference: string,
  version: number,
  idempotencyKey: string,
  input: CancelOrderRequest,
  authenticatedFetch: AuthenticatedFetch,
): Promise<BuyerOrderDetailResponse> {
  const parsedInput = parseCancelOrderRequest(input);
  if (
    !parseCanonicalOrderReference(orderReference) ||
    !Number.isSafeInteger(version) ||
    version < 0 ||
    !parseOrderIdempotencyKey(idempotencyKey) ||
    !parsedInput
  )
    throw new OrderHistoryApiError('input');
  const response = await orderRequest(
    `/api/v1/account/orders/${encodeURIComponent(orderReference)}/cancel`,
    {
      method: 'POST',
      headers: { 'If-Match': formatOrderVersionEtag(version), 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(parsedInput),
    },
    authenticatedFetch,
  );
  const parsed = parseBuyerOrderDetailResponse(await response.json());
  if (!parsed || parsed.order.orderReference !== orderReference || parsed.order.version < version) {
    throw new OrderHistoryApiError('contract', response.status);
  }
  return parsed;
}

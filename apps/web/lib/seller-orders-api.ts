import {
  formatSellerOrderVersionEtag,
  isSellerOrderDetailResponse,
  isSellerOrderListResponse,
  type SellerOrderActionRequest,
  type SellerOrderDetailResponse,
  type SellerOrderListResponse,
  type SellerOrderQueueQuery,
} from '@shopee-clone/contracts';
import { RoleApiError, type AuthenticatedFetcher } from './role-api';

const endpoint = (path: string) =>
  new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001');

export interface SellerOrderDetailResult {
  data: SellerOrderDetailResponse;
  etag: string;
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function problemOf(value: unknown) {
  const problem =
    value && typeof value === 'object'
      ? (value as { detail?: unknown; invalidParameters?: unknown })
      : {};
  return {
    detail: typeof problem.detail === 'string' ? problem.detail : undefined,
    invalidParameters: Array.isArray(problem.invalidParameters)
      ? problem.invalidParameters.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

export async function fetchSellerOrders(
  fetcher: AuthenticatedFetcher,
  input: Partial<SellerOrderQueueQuery> = {},
): Promise<SellerOrderListResponse> {
  const url = endpoint('/api/v1/seller/orders');
  const query: Record<string, string | number | null | undefined> = {
    status: input.status,
    fulfillment: input.fulfillment,
    from: input.from,
    to: input.to,
    orderReference: input.orderReference,
    limit: input.limit,
    cursor: input.cursor,
  };
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '')
      url.searchParams.set(key, String(value));
  });
  const response = await fetcher(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json, application/problem+json' },
  });
  const body = await bodyOf(response);
  if (!response.ok) throw new RoleApiError('status', response.status, problemOf(body));
  if (!isSellerOrderListResponse(body)) throw new RoleApiError('contract', response.status);
  return body;
}

export async function fetchSellerOrder(
  fetcher: AuthenticatedFetcher,
  orderReference: string,
): Promise<SellerOrderDetailResult> {
  const response = await fetcher(
    endpoint(`/api/v1/seller/orders/${encodeURIComponent(orderReference)}`),
    {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json, application/problem+json' },
    },
  );
  const body = await bodyOf(response);
  if (!response.ok) throw new RoleApiError('status', response.status, problemOf(body));
  if (!isSellerOrderDetailResponse(body)) throw new RoleApiError('contract', response.status);
  const etag = response.headers.get('ETag');
  const fallback = formatSellerOrderVersionEtag(
    body.order.summary.orderVersion,
    body.order.summary.fulfillmentVersion,
  );
  return { data: body, etag: etag ?? fallback };
}

export async function executeSellerOrderAction(
  fetcher: AuthenticatedFetcher,
  orderReference: string,
  etag: string,
  input: SellerOrderActionRequest,
  idempotencyKey = crypto.randomUUID(),
): Promise<SellerOrderDetailResult> {
  const response = await fetcher(
    endpoint(`/api/v1/seller/orders/${encodeURIComponent(orderReference)}/actions`),
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Accept: 'application/json, application/problem+json',
        'Content-Type': 'application/json',
        'If-Match': etag,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(input),
    },
  );
  const body = await bodyOf(response);
  if (!response.ok) throw new RoleApiError('status', response.status, problemOf(body));
  if (!isSellerOrderDetailResponse(body)) throw new RoleApiError('contract', response.status);
  return {
    data: body,
    etag:
      response.headers.get('ETag') ??
      formatSellerOrderVersionEtag(
        body.order.summary.orderVersion,
        body.order.summary.fulfillmentVersion,
      ),
  };
}

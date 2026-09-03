import {
  formatReturnVersionEtag,
  isAdminReturnDetailResponse,
  isReturnDetailResponse,
  isReturnListResponse,
  isReturnProblemDetails,
  type AdminReturnDecisionRequest,
  type AdminReturnDetailResponse,
  type BuyerReturnActionRequest,
  type CreateReturnRequest,
  type ReturnDetailResponse,
  type ReturnListQuery,
  type ReturnListResponse,
  type SellerReturnActionRequest,
  type StagedReturnEvidence,
} from '@shopee-clone/contracts';

import type { AuthenticatedFetcher } from './role-api';

const fallbackBaseUrl = 'http://localhost:3001';

export class ReturnApiError extends Error {
  constructor(
    public readonly kind: 'status' | 'contract',
    public readonly status: number,
    public readonly problem?: {
      detail: string;
      code: string;
      currentVersion?: number;
      invalidParameters?: string[];
    },
  ) {
    super(problem?.detail ?? `Return API ${kind} error (${status})`);
    this.name = 'ReturnApiError';
  }
}

export interface ReturnDetailResult<T extends ReturnDetailResponse | AdminReturnDetailResponse> {
  data: T;
  etag: string;
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function problemOf(value: unknown): ReturnApiError['problem'] | undefined {
  if (!isReturnProblemDetails(value)) return undefined;
  return {
    detail: value.detail,
    code: value.code,
    ...(value.currentVersion === undefined ? {} : { currentVersion: value.currentVersion }),
    ...(value.invalidParameters === undefined
      ? {}
      : { invalidParameters: value.invalidParameters }),
  };
}

function applyQuery(url: URL, query: Partial<ReturnListQuery>) {
  const values: Record<string, string | number | null | undefined> = {
    status: query.status,
    deadline: query.deadline,
    from: query.from,
    to: query.to,
    reference: query.reference,
    limit: query.limit,
    cursor: query.cursor,
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
}

async function requestList(
  fetcher: AuthenticatedFetcher,
  path: string,
  query: Partial<ReturnListQuery> = {},
): Promise<ReturnListResponse> {
  const url = endpoint(path);
  applyQuery(url, query);
  const response = await fetcher(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json, application/problem+json' },
  });
  const body = await bodyOf(response);
  if (!response.ok) throw new ReturnApiError('status', response.status, problemOf(body));
  if (!isReturnListResponse(body)) throw new ReturnApiError('contract', response.status);
  return body;
}

async function requestDetail<T extends ReturnDetailResponse | AdminReturnDetailResponse>(
  fetcher: AuthenticatedFetcher,
  path: string,
  guard: (value: unknown) => value is T,
): Promise<ReturnDetailResult<T>> {
  const response = await fetcher(endpoint(path), {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json, application/problem+json' },
  });
  const body = await bodyOf(response);
  if (!response.ok) throw new ReturnApiError('status', response.status, problemOf(body));
  if (!guard(body)) throw new ReturnApiError('contract', response.status);
  return { data: body, etag: response.headers.get('ETag') ?? formatReturnVersionEtag(body.return.version) };
}

async function requestMutation<T extends ReturnDetailResponse | AdminReturnDetailResponse>(
  fetcher: AuthenticatedFetcher,
  path: string,
  etag: string,
  input: unknown,
  guard: (value: unknown) => value is T,
  idempotencyKey = crypto.randomUUID(),
): Promise<ReturnDetailResult<T>> {
  const response = await fetcher(endpoint(path), {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Accept: 'application/json, application/problem+json',
      'Content-Type': 'application/json',
      'If-Match': etag,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  const body = await bodyOf(response);
  if (!response.ok) throw new ReturnApiError('status', response.status, problemOf(body));
  if (!guard(body)) throw new ReturnApiError('contract', response.status);
  return { data: body, etag: response.headers.get('ETag') ?? formatReturnVersionEtag(body.return.version) };
}

export function stageReturnEvidence(
  fetcher: AuthenticatedFetcher,
  file: File,
): Promise<StagedReturnEvidence> {
  const form = new FormData();
  form.set('file', file);
  return fetcher(endpoint('/api/v1/account/return-evidence'), {
    method: 'POST',
    cache: 'no-store',
    headers: { Accept: 'application/json, application/problem+json' },
    body: form,
  }).then(async (response) => {
    const body = await bodyOf(response);
    if (!response.ok) throw new ReturnApiError('status', response.status, problemOf(body));
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new ReturnApiError('contract', response.status);
    const record = body as Record<string, unknown>;
    if (typeof record.evidenceId !== 'string' || typeof record.expiresAt !== 'string')
      throw new ReturnApiError('contract', response.status);
    return { evidenceId: record.evidenceId, expiresAt: record.expiresAt };
  });
}

export function fetchBuyerReturns(
  fetcher: AuthenticatedFetcher,
  query?: Partial<ReturnListQuery>,
): Promise<ReturnListResponse> {
  return requestList(fetcher, '/api/v1/account/returns', query);
}

export function fetchBuyerReturn(
  fetcher: AuthenticatedFetcher,
  returnReference: string,
): Promise<ReturnDetailResult<ReturnDetailResponse>> {
  return requestDetail(fetcher, `/api/v1/account/returns/${encodeURIComponent(returnReference)}`, isReturnDetailResponse);
}

export function createBuyerReturn(
  fetcher: AuthenticatedFetcher,
  orderReference: string,
  orderVersion: number,
  input: CreateReturnRequest,
  idempotencyKey = crypto.randomUUID(),
): Promise<ReturnDetailResult<ReturnDetailResponse>> {
  return requestMutation(
    fetcher,
    `/api/v1/account/orders/${encodeURIComponent(orderReference)}/returns`,
    `"order-${orderVersion}"`,
    input,
    isReturnDetailResponse,
    idempotencyKey,
  );
}

export function executeBuyerReturnAction(
  fetcher: AuthenticatedFetcher,
  returnReference: string,
  etag: string,
  input: BuyerReturnActionRequest,
  idempotencyKey = crypto.randomUUID(),
): Promise<ReturnDetailResult<ReturnDetailResponse>> {
  return requestMutation(
    fetcher,
    `/api/v1/account/returns/${encodeURIComponent(returnReference)}/actions`,
    etag,
    input,
    isReturnDetailResponse,
    idempotencyKey,
  );
}

export function fetchSellerReturns(
  fetcher: AuthenticatedFetcher,
  query?: Partial<ReturnListQuery>,
): Promise<ReturnListResponse> {
  return requestList(fetcher, '/api/v1/seller/returns', query);
}

export function fetchSellerReturn(
  fetcher: AuthenticatedFetcher,
  returnReference: string,
): Promise<ReturnDetailResult<ReturnDetailResponse>> {
  return requestDetail(fetcher, `/api/v1/seller/returns/${encodeURIComponent(returnReference)}`, isReturnDetailResponse);
}

export function executeSellerReturnAction(
  fetcher: AuthenticatedFetcher,
  returnReference: string,
  etag: string,
  input: SellerReturnActionRequest,
  idempotencyKey = crypto.randomUUID(),
): Promise<ReturnDetailResult<ReturnDetailResponse>> {
  return requestMutation(
    fetcher,
    `/api/v1/seller/returns/${encodeURIComponent(returnReference)}/actions`,
    etag,
    input,
    isReturnDetailResponse,
    idempotencyKey,
  );
}

export function fetchAdminReturns(
  fetcher: AuthenticatedFetcher,
  query?: Partial<ReturnListQuery>,
): Promise<ReturnListResponse> {
  return requestList(fetcher, '/api/v1/admin/returns', query);
}

export function fetchAdminReturn(
  fetcher: AuthenticatedFetcher,
  returnReference: string,
): Promise<ReturnDetailResult<AdminReturnDetailResponse>> {
  return requestDetail(fetcher, `/api/v1/admin/returns/${encodeURIComponent(returnReference)}`, isAdminReturnDetailResponse);
}

export function decideAdminReturn(
  fetcher: AuthenticatedFetcher,
  returnReference: string,
  etag: string,
  input: AdminReturnDecisionRequest,
  idempotencyKey = crypto.randomUUID(),
): Promise<ReturnDetailResult<AdminReturnDetailResponse>> {
  return requestMutation(
    fetcher,
    `/api/v1/admin/returns/${encodeURIComponent(returnReference)}/decisions`,
    etag,
    input,
    isAdminReturnDetailResponse,
    idempotencyKey,
  );
}

import {
  isSellerProductCategories,
  isSellerProductDetail,
  isSellerProductPage,
  type SellerProductDetail,
  type SellerProductLifecycle,
  type SellerProductPage,
  type SellerProductUpsertRequest,
  type SellerProductCategory,
  type SellerProductMediaStageResponse,
  type SellerProductMediaUploadIntentResponse,
} from '@shopee-clone/contracts';
import { RoleApiError, type AuthenticatedFetcher } from './role-api';

const fallbackBaseUrl = 'http://localhost:3001';
const endpoint = (path: string) =>
  new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);

async function json(
  fetcher: AuthenticatedFetcher,
  url: URL,
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
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RoleApiError(response.ok ? 'contract' : 'status', response.status);
  }
  if (!response.ok) {
    const problem =
      body && typeof body === 'object'
        ? (body as { detail?: unknown; invalidParameters?: unknown })
        : {};
    throw new RoleApiError('status', response.status, {
      detail: typeof problem.detail === 'string' ? problem.detail : undefined,
      invalidParameters: Array.isArray(problem.invalidParameters)
        ? problem.invalidParameters.filter((item): item is string => typeof item === 'string')
        : undefined,
    });
  }
  return { body, status: response.status };
}

export async function fetchSellerProducts(
  fetcher: AuthenticatedFetcher,
  input: {
    cursor?: string;
    lifecycle?: SellerProductLifecycle;
    campaign?: 'ACTIVE' | 'UPCOMING' | 'HISTORY';
    campaignTypeCode?: string;
  } = {},
): Promise<SellerProductPage> {
  const url = endpoint('/api/v1/seller/products');
  if (input.cursor) url.searchParams.set('cursor', input.cursor);
  if (input.lifecycle) url.searchParams.set('lifecycle', input.lifecycle);
  if (input.campaign) url.searchParams.set('campaign', input.campaign);
  if (input.campaignTypeCode) url.searchParams.set('campaignTypeCode', input.campaignTypeCode);
  const { body, status } = await json(fetcher, url, { method: 'GET' });
  if (!isSellerProductPage(body)) throw new RoleApiError('contract', status);
  return body;
}

export async function fetchSellerProductCategories(
  fetcher: AuthenticatedFetcher,
): Promise<SellerProductCategory[]> {
  const { body, status } = await json(fetcher, endpoint('/api/v1/seller/products/categories'), {
    method: 'GET',
  });
  if (!isSellerProductCategories(body)) throw new RoleApiError('contract', status);
  return body;
}

export async function fetchSellerProduct(
  fetcher: AuthenticatedFetcher,
  productId: string,
): Promise<SellerProductDetail> {
  const { body, status } = await json(fetcher, endpoint(`/api/v1/seller/products/${productId}`), {
    method: 'GET',
  });
  if (!isSellerProductDetail(body)) throw new RoleApiError('contract', status);
  return body;
}

export async function createSellerProduct(
  fetcher: AuthenticatedFetcher,
  input: SellerProductUpsertRequest,
): Promise<SellerProductDetail> {
  const { body, status } = await json(fetcher, endpoint('/api/v1/seller/products'), {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!isSellerProductDetail(body)) throw new RoleApiError('contract', status);
  return body;
}

export async function updateSellerProduct(
  fetcher: AuthenticatedFetcher,
  productId: string,
  input: SellerProductUpsertRequest,
): Promise<SellerProductDetail> {
  const { body, status } = await json(fetcher, endpoint(`/api/v1/seller/products/${productId}`), {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (!isSellerProductDetail(body)) throw new RoleApiError('contract', status);
  return body;
}

export async function transitionSellerProduct(
  fetcher: AuthenticatedFetcher,
  productId: string,
  lifecycle: 'published' | 'hidden' | 'archived',
): Promise<SellerProductDetail> {
  const { body, status } = await json(
    fetcher,
    endpoint(`/api/v1/seller/products/${productId}/lifecycle`),
    { method: 'PATCH', body: JSON.stringify({ lifecycle }) },
  );
  if (!isSellerProductDetail(body)) throw new RoleApiError('contract', status);
  return body;
}

export async function deleteSellerProductDraft(
  fetcher: AuthenticatedFetcher,
  productId: string,
): Promise<void> {
  const response = await fetcher(endpoint(`/api/v1/seller/products/${productId}`), {
    method: 'DELETE',
    cache: 'no-store',
    headers: { Accept: 'application/json, application/problem+json' },
  });
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const problem = body && typeof body === 'object'
      ? (body as { detail?: unknown; invalidParameters?: unknown })
      : {};
    throw new RoleApiError('status', response.status, {
      detail: typeof problem.detail === 'string' ? problem.detail : undefined,
      invalidParameters: Array.isArray(problem.invalidParameters)
        ? problem.invalidParameters.filter((item): item is string => typeof item === 'string')
        : undefined,
    });
  }
  if (response.status !== 204) throw new RoleApiError('contract', response.status);
}

function isMediaStageResponse(value: unknown): value is SellerProductMediaStageResponse {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.mimeType === 'string' &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(item.mimeType) &&
    typeof item.byteSize === 'number' &&
    typeof item.width === 'number' &&
    typeof item.height === 'number' &&
    typeof item.previewUrl === 'string' &&
    typeof item.expiresAt === 'string'
  );
}

function isUploadIntentResponse(value: unknown): value is SellerProductMediaUploadIntentResponse {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const upload = item.upload;
  if (!upload || typeof upload !== 'object') return false;
  const details = upload as Record<string, unknown>;
  const headers = details.headers;
  return typeof item.mediaId === 'string' && typeof details.url === 'string' && details.method === 'PUT' && typeof details.expiresAt === 'string' && !!headers && typeof headers === 'object' && typeof (headers as Record<string, unknown>)['Content-Type'] === 'string' && typeof (headers as Record<string, unknown>)['x-amz-checksum-sha256'] === 'string';
}

async function sha256Base64(file: File): Promise<string> {
  const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : await new Response(file).arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

export async function stageSellerProductMedia(
  fetcher: AuthenticatedFetcher,
  file: File,
): Promise<SellerProductMediaStageResponse> {
  const checksumSha256 = await sha256Base64(file);
  const intentResult = await json(fetcher, endpoint('/api/v1/seller/products/media/upload-intents'), {
    method: 'POST',
    body: JSON.stringify({ mimeType: file.type, byteSize: file.size, checksumSha256 }),
  });
  if (!isUploadIntentResponse(intentResult.body)) throw new RoleApiError('contract', intentResult.status);
  const uploadResponse = await fetch(intentResult.body.upload.url, {
    method: 'PUT',
    body: file,
    cache: 'no-store',
    headers: intentResult.body.upload.headers,
  });
  if (!uploadResponse.ok) throw new RoleApiError('status', uploadResponse.status);
  const completeResult = await json(fetcher, endpoint(`/api/v1/seller/products/media/${intentResult.body.mediaId}/complete`), {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!isMediaStageResponse(completeResult.body)) throw new RoleApiError('contract', completeResult.status);
  return completeResult.body;
}

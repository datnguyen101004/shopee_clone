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
  input: { cursor?: string; lifecycle?: SellerProductLifecycle } = {},
): Promise<SellerProductPage> {
  const url = endpoint('/api/v1/seller/products');
  if (input.cursor) url.searchParams.set('cursor', input.cursor);
  if (input.lifecycle) url.searchParams.set('lifecycle', input.lifecycle);
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

export async function stageSellerProductMedia(
  fetcher: AuthenticatedFetcher,
  file: File,
): Promise<SellerProductMediaStageResponse> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetcher(endpoint('/api/v1/seller/products/media'), {
    method: 'POST',
    body,
    cache: 'no-store',
    headers: { Accept: 'application/json, application/problem+json' },
  });
  if (!response.ok) throw new RoleApiError('status', response.status);
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new RoleApiError('contract', response.status);
  }
  if (!isMediaStageResponse(value)) throw new RoleApiError('contract', response.status);
  return value;
}

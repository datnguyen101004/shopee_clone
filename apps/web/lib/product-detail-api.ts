import 'server-only';

import {
  isCanonicalProductId,
  isProductDeletedProblemDetails,
  parseProductDetailResponse,
  type ProductDetailResponse,
} from '@shopee-clone/contracts';

export type ProductDetailApiErrorKind =
  'invalid-id' | 'not-found' | 'deleted' | 'timeout' | 'transport' | 'status' | 'contract';

export class ProductDetailApiError extends Error {
  constructor(public readonly kind: ProductDetailApiErrorKind) {
    super(`Product detail API ${kind} error`);
    this.name = 'ProductDetailApiError';
  }
}

export async function fetchProductDetail(
  productId: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 20_000,
): Promise<ProductDetailResponse> {
  if (!isCanonicalProductId(productId)) throw new ProductDetailApiError('invalid-id');
  const baseUrl =
    process.env.PRODUCT_DETAIL_API_BASE_URL ??
    process.env.CATALOG_API_BASE_URL ??
    process.env.HOMEPAGE_API_BASE_URL ??
    'http://127.0.0.1:3001';
  const url = new URL(`/api/v1/catalog/products/${encodeURIComponent(productId)}`, baseUrl);
  console.info('[storefront-api]', url.href);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetcher(url, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      const kind =
        error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'transport';
      console.error('[storefront-api] failed', { url: url.href, kind });
      throw new ProductDetailApiError(kind);
    }
    const body = await response.json().catch(() => null);
    if (response.status === 404) throw new ProductDetailApiError('not-found');
    if (response.status === 410 && isProductDeletedProblemDetails(body)) throw new ProductDetailApiError('deleted');
    if (!response.ok) throw new ProductDetailApiError('status');
    const parsed = parseProductDetailResponse(body);
    if (!parsed) throw new ProductDetailApiError('contract');
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

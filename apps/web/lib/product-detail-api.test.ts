import { describe, expect, it, vi } from 'vitest';

import { fetchProductDetail, ProductDetailApiError } from './product-detail-api';

const productId = '00000000-0000-4000-8000-000000000301';
const valid = {
  id: productId,
  name: 'Phone',
  description: 'Detail',
  category: { slug: 'phones', name: 'Phones' },
  ratingAverageBasisPoints: 490,
  ratingCount: 12,
  soldCount: 20,
  gallery: [],
  variants: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      name: '128GB',
      sku: 'PHONE',
      priceMinor: 1000,
      availableQuantity: 1,
      availability: 'in-stock',
      preferredImageId: null,
    },
  ],
  purchasable: true,
  initialVariantId: '00000000-0000-4000-8000-000000000401',
  shop: {
    id: '00000000-0000-4000-8000-000000000101',
    slug: 'store',
    name: 'Store',
    location: 'Hà Nội',
    activeProductCount: 2,
  },
  shippingPreview: {
    origin: 'Hà Nội',
    destinationLabel: 'Toàn quốc',
    feeMinor: null,
    deliveryTimeLabel: null,
    message: 'Xác nhận sau.',
  },
  relatedProducts: [],
};

describe('fetchProductDetail', () => {
  it('uses a canonical no-store request and parses valid data', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid), { status: 200 }));
    await expect(fetchProductDetail(productId, fetcher)).resolves.toEqual(valid);
    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe(`/api/v1/catalog/products/${productId}`);
    expect(init).toMatchObject({ cache: 'no-store' });
  });
  it.each([
    ['invalid-id', 'not-uuid', vi.fn()],
    ['not-found', productId, vi.fn().mockResolvedValue(new Response('{}', { status: 404 }))],
    ['status', productId, vi.fn().mockResolvedValue(new Response('{}', { status: 503 }))],
    ['contract', productId, vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))],
    ['transport', productId, vi.fn().mockRejectedValue(new TypeError('offline'))],
  ] as const)('classifies %s failures', async (kind, id, fetcher) => {
    await expect(fetchProductDetail(id, fetcher)).rejects.toEqual(new ProductDetailApiError(kind));
  });
  it('classifies aborted requests as timeout', async () => {
    const fetcher = vi.fn(
      (_url: URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          ),
        ),
    ) as unknown as typeof fetch;
    await expect(fetchProductDetail(productId, fetcher, 1)).rejects.toEqual(
      new ProductDetailApiError('timeout'),
    );
  });
});

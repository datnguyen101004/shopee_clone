import { describe, expect, it, vi } from 'vitest';

import { CatalogApiError, fetchCatalogProducts } from './catalog-api';

const valid = {
  query: {
    q: null,
    category: null,
    minPrice: null,
    maxPrice: null,
    rating: null,
    location: null,
    availability: null,
    promotion: null,
    sort: 'newest',
  },
  pagination: { page: 1, pageSize: 12, totalItems: 0, totalPages: 0 },
  facets: { categories: [], locations: [], priceRange: { min: null, max: null } },
  items: [],
};

describe('fetchCatalogProducts', () => {
  it('encodes allowlisted queries in a no-store server request', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid), { status: 200 }));
    await expect(
      fetchCatalogProducts(
        {
          q: 'ốp lưng',
          category: 'mobile-accessories',
          location: 'Hà Nội',
          sort: 'price-asc',
          page: 2,
          pageSize: 6,
        },
        fetcher,
      ),
    ).resolves.toEqual(valid);
    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      'http://127.0.0.1:3001/api/v1/catalog/products?q=%E1%BB%91p+l%C6%B0ng&category=mobile-accessories&location=H%C3%A0+N%E1%BB%99i&sort=price-asc&pageSize=6&page=2',
    );
    expect(init).toMatchObject({ cache: 'no-store' });
  });

  it.each([
    ['status', vi.fn().mockResolvedValue(new Response('{}', { status: 503 }))],
    ['contract', vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))],
    ['transport', vi.fn().mockRejectedValue(new TypeError('offline'))],
  ])('classifies %s errors', async (kind, fetcher) => {
    await expect(fetchCatalogProducts({}, fetcher)).rejects.toMatchObject({ kind });
  });

  it('accepts a valid empty response', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid), { status: 200 }));
    await expect(fetchCatalogProducts({}, fetcher)).resolves.toEqual(valid);
  });

  it('aborts a timed-out request', async () => {
    const fetcher = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;
    await expect(fetchCatalogProducts({}, fetcher, 1)).rejects.toEqual(
      new CatalogApiError('timeout'),
    );
  });
});

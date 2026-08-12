import { describe, expect, it, vi } from 'vitest';

import { CatalogApiError, fetchCatalogProducts } from './catalog-api';

const valid = {
  query: { category: null },
  pagination: { page: 1, pageSize: 12, totalItems: 0, totalPages: 0 },
  items: [],
};

describe('fetchCatalogProducts', () => {
  it('encodes allowlisted queries in a no-store server request', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(valid), { status: 200 }));
    await expect(
      fetchCatalogProducts({ category: 'mobile-accessories', page: 2, pageSize: 6 }, fetcher),
    ).resolves.toEqual(valid);
    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      'http://127.0.0.1:3001/api/v1/catalog/products?category=mobile-accessories&page=2&pageSize=6',
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

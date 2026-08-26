import { describe, expect, it, vi } from 'vitest';

import {
  fetchPublicShopCatalog,
  fetchPublicShopProfile,
  ShopStorefrontApiError,
} from './shop-storefront-api';

const shopId = '00000000-0000-4000-8000-000000000101';
const profile = {
  id: shopId,
  ownerUserId: '00000000-0000-4000-8000-000000000201',
  slug: 'demo-shop',
  name: 'Demo Shop',
  location: 'Hà Nội',
  joinedAt: '2026-08-14T03:00:00.000Z',
  activeProductCount: 0,
  ratingAverageBasisPoints: 0,
  ratingCount: 0,
  soldCount: 0,
  followerCount: 1,
  responseMetadata: {
    responseRateBasisPoints: null,
    responseTimeLabel: null,
    message: 'Chưa có dữ liệu phản hồi của shop.',
  },
  categories: [],
};
const catalog = {
  shopId,
  query: { q: null, category: null, sort: 'newest' },
  pagination: { page: 1, pageSize: 12, totalItems: 0, totalPages: 0 },
  categories: [],
  items: [],
};

describe('shop storefront server API', () => {
  it('strictly parses profile and encodes the complete canonical catalog query', async () => {
    const profileFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }));
    await expect(fetchPublicShopProfile('demo-shop', profileFetch)).resolves.toEqual(profile);
    expect((profileFetch.mock.calls[0]![0] as URL).pathname).toBe('/api/v1/shops/demo-shop');

    const catalogFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));
    await fetchPublicShopCatalog(
      'demo-shop',
      { q: null, category: null, sort: 'newest', page: 1, pageSize: 12 },
      catalogFetch,
    );
    const [url, init] = catalogFetch.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      'http://127.0.0.1:3001/api/v1/shops/demo-shop/products?sort=newest&page=1&pageSize=12',
    );
    expect(init).toMatchObject({ cache: 'no-store' });
  });

  it.each([
    ['not-found', 404],
    ['validation', 400],
    ['status', 503],
  ] as const)('classifies %s responses', async (kind, status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status }));
    await expect(fetchPublicShopProfile('demo-shop', fetcher)).rejects.toMatchObject({ kind });
  });

  it('rejects malformed successful payloads and aborted transport', async () => {
    await expect(
      fetchPublicShopProfile(
        'demo-shop',
        vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
      ),
    ).rejects.toEqual(new ShopStorefrontApiError('contract'));
    const fetcher = vi.fn(
      (_url: URL | RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;
    await expect(fetchPublicShopProfile('demo-shop', fetcher, 1)).rejects.toEqual(
      new ShopStorefrontApiError('timeout'),
    );
  });
});

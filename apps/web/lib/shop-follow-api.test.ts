import { describe, expect, it, vi } from 'vitest';

import {
  getFollowedShops,
  getShopFollowStatus,
  setShopFollowing,
  ShopFollowApiError,
} from './shop-follow-api';

const shopId = '00000000-0000-4000-8000-000000000101';

describe('shop follow API', () => {
  it('uses only authenticatedFetch for bounded status and mutations', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ shopId, isFollowing: false }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            shopId,
            isFollowing: true,
            followedAt: '2026-08-14T03:00:00.000Z',
            followerCount: 1,
          }),
          { status: 200 },
        ),
      );
    await expect(getShopFollowStatus([shopId], authenticatedFetch)).resolves.toMatchObject({
      items: [{ shopId, isFollowing: false }],
    });
    await setShopFollowing(shopId, true, authenticatedFetch);
    expect(authenticatedFetch.mock.calls[0]![0].toString()).toContain(
      `/api/v1/account/followed-shops/status?shopIds=${shopId}`,
    );
    expect(authenticatedFetch.mock.calls[1]![1]).toMatchObject({
      method: 'PUT',
      cache: 'no-store',
    });
  });

  it('rejects duplicate/invalid requests and strictly parses confirmations', async () => {
    const authenticatedFetch = vi.fn();
    await expect(getShopFollowStatus([shopId, shopId], authenticatedFetch)).rejects.toEqual(
      new ShopFollowApiError('input'),
    );
    await expect(setShopFollowing('invalid', true, authenticatedFetch)).rejects.toEqual(
      new ShopFollowApiError('input'),
    );
    authenticatedFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(setShopFollowing(shopId, false, authenticatedFetch)).rejects.toMatchObject({
      kind: 'contract',
    });
  });

  it('loads a strictly parsed page with canonical pagination', async () => {
    const page = {
      items: [
        {
          availability: 'available',
          shopId,
          followedAt: '2026-08-14T03:00:00.000Z',
          shop: {
            id: shopId,
            slug: 'demo-shop',
            name: 'Demo Shop',
            href: '/shops/demo-shop',
            location: 'Hà Nội',
            followerCount: 3,
          },
        },
      ],
      pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 },
    };
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(page), { status: 200 }));
    await expect(getFollowedShops({ page: 2, pageSize: 20 }, authenticatedFetch)).resolves.toEqual(
      page,
    );
    expect(authenticatedFetch.mock.calls[0]![0].toString()).toContain(
      '/api/v1/account/followed-shops?page=2&pageSize=20',
    );
    expect(authenticatedFetch.mock.calls[0]![1]).toMatchObject({
      method: 'GET',
      cache: 'no-store',
    });
  });

  it('rejects invalid pagination and malformed list responses', async () => {
    const authenticatedFetch = vi.fn();
    await expect(getFollowedShops({ page: 0 }, authenticatedFetch)).rejects.toMatchObject({
      kind: 'input',
    });
    authenticatedFetch.mockResolvedValue(new Response('{"items":[]}', { status: 200 }));
    await expect(getFollowedShops({}, authenticatedFetch)).rejects.toMatchObject({
      kind: 'contract',
    });
  });
});

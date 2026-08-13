import { describe, expect, it, vi } from 'vitest';

import { getShopFollowStatus, setShopFollowing, ShopFollowApiError } from './shop-follow-api';

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
});

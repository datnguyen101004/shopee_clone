import {
  getFavoriteStatus,
  getFavorites,
  getRecentlyViewed,
  recordRecentlyViewed,
  setFavorite,
} from './engagement-api';

const productId = '00000000-0000-4000-8000-000000000101';
const timestamp = '2026-08-13T03:00:00.000Z';

describe('engagement API boundary', () => {
  it('uses canonical bounded requests only through authenticatedFetch', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ productId, isFavorite: false }] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ productId, isFavorite: true, favoritedAt: timestamp }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ productId, isFavorite: false, favoritedAt: null }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ productId, lastViewedAt: timestamp }), { status: 200 }),
      );
    await getFavoriteStatus([productId], authenticatedFetch);
    await setFavorite(productId, true, authenticatedFetch);
    await setFavorite(productId, false, authenticatedFetch);
    await recordRecentlyViewed(productId, authenticatedFetch);
    expect(authenticatedFetch.mock.calls.map(([url, init]) => [String(url), init.method])).toEqual([
      [expect.stringContaining(`/favorites/status?productIds=${productId}`), 'GET'],
      [expect.stringContaining(`/favorites/${productId}`), 'PUT'],
      [expect.stringContaining(`/favorites/${productId}`), 'DELETE'],
      [expect.stringContaining(`/recently-viewed/${productId}`), 'PUT'],
    ]);
  });

  it('parses list contracts strictly and uses canonical pagination', async () => {
    const empty = (page: number, pageSize: number) => ({
      items: [],
      pagination: { page, pageSize, totalItems: 0, totalPages: 0 },
    });
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(empty(2, 20)), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(empty(1, 10)), { status: 200 }));
    await getFavorites(2, 20, authenticatedFetch);
    await getRecentlyViewed(1, 10, authenticatedFetch);
    expect(String(authenticatedFetch.mock.calls[0]![0])).toContain('page=2&pageSize=20');
    expect(String(authenticatedFetch.mock.calls[1]![0])).toContain('page=1&pageSize=10');
  });

  it('rejects invalid identifiers, bounds, and malformed successful responses', async () => {
    const authenticatedFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [], extra: true }), { status: 200 }));
    await expect(getFavoriteStatus(['not-a-uuid'], authenticatedFetch)).rejects.toMatchObject({
      kind: 'input',
    });
    await expect(getFavorites(1, 49, authenticatedFetch)).rejects.toMatchObject({ kind: 'input' });
    await expect(getFavoriteStatus([productId], authenticatedFetch)).rejects.toMatchObject({
      kind: 'contract',
    });
  });

  it('never writes engagement data to browser storage', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const authenticatedFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ productId, isFavorite: true, favoritedAt: timestamp }), {
        status: 200,
      }),
    );
    await setFavorite(productId, true, authenticatedFetch);
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });
});

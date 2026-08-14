import { getBuyerOrders, OrderHistoryApiError } from './order-history-api';

describe('order-history API client', () => {
  it('rejects invalid input before transport', async () => {
    const authenticatedFetch = vi.fn();
    await expect(
      getBuyerOrders('ALL', null, authenticatedFetch, undefined, 51),
    ).rejects.toBeInstanceOf(OrderHistoryApiError);
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('rejects malformed successful responses', async () => {
    const authenticatedFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await expect(getBuyerOrders('ALL', null, authenticatedFetch)).rejects.toMatchObject({
      kind: 'contract',
    });
  });

  it('preserves Problem Details on HTTP errors', async () => {
    const problem = {
      type: 'https://shopee-clone.local/problems/order-not-found',
      title: 'Order unavailable',
      status: 404,
      detail: 'The requested order is unavailable.',
    };
    const authenticatedFetch = vi.fn(
      async () =>
        new Response(JSON.stringify(problem), {
          status: 404,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
    );
    await expect(getBuyerOrders('ALL', null, authenticatedFetch)).rejects.toMatchObject({
      status: 404,
      problem,
    });
  });
});

import { describe, expect, it, vi } from 'vitest';

import { addCartItem, getCart } from './cart-api';

const cart = {
  owner: 'authenticated' as const,
  version: 0,
  groups: [],
  summary: {
    distinctLineCount: 0,
    selectedValidLineCount: 0,
    selectedValidQuantity: 0,
    selectedMerchandiseSubtotalMinor: 0,
  },
};

describe('cart API client', () => {
  it('parses the canonical authenticated empty cart', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(cart), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(getCart(fetcher)).resolves.toEqual(cart);
    expect(fetcher).toHaveBeenCalledWith(
      new URL('http://localhost:3001/api/v1/cart'),
      expect.objectContaining({ method: 'GET', credentials: 'include', cache: 'no-store' }),
    );
  });

  it('sends the confirmed cart version and accepts authoritative mutation output', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ cart: { ...cart, version: 1 }, adjustments: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(
      addCartItem('00000000-0000-4000-8000-000000000001', 2, 0, fetcher),
    ).resolves.toMatchObject({ cart: { version: 1 } });
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({
      'If-Match': '"cart-0"',
      'Content-Type': 'application/json',
    });
    expect(init.body).toBe(
      JSON.stringify({ variantId: '00000000-0000-4000-8000-000000000001', quantity: 2 }),
    );
  });

  it('rejects malformed success contracts', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ owner: 'authenticated', version: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(getCart(fetcher)).rejects.toMatchObject({ kind: 'contract' });
  });
});

import type { CartResponse, PricingQuoteResponse } from '@shopee-clone/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getShippingAddresses } from '../../lib/account-api';
import { getPricingQuote, PricingApiError } from '../../lib/pricing-api';
import { useAuthSession } from '../auth-session-provider';
import { useCartPricing } from './use-cart-pricing';

vi.mock('../../lib/account-api', () => ({ getShippingAddresses: vi.fn() }));
vi.mock('../../lib/pricing-api', () => ({
  getPricingQuote: vi.fn(),
  PricingApiError: class PricingApiError extends Error {
    constructor(
      public readonly kind: string,
      public readonly status: number | null = null,
      public readonly problem: unknown = null,
    ) {
      super(kind);
    }
  },
}));
vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));

const shopId = '00000000-0000-4000-8000-000000000010';
const addressId = '00000000-0000-4000-8000-000000000020';
const cart: CartResponse = {
  owner: 'authenticated',
  version: 4,
  groups: [
    {
      shop: { id: shopId, slug: 'shop', name: 'Shop', href: '/shops/shop' },
      lines: [],
      selectedEligibleLineCount: 1,
      eligibleLineCount: 1,
    },
  ],
  summary: {
    distinctLineCount: 1,
    selectedValidLineCount: 1,
    selectedValidQuantity: 1,
    selectedMerchandiseSubtotalMinor: 100_000,
  },
};

function quote(payable: number): PricingQuoteResponse {
  return {
    pricingVersion: 'pricing-v1',
    shippingVersion: 'mock-v1',
    currency: 'VND',
    cartVersion: 4,
    address: { id: addressId, province: 'Hà Nội', district: 'Ba Đình' },
    shops: [],
    exclusions: [],
    summary: {
      selectedLineCount: 0,
      selectedQuantity: 0,
      listSubtotalMinor: 0,
      productDiscountMinor: 0,
      merchandiseSubtotalMinor: 0,
      shippingTotalMinor: payable,
      payableTotalMinor: payable,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('cart pricing coordination', () => {
  const refresh = vi.fn().mockResolvedValue(cart);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthSession).mockReturnValue({
      state: {
        status: 'authenticated',
        user: {
          id: '00000000-0000-4000-8000-000000000001',
          email: 'buyer@example.test',
          displayName: 'Buyer',
          status: 'active',
          roles: ['buyer'],
        },
      },
      sessionFetch: vi.fn(),
    } as unknown as ReturnType<typeof useAuthSession>);
    vi.mocked(getShippingAddresses).mockResolvedValue({
      items: [
        {
          id: addressId,
          recipientName: 'Buyer',
          phoneNumber: '0900000000',
          province: 'Hà Nội',
          district: 'Ba Đình',
          ward: 'Phúc Xá',
          addressLine: '1 Hồng Hà',
          label: 'Nhà',
          isDefault: true,
          createdAt: '2026-08-14T00:00:00.000Z',
          updatedAt: '2026-08-14T00:00:00.000Z',
        },
      ],
    });
  });

  it('defaults services and prevents a late quote from replacing a newer choice', async () => {
    const first = deferred<PricingQuoteResponse>();
    const second = deferred<PricingQuoteResponse>();
    vi.mocked(getPricingQuote)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useCartPricing(cart, refresh));
    await waitFor(() => expect(getPricingQuote).toHaveBeenCalledTimes(1));
    expect(vi.mocked(getPricingQuote).mock.calls[0]?.[0].services).toEqual([
      { shopId, service: 'STANDARD' },
    ]);

    act(() => result.current.setService(shopId, 'EXPRESS'));
    await waitFor(() => expect(getPricingQuote).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve(quote(35_000)));
    await waitFor(() => expect(result.current.quote?.summary.payableTotalMinor).toBe(35_000));
    await act(async () => first.resolve(quote(22_000)));
    expect(result.current.quote?.summary.payableTotalMinor).toBe(35_000);
  });

  it('reloads the cart after a stale quote and shows an address-required state', async () => {
    vi.mocked(getPricingQuote).mockRejectedValueOnce(
      new PricingApiError('status', 409, {
        type: 'https://shopee-clone.local/problems/pricing-conflict',
        title: 'Cart changed',
        status: 409,
        detail: 'Reload.',
      }),
    );
    const { result, unmount } = renderHook(() => useCartPricing(cart, refresh));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(result.current.status).toBe('stale');
    unmount();

    vi.mocked(getShippingAddresses).mockResolvedValueOnce({ items: [] });
    const missing = renderHook(() => useCartPricing(cart, refresh));
    await waitFor(() => expect(missing.result.current.status).toBe('missing-address'));
    expect(missing.result.current.quote).toBeNull();
  });
});

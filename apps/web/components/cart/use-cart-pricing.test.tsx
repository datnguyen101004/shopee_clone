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
    pricingVersion: 'pricing-v2',
    voucherVersion: 'voucher-v1',
    shippingVersion: 'mock-v1',
    currency: 'VND',
    evaluatedAt: '2026-08-14T00:00:00.000Z',
    cartVersion: 4,
    address: { id: addressId, province: 'Hà Nội', district: 'Ba Đình' },
    shops: [],
    vouchers: [],
    exclusions: [],
    summary: {
      selectedLineCount: 0,
      selectedQuantity: 0,
      listSubtotalMinor: 0,
      productDiscountMinor: 0,
      merchandiseSubtotalMinor: 0,
      shippingTotalMinor: payable,
      shopVoucherDiscountMinor: 0,
      platformVoucherDiscountMinor: 0,
      merchandiseVoucherDiscountMinor: 0,
      shippingVoucherDiscountMinor: 0,
      voucherDiscountMinor: 0,
      shippingPayableMinor: payable,
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

  it('reloads after a stale quote and still requests merchandise pricing without an address', async () => {
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
    vi.mocked(getPricingQuote).mockResolvedValueOnce({
      ...quote(0),
      shippingVersion: null,
      address: null,
    });
    const missing = renderHook(() => useCartPricing(cart, refresh));
    await waitFor(() => expect(missing.result.current.status).toBe('missing-address'));
    await waitFor(() => expect(missing.result.current.quote).not.toBeNull());
    expect(vi.mocked(getPricingQuote).mock.calls.at(-1)?.[0]).toEqual({});
    expect(missing.result.current.quote?.shippingVersion).toBeNull();
  });

  it('applies and removes complete selections while pruning a shop no longer selected', async () => {
    vi.mocked(getPricingQuote).mockResolvedValue(quote(22_000));
    const { result, rerender } = renderHook(
      ({ currentCart }) => useCartPricing(currentCart, refresh),
      { initialProps: { currentCart: cart } },
    );
    await waitFor(() => expect(getPricingQuote).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setPlatformVoucher('PLATFORM-10');
      result.current.setShopVoucher(shopId, 'SHOP-15');
      result.current.setFreeShippingVoucher('FREESHIP-30K');
    });
    await waitFor(() => expect(getPricingQuote).toHaveBeenCalledTimes(2));
    expect(vi.mocked(getPricingQuote).mock.calls.at(-1)?.[0].vouchers).toEqual({
      platformCode: 'PLATFORM-10',
      shopCodes: [{ shopId, code: 'SHOP-15' }],
      freeShippingCode: 'FREESHIP-30K',
    });

    act(() => result.current.setPlatformVoucher(null));
    await waitFor(() => expect(getPricingQuote).toHaveBeenCalledTimes(3));
    expect(result.current.vouchers.platformCode).toBeUndefined();

    const withoutSelectedShop: CartResponse = {
      ...cart,
      groups: cart.groups.map((group) => ({ ...group, selectedEligibleLineCount: 0 })),
      summary: { ...cart.summary, selectedValidLineCount: 0, selectedValidQuantity: 0 },
    };
    rerender({ currentCart: withoutSelectedShop });
    await waitFor(() => expect(result.current.vouchers.shopCodes).toBeUndefined());
    expect(vi.mocked(getPricingQuote).mock.calls.at(-1)?.[0].vouchers).toEqual({
      freeShippingCode: 'FREESHIP-30K',
    });
  });

  it('clears a shop voucher when the quote rejects it after the invoice amount changes', async () => {
    const accepted = quote(22_000);
    const rejected = {
      ...quote(22_000),
      vouchers: [
        {
          code: 'SHOP-15',
          slot: 'SHOP' as const,
          shopId,
          status: 'REJECTED' as const,
          name: 'Giảm 15%',
          issuer: 'SHOP' as const,
          benefitType: 'PERCENTAGE' as const,
          rejectionReason: 'MINIMUM_SPEND_NOT_MET' as const,
          discountMinor: 0,
          merchandiseDiscountMinor: 0,
          shippingDiscountMinor: 0,
          allocations: [],
        },
      ],
      availableShopVouchers: [],
    };
    vi.mocked(getPricingQuote).mockResolvedValueOnce(accepted).mockResolvedValue(rejected);
    const { result } = renderHook(() => useCartPricing(cart, refresh));
    await waitFor(() => expect(getPricingQuote).toHaveBeenCalledTimes(1));
    act(() => result.current.setShopVoucher(shopId, 'SHOP-15'));
    await waitFor(() => expect(result.current.vouchers.shopCodes).toBeUndefined());
  });
});

import type { PricingQuoteResponse } from '@shopee-clone/contracts';
import { describe, expect, it, vi } from 'vitest';

import { getPricingQuote } from './pricing-api';

const addressId = '00000000-0000-4000-8000-000000000001';
const quote: PricingQuoteResponse = {
  pricingVersion: 'pricing-v2',
  voucherVersion: 'voucher-v1',
  shippingVersion: 'mock-v1',
  currency: 'VND',
  evaluatedAt: '2026-08-14T00:00:00.000Z',
  cartVersion: 2,
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
    shippingTotalMinor: 0,
    shopVoucherDiscountMinor: 0,
    platformVoucherDiscountMinor: 0,
    merchandiseVoucherDiscountMinor: 0,
    shippingVoucherDiscountMinor: 0,
    voucherDiscountMinor: 0,
    shippingPayableMinor: 0,
    payableTotalMinor: 0,
  },
};

describe('pricing API client', () => {
  it('normalizes voucher codes and sends only selections with the current cart ETag', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(quote), { status: 200 }));
    await expect(
      getPricingQuote(
        { shippingAddressId: addressId, services: [], vouchers: { platformCode: ' platform-10 ' } },
        2,
        fetcher,
      ),
    ).resolves.toEqual(quote);
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ 'If-Match': '"cart-2"' });
    expect(init.body).toBe(
      JSON.stringify({
        shippingAddressId: addressId,
        services: [],
        vouchers: { platformCode: 'PLATFORM-10' },
      }),
    );
    expect(String(init.body)).not.toContain('totalMinor');
  });

  it('rejects browser money, malformed success, and stale response versions', async () => {
    const fetcher = vi.fn();
    await expect(
      getPricingQuote({ shippingAddressId: addressId, totalMinor: 1 } as never, 2, fetcher),
    ).rejects.toMatchObject({ kind: 'input' });
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...quote, extra: true })));
    await expect(
      getPricingQuote({ shippingAddressId: addressId }, 2, fetcher),
    ).rejects.toMatchObject({ kind: 'contract' });
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...quote, cartVersion: 3 })));
    await expect(
      getPricingQuote({ shippingAddressId: addressId }, 2, fetcher),
    ).rejects.toMatchObject({ kind: 'contract' });
  });

  it('parses sanitized conflict status and preserves abort semantics', async () => {
    const conflict = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: 'https://shopee-clone.local/problems/pricing-conflict',
          title: 'Cart changed',
          status: 409,
          detail: 'Reload the cart and request another quote.',
        }),
        { status: 409 },
      ),
    );
    await expect(
      getPricingQuote({ shippingAddressId: addressId }, 2, conflict),
    ).rejects.toMatchObject({ kind: 'status', status: 409 });
    const controller = new AbortController();
    controller.abort();
    await expect(
      getPricingQuote(
        { shippingAddressId: addressId },
        2,
        vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')),
        controller.signal,
      ),
    ).rejects.toMatchObject({ kind: 'aborted' });
  });
});

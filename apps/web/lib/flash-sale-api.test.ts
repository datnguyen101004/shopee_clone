import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSellerFlashSaleSnapshot,
  fetchFlashSaleStatus,
  lookupCheckoutResult,
} from './flash-sale-api';
import { RoleApiError } from './role-api';

afterEach(() => vi.restoreAllMocks());

describe('flash-sale-api', () => {
  it('maps private seller SKU snapshots into product groups and preserves permissions', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      campaignId: 'camp-1', version: 4, items: [{
        id: 'sku-1', campaignId: 'camp-1', productId: 'product-1', variantId: 'variant-1',
        referencePriceMinor: 100000, salePriceMinor: 80000, allocatedQuantity: 2,
        remainingQuantity: 0, state: 'SOLD_OUT', stateVersion: 9, endedAt: null,
        canPurchase: false, sku: 'SKU-1', variantName: 'Blue', stockAvailable: 10,
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await fetchSellerFlashSaleSnapshot(fetcher, 'camp-1');
    expect(result.version).toBe(4);
    expect(result.groups[0]?.skus[0]).toMatchObject({ variantId: 'variant-1', canReplenish: true, canEnd: true, remainingQuantity: 0 });
  });

  it('uses the batched live status response without inventing public quota', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      contractVersion: 'flash-sale-v1', campaignId: 'camp-1', serverTime: '2026-09-07T00:00:00Z',
      startsAt: '2026-09-07T00:00:00Z', endsAt: '2026-09-08T00:00:00Z', items: [{ variantId: 'v1', state: 'ACTIVE', stateVersion: 3, salePriceMinor: 5000, canPurchase: true }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    const response = await fetchFlashSaleStatus('camp-1', ['v1']);
    expect(response.items[0]).toEqual(expect.objectContaining({ variantId: 'v1', canPurchase: true }));
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain('variantIds=v1');
  });

  it('returns NOT_FOUND for a lost response lookup and surfaces other gateway errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    await expect(lookupCheckoutResult(fetcher, 'key-1234567890123456')).resolves.toMatchObject({ status: 'NOT_FOUND' });
    fetcher.mockResolvedValue(new Response(JSON.stringify({ code: 'ADMISSION_EXPIRED' }), { status: 428, headers: { 'content-type': 'application/problem+json', 'Retry-After': '5' } }));
    await expect(lookupCheckoutResult(fetcher, 'key-1234567890123456')).rejects.toMatchObject({ status: 428 });
    expect(RoleApiError).toBeDefined();
  });
});

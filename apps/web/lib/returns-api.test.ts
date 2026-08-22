import { describe, expect, it, vi } from 'vitest';

import {
  createBuyerReturn,
  fetchAdminReturn,
  fetchBuyerReturns,
  stageReturnEvidence,
} from './returns-api';

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const now = '2026-08-21T12:00:00.000Z';
const reference = id('1');
const orderReference = id('2');

const summary = {
  returnReference: reference,
  orderReference,
  status: 'REQUESTED',
  version: 1,
  reasonCode: 'DAMAGED',
  refundAmountMinor: 50000,
  deadline: { eligibilityAt: now, sellerResponseAt: now, shipmentAt: null, receiptAt: null },
  updatedAt: now,
  availableActions: [{ action: 'CANCEL', requiresPublicReason: false }],
};

const detail = {
  returnVersion: 'returns-v1',
  return: {
    ...summary,
    currency: 'VND',
    description: 'Sản phẩm đã bị hư hỏng khi nhận hàng.',
    lines: [{
      lineReference: id('3'), productName: 'Áo thử nghiệm', variantName: 'M', productImageUrl: null,
      purchasedQuantity: 1, requestedQuantity: 1, payableMerchandiseMinor: 50000, refundMinor: 50000,
    }],
    evidence: [{ evidenceId: id('4'), mimeType: 'image/png', bytes: 68, width: 1, height: 1, url: `/api/v1/return-evidence/${id('4')}` }],
    timeline: [{ id: id('5'), version: 0, previousStatus: null, status: 'REQUESTED', actorType: 'BUYER', occurredAt: now, reasonCode: 'REQUEST_CREATED', publicReason: null }],
    shipment: null,
    refund: null,
    sellerPublicReason: null,
  },
} as const;

describe('returns API boundary', () => {
  it('sends buyer filters through the authenticated no-store fetcher', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ returnVersion: 'returns-v1', items: [summary], page: { limit: 20, nextCursor: null } }));
    const result = await fetchBuyerReturns(fetcher, { status: 'REQUESTED', deadline: 'DUE_SOON' });
    expect(result.items).toHaveLength(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain('/api/v1/account/returns?status=REQUESTED&deadline=DUE_SOON');
    expect(init).toMatchObject({ method: 'GET', cache: 'no-store' });
  });

  it('stages private evidence and creates an ETag/idempotency-protected request', async () => {
    const stagedFetcher = vi.fn().mockResolvedValue(Response.json({ evidenceId: id('4'), expiresAt: '2026-08-22T12:00:00.000Z' }));
    await expect(stageReturnEvidence(stagedFetcher, new File(['proof'], 'proof.png', { type: 'image/png' }))).resolves.toEqual({ evidenceId: id('4'), expiresAt: '2026-08-22T12:00:00.000Z' });
    expect(stagedFetcher.mock.calls[0]![1]).toMatchObject({ method: 'POST', cache: 'no-store' });

    const createFetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(detail), { headers: { 'Content-Type': 'application/json', ETag: '"return-1"' } }));
    const key = id('6');
    const result = await createBuyerReturn(createFetcher, orderReference, 4, {
      reasonCode: 'DAMAGED', description: detail.return.description,
      items: [{ lineReference: id('3'), quantity: 1 }], evidenceIds: [id('4')],
    }, key);
    expect(result.etag).toBe('"return-1"');
    const [url, init] = createFetcher.mock.calls[0]!;
    expect(String(url)).toBe(`http://localhost:3001/api/v1/account/orders/${orderReference}/returns`);
    expect(init.headers).toMatchObject({ 'If-Match': '"order-4"', 'Idempotency-Key': key });
  });

  it('uses the admin-only detail guard and retains its ETag', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...detail,
      return: { ...detail.return, buyer: { id: id('7'), displayName: 'Buyer' }, shop: { id: id('8'), name: 'Shop' }, decisions: [] },
    }), { headers: { 'Content-Type': 'application/json', ETag: '"return-1"' } }));
    const result = await fetchAdminReturn(fetcher, reference);
    expect(result.data.return.buyer.displayName).toBe('Buyer');
    expect(String(fetcher.mock.calls[0]![0])).toBe(`http://localhost:3001/api/v1/admin/returns/${reference}`);
  });
});

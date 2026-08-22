import { ReturnProjector } from './return-projector';
import type { ReturnRequestGraph } from './return-repository';

const id = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, '0')}`;

function graph(overrides: Partial<ReturnRequestGraph> = {}): ReturnRequestGraph {
  const now = new Date('2026-08-20T00:00:00.000Z');
  const base = {
    id: id('401'),
    orderId: id('402'),
    buyerId: id('403'),
    shopId: id('404'),
    status: 'ESCALATED',
    version: 2,
    reasonCode: 'DAMAGED',
    description: 'Sản phẩm bị hư hỏng khi nhận hàng',
    policyVersion: 'returns-v1',
    eligibilityDeadlineAt: now,
    sellerResponseDeadlineAt: null,
    shipmentDeadlineAt: null,
    receiptDeadlineAt: null,
    refundAmountMinor: 100_000n,
    idempotencyKey: id('405'),
    requestDigest: 'a'.repeat(64),
    createdAt: now,
    updatedAt: now,
    buyer: { id: id('403'), displayName: 'Buyer' },
    shop: { id: id('404'), name: 'Shop A' },
    order: {
      id: id('402'),
      version: 4,
      status: 'RETURN_REQUESTED',
      shopSnapshot: { id: id('404'), slug: 'shop-a', name: 'Shop A' },
      purchase: {
        id: id('406'),
        buyerId: id('403'),
        addressSnapshot: {
          recipientName: 'Buyer',
          phoneNumber: '0900000000',
          addressLine: 'secret street',
        },
      },
      timelineEvents: [],
    },
    items: [
      {
        id: id('407'),
        returnRequestId: id('401'),
        orderLineId: id('408'),
        requestedQuantity: 1,
        purchasedQuantity: 2,
        payableMinor: 200_000n,
        refundMinor: 100_000n,
        createdAt: now,
        orderLine: {
          id: id('408'),
          orderId: id('402'),
          sourceCartLineId: id('409'),
          productId: id('410'),
          variantId: id('411'),
          productName: 'Ghế',
          variantName: 'Đen',
          variantSku: 'SKU',
          productImageUrl: null,
          quantity: 2,
          unitWeightGrams: 100,
          shipmentWeightGrams: 100,
          listUnitPriceMinor: 100_000n,
          sellingUnitPriceMinor: 100_000n,
          listSubtotalMinor: 200_000n,
          productDiscountMinor: 0n,
          merchandiseSubtotalMinor: 200_000n,
          shopVoucherDiscountMinor: 0n,
          platformVoucherDiscountMinor: 0n,
          merchandiseVoucherDiscountMinor: 0n,
          payableMerchandiseMinor: 200_000n,
          createdAt: now,
        },
      },
    ],
    events: [
      {
        id: id('412'),
        returnRequestId: id('401'),
        previousStatus: null,
        status: 'REQUESTED',
        version: 0,
        actorType: 'BUYER',
        actorUserId: id('403'),
        action: 'CREATE',
        reasonCode: 'RETURN_CREATE',
        publicReason: null,
        idempotencyKey: id('405'),
        requestDigest: 'a'.repeat(64),
        occurredAt: now,
      },
      {
        id: id('413'),
        returnRequestId: id('401'),
        previousStatus: 'REQUESTED',
        status: 'ESCALATED',
        version: 1,
        actorType: 'SELLER',
        actorUserId: id('414'),
        action: 'REJECT_AND_ESCALATE',
        reasonCode: 'SELLER_REJECT',
        publicReason: 'Không đủ điều kiện đổi trả',
        idempotencyKey: id('415'),
        requestDigest: 'b'.repeat(64),
        occurredAt: now,
      },
    ],
    evidence: [
      {
        id: id('416'),
        uploaderId: id('403'),
        returnRequestId: id('401'),
        storageKey: 'opaque-secret.png',
        mimeType: 'image/png',
        byteSize: 12,
        width: 1,
        height: 1,
        state: 'ATTACHED',
        sortOrder: 0,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    shipment: null,
    decisions: [
      {
        id: id('417'),
        returnRequestId: id('401'),
        eventId: id('413'),
        actorUserId: id('418'),
        decision: 'REJECT',
        publicReason: 'Không đủ bằng chứng',
        internalNote: 'Ghi chú nội bộ nhạy cảm',
        correlationId: id('419'),
        decidedAt: now,
      },
    ],
    refundLedger: null,
    ...overrides,
  };
  return base as unknown as ReturnRequestGraph;
}

describe('ReturnProjector privacy boundaries', () => {
  const projector = new ReturnProjector();

  it('omits internal notes, storage keys, and address secrets from buyer/seller detail', () => {
    const buyer = projector.detail(graph(), 'BUYER');
    const seller = projector.detail(graph(), 'SELLER');
    for (const detail of [buyer, seller]) {
      expect(JSON.stringify(detail)).not.toMatch(/storageKey|opaque-secret|internalNote|secret street|Ghi chú nội bộ/i);
      expect(detail.return.evidence[0]?.url).toBe(`/api/v1/return-evidence/${id('416')}`);
      expect(detail.return.sellerPublicReason).toBe('Không đủ điều kiện đổi trả');
      expect(detail.return).not.toHaveProperty('decisions');
      expect(detail.return).not.toHaveProperty('buyer');
    }
  });

  it('exposes admin-only internal notes without credentials or storage keys', () => {
    const admin = projector.adminDetail(graph());
    expect(admin.return.decisions[0]?.internalNote).toBe('Ghi chú nội bộ nhạy cảm');
    expect(admin.return.buyer).toEqual({ id: id('403'), displayName: 'Buyer' });
    expect(JSON.stringify(admin)).not.toMatch(/storageKey|opaque-secret|password|email/i);
  });

  it('binds list pagination metadata and role-specific available actions', () => {
    const listed = projector.list([graph({ status: 'REQUESTED', version: 0 })], 'SELLER', 20, 'next');
    expect(listed.page).toEqual({ limit: 20, nextCursor: 'next' });
    expect(listed.items[0]?.availableActions.map((item) => item.action)).toEqual([
      'ACCEPT_RETURN',
      'REJECT_AND_ESCALATE',
      'ESCALATE',
    ]);
  });
});

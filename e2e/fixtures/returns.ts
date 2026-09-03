/** Shared mocked return payloads for Playwright journeys (accepted + dispute). */

export const returnIds = {
  buyer: '50000000-0000-4000-8000-000000000001',
  seller: '50000000-0000-4000-8000-000000000002',
  admin: '50000000-0000-4000-8000-000000000003',
  order: '50000000-0000-4000-8000-000000000004',
  returnRequest: '50000000-0000-4000-8000-000000000005',
  line: '50000000-0000-4000-8000-000000000006',
  evidence: '50000000-0000-4000-8000-000000000007',
  shop: '50000000-0000-4000-8000-000000000008',
} as const;

const deadline = {
  eligibilityAt: '2026-08-27T00:00:00.000Z',
  sellerResponseAt: '2026-08-22T00:00:00.000Z',
  shipmentAt: null as string | null,
  receiptAt: null as string | null,
};

export function returnSummary(
  status:
    | 'REQUESTED'
    | 'AWAITING_RETURN'
    | 'IN_TRANSIT'
    | 'ESCALATED'
    | 'REFUNDED'
    | 'REJECTED'
    | 'EXPIRED'
    | 'CANCELLED',
  availableActions: Array<{ action: string; requiresPublicReason: boolean }>,
  version = 0,
) {
  return {
    returnReference: returnIds.returnRequest,
    orderReference: returnIds.order,
    status,
    version,
    reasonCode: 'DAMAGED',
    refundAmountMinor: 100_000,
    deadline: {
      ...deadline,
      shipmentAt: status === 'AWAITING_RETURN' || status === 'IN_TRANSIT' ? '2026-08-25T00:00:00.000Z' : null,
      receiptAt: status === 'IN_TRANSIT' ? '2026-08-27T00:00:00.000Z' : null,
      sellerResponseAt: status === 'REQUESTED' ? deadline.sellerResponseAt : null,
    },
    updatedAt: '2026-08-20T00:00:00.000Z',
    availableActions,
  };
}

export function returnDetail(
  status: Parameters<typeof returnSummary>[0],
  availableActions: Array<{ action: string; requiresPublicReason: boolean }>,
  version = 0,
  extras: Record<string, unknown> = {},
) {
  return {
    returnVersion: 'returns-v1',
    return: {
      ...returnSummary(status, availableActions, version),
      currency: 'VND',
      description: 'Sản phẩm bị hư hỏng khi nhận hàng',
      lines: [
        {
          lineReference: returnIds.line,
          productName: 'Ghế công thái học',
          variantName: 'Đen',
          productImageUrl: null,
          purchasedQuantity: 1,
          requestedQuantity: 1,
          payableMerchandiseMinor: 100_000,
          refundMinor: 100_000,
        },
      ],
      evidence: [
        {
          evidenceId: returnIds.evidence,
          mimeType: 'image/png',
          bytes: 68,
          width: 1,
          height: 1,
          url: `/api/v1/return-evidence/${returnIds.evidence}`,
        },
      ],
      timeline: [
        {
          id: '50000000-0000-4000-8000-000000000010',
          version: 0,
          previousStatus: null,
          status: 'REQUESTED',
          actorType: 'BUYER',
          occurredAt: '2026-08-20T00:00:00.000Z',
          reasonCode: 'RETURN_CREATE',
          publicReason: null,
        },
      ],
      shipment:
        status === 'IN_TRANSIT' || status === 'REFUNDED'
          ? {
              trackingCode: 'MOCK-ABCDEF1234567890',
              submittedAt: '2026-08-21T00:00:00.000Z',
              destination: { shopName: 'Shop Space', address: 'Kho trả hàng' },
            }
          : null,
      refund:
        status === 'REFUNDED'
          ? { kind: 'MOCK_CREDIT', amountMinor: 100_000, finalizedAt: '2026-08-22T00:00:00.000Z' }
          : null,
      sellerPublicReason: null,
      ...extras,
    },
  };
}

export function adminReturnDetail(
  status: 'ESCALATED' | 'REFUNDED' | 'REJECTED' | 'AWAITING_RETURN',
  availableActions: Array<{ action: string; requiresPublicReason: boolean }>,
  version = 1,
) {
  const base = returnDetail(status, availableActions, version);
  return {
    returnVersion: 'returns-v1',
    return: {
      ...base.return,
      buyer: { id: returnIds.buyer, displayName: 'Buyer Test' },
      shop: { id: returnIds.shop, name: 'Shop Space' },
      decisions: [],
    },
  };
}

export const caseFixtures = {
  deliveredEligible: { orderStatus: 'DELIVERED', returnStatus: null },
  accepted: { returnStatus: 'AWAITING_RETURN' },
  inTransit: { returnStatus: 'IN_TRANSIT' },
  escalated: { returnStatus: 'ESCALATED' },
  rejected: { returnStatus: 'REJECTED' },
  expired: { returnStatus: 'EXPIRED' },
  refunded: { returnStatus: 'REFUNDED' },
} as const;

/** Isolated deterministic fixtures for seller analytics/promotion E2E routes. */
export const sellerAnalyticsFixture = {
  shopId: '30000000-0000-4000-8000-000000000501',
  ownerId: '30000000-0000-4000-8000-000000000502',
  zeroRange: { from: '2026-08-01', to: '2026-08-07', granularity: 'DAY' as const },
  eligibleStatuses: ['awaiting_pickup', 'shipping', 'delivered'] as const,
  excludedStatuses: ['pending_confirmation', 'cancelled', 'returned', 'refunded'] as const,
  lowStockThreshold: 10,
};

export const sellerPromotionFixture = {
  futureVoucherCode: 'FIXTURE-FUTURE',
  activeVoucherCode: 'FIXTURE-ACTIVE',
  expiredVoucherCode: 'FIXTURE-EXPIRED',
  adjacentCampaignWindows: [
    { startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-10T00:00:00.000Z' },
    { startsAt: '2026-08-10T00:00:00.000Z', endsAt: '2026-08-20T00:00:00.000Z' },
  ],
};

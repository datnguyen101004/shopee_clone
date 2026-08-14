import { describe, expect, it } from 'vitest';

import {
  ORDER_CANCELLATION_REASON_CODES,
  formatOrderVersionEtag,
  isBuyerOrderDetailResponse,
  isBuyerOrderListResponse,
  parseBuyerOrderListQuery,
  parseCancelOrderRequest,
  parseOrderIdempotencyKey,
  parseOrderVersionEtag,
  type BuyerOrderDetailResponse,
} from '../src';

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

function detail(): BuyerOrderDetailResponse {
  return {
    orderHistoryVersion: 'order-history-v1',
    currency: 'VND',
    order: {
      orderReference: id('1'),
      purchaseReference: id('2'),
      status: 'PENDING_CONFIRMATION',
      paymentStatus: 'UNPAID',
      version: 0,
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      shop: { id: id('3'), slug: 'space-t', name: 'Space T' },
      note: '',
      lines: [
        {
          lineId: id('4'),
          productId: id('5'),
          variantId: id('6'),
          quantity: 2,
          unitWeightGrams: 100,
          shipmentWeightGrams: 200,
          listUnitPriceMinor: 120_000,
          sellingUnitPriceMinor: 100_000,
          listSubtotalMinor: 240_000,
          productDiscountMinor: 40_000,
          merchandiseSubtotalMinor: 200_000,
          shopVoucherDiscountMinor: 10_000,
          platformVoucherDiscountMinor: 5_000,
          merchandiseVoucherDiscountMinor: 15_000,
          payableMerchandiseMinor: 185_000,
          productName: 'Sản phẩm',
          productImageUrl: null,
          variantName: 'Mặc định',
          variantSku: 'SKU-1',
        },
      ],
      shipping: {
        provider: 'MOCK',
        version: 'mock-v1',
        shopId: id('3'),
        originProvince: 'Hà Nội',
        destinationProvince: 'Thành phố Hồ Chí Minh',
        zone: 'CROSS_REGION',
        shipmentWeightGrams: 200,
        service: 'STANDARD',
        estimatedDaysMin: 2,
        estimatedDaysMax: 4,
        baseFeeMinor: 20_000,
        zoneSurchargeMinor: 10_000,
        weightSurchargeMinor: 0,
        shippingFeeMinor: 30_000,
      },
      listSubtotalMinor: 240_000,
      productDiscountMinor: 40_000,
      merchandiseSubtotalMinor: 200_000,
      shopVoucherDiscountMinor: 10_000,
      platformVoucherDiscountMinor: 5_000,
      merchandiseVoucherDiscountMinor: 15_000,
      shippingVoucherDiscountMinor: 5_000,
      voucherDiscountMinor: 20_000,
      shippingPayableMinor: 25_000,
      payableTotalMinor: 210_000,
      cancellation: { allowed: true, reasonCodes: [...ORDER_CANCELLATION_REASON_CODES] },
    },
    address: {
      id: id('7'),
      recipientName: 'Nguyễn Văn A',
      phoneNumber: '0900000000',
      province: 'Thành phố Hồ Chí Minh',
      district: 'Quận 1',
      ward: 'Phường Bến Nghé',
      addressLine: '1 Nguyễn Huệ',
      label: 'Nhà riêng',
    },
    vouchers: [
      {
        code: 'T20',
        name: 'Giảm giá',
        slot: 'PLATFORM',
        issuer: 'PLATFORM',
        benefitType: 'FIXED_AMOUNT',
        merchandiseDiscountMinor: 15_000,
        shippingDiscountMinor: 5_000,
        discountMinor: 20_000,
        allocations: [
          { lineId: id('4'), kind: 'MERCHANDISE', amountMinor: 15_000 },
          { lineId: null, kind: 'SHIPPING', amountMinor: 5_000 },
        ],
      },
    ],
    timeline: [
      {
        id: id('8'),
        previousStatus: null,
        status: 'PENDING_CONFIRMATION',
        orderVersion: 0,
        actorType: 'SYSTEM',
        actorUserId: null,
        reasonCode: 'ORDER_CREATED',
        reasonNote: null,
        occurredAt: '2026-08-14T00:00:00.000Z',
      },
    ],
  };
}

describe('buyer order-history contracts', () => {
  it('parses strict list queries and rejects incompatible shapes', () => {
    expect(parseBuyerOrderListQuery({})).toEqual({ filter: 'ALL', limit: 20, cursor: null });
    expect(
      parseBuyerOrderListQuery({ filter: 'SHIPPING', limit: '50', cursor: 'abc_123' }),
    ).toEqual({ filter: 'SHIPPING', limit: 50, cursor: 'abc_123' });
    expect(parseBuyerOrderListQuery({ filter: 'UNKNOWN' })).toBeNull();
    expect(parseBuyerOrderListQuery({ limit: '0' })).toBeNull();
    expect(parseBuyerOrderListQuery({ limit: '51' })).toBeNull();
    expect(parseBuyerOrderListQuery({ extra: 'value' })).toBeNull();
  });

  it('normalizes cancellation and validates concurrency headers', () => {
    expect(
      parseCancelOrderRequest({ reasonCode: 'CHANGE_ADDRESS', reasonNote: '  Đổi   địa chỉ  ' }),
    ).toEqual({ reasonCode: 'CHANGE_ADDRESS', reasonNote: 'Đổi địa chỉ' });
    expect(parseCancelOrderRequest({ reasonCode: 'OTHER' })).toBeNull();
    expect(
      parseCancelOrderRequest({ reasonCode: 'OTHER', reasonNote: 'Lý do khác', extra: 1 }),
    ).toBeNull();
    expect(formatOrderVersionEtag(7)).toBe('"order-7"');
    expect(parseOrderVersionEtag('"order-7"')).toBe(7);
    expect(parseOrderVersionEtag('order-7')).toBeNull();
    expect(parseOrderIdempotencyKey('8b63c715-a17c-4da3-8cab-3ec56cf45964')).toBeTruthy();
    expect(parseOrderIdempotencyKey('not-a-uuid')).toBeNull();
  });

  it('validates exact list/detail snapshots and timeline continuity', () => {
    const valid = detail();
    expect(isBuyerOrderDetailResponse(valid)).toBe(true);
    expect(
      isBuyerOrderListResponse({
        orderHistoryVersion: 'order-history-v1',
        items: [valid.order],
        page: { limit: 20, nextCursor: null },
      }),
    ).toBe(true);
    expect(isBuyerOrderDetailResponse({ ...valid, extra: true })).toBe(false);
    expect(
      isBuyerOrderDetailResponse({ ...valid, order: { ...valid.order, payableTotalMinor: 0 } }),
    ).toBe(false);
    expect(
      isBuyerOrderDetailResponse({
        ...valid,
        timeline: [{ ...valid.timeline[0]!, actorType: 'BUYER' }],
      }),
    ).toBe(false);
  });
});

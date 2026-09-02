import { describe, expect, it } from 'vitest';

import {
  isOnlinePaymentCheckoutResponse,
  isPaymentStatusResponse,
  isPurchaseResult,
  parseOnlinePaymentCheckoutRequest,
  parsePaymentRetryRequest,
  parseVnpayPaymentResolution,
  type OnlinePaymentCheckoutResponse,
  type PurchaseResult,
} from '../src';

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

function momoPurchase(): PurchaseResult {
  return {
    checkoutVersion: 'checkout-v1',
    pricingVersion: 'pricing-v2',
    voucherVersion: 'voucher-v1',
    shippingVersion: 'mock-v1',
    currency: 'VND',
    purchaseReference: id('1'),
    createdAt: '2026-08-28T12:00:00.000Z',
    sourceCartVersion: 1,
    paymentMethod: 'MOMO',
    paymentStatus: 'PENDING',
    address: {
      id: id('2'),
      recipientName: 'Nguyễn Văn A',
      phoneNumber: '0900000000',
      province: 'Hồ Chí Minh',
      district: 'Quận 1',
      ward: 'Bến Nghé',
      addressLine: '1 Nguyễn Huệ',
      label: null,
    },
    orders: [
      {
        orderReference: id('3'),
        status: 'PENDING_CONFIRMATION',
        paymentStatus: 'PENDING',
        shop: { id: id('4'), ownerUserId: id('5'), slug: 'shop-a', name: 'Shop A' },
        note: '',
        lines: [
          {
            lineId: id('6'),
            productId: id('7'),
            variantId: id('8'),
            quantity: 1,
            unitWeightGrams: 100,
            shipmentWeightGrams: 100,
            listUnitPriceMinor: 10_000,
            sellingUnitPriceMinor: 10_000,
            listSubtotalMinor: 10_000,
            productDiscountMinor: 0,
            merchandiseSubtotalMinor: 10_000,
            shopVoucherDiscountMinor: 0,
            platformVoucherDiscountMinor: 0,
            merchandiseVoucherDiscountMinor: 0,
            payableMerchandiseMinor: 10_000,
            productName: 'Sản phẩm',
            productImageUrl: null,
            variantName: 'Mặc định',
            variantSku: 'SKU-1',
          },
        ],
        shipping: {
          provider: 'MOCK',
          version: 'mock-v1',
          shopId: id('4'),
          originProvince: 'Hồ Chí Minh',
          destinationProvince: 'Hồ Chí Minh',
          zone: 'SAME_PROVINCE',
          shipmentWeightGrams: 100,
          service: 'STANDARD',
          estimatedDaysMin: 2,
          estimatedDaysMax: 4,
          baseFeeMinor: 22_000,
          zoneSurchargeMinor: 0,
          weightSurchargeMinor: 0,
          shippingFeeMinor: 22_000,
        },
        listSubtotalMinor: 10_000,
        productDiscountMinor: 0,
        merchandiseSubtotalMinor: 10_000,
        shopVoucherDiscountMinor: 0,
        platformVoucherDiscountMinor: 0,
        merchandiseVoucherDiscountMinor: 0,
        shippingVoucherDiscountMinor: 0,
        voucherDiscountMinor: 0,
        shippingPayableMinor: 22_000,
        payableTotalMinor: 32_000,
      },
    ],
    vouchers: [],
    summary: {
      selectedLineCount: 1,
      selectedQuantity: 1,
      listSubtotalMinor: 10_000,
      productDiscountMinor: 0,
      merchandiseSubtotalMinor: 10_000,
      shippingTotalMinor: 22_000,
      shopVoucherDiscountMinor: 0,
      platformVoucherDiscountMinor: 0,
      merchandiseVoucherDiscountMinor: 0,
      shippingVoucherDiscountMinor: 0,
      voucherDiscountMinor: 0,
      shippingPayableMinor: 22_000,
      payableTotalMinor: 32_000,
    },
  };
}

describe('payment contracts', () => {
  it('parses an online checkout request without accepting browser money', () => {
    const request = {
      provider: 'MOMO',
      shippingAddressId: id('2'),
      services: [{ shopId: id('4'), service: 'STANDARD' }],
      checkoutFingerprint: 'a'.repeat(64),
    };
    expect(parseOnlinePaymentCheckoutRequest(request)).toEqual(request);
    expect(parseOnlinePaymentCheckoutRequest({ ...request, amountMinor: 1 })).toBeNull();
    expect(parseOnlinePaymentCheckoutRequest({ ...request, provider: 'OTHER' })).toBeNull();
  });

  it('strictly parses retry and callback-resolution payloads', () => {
    expect(parsePaymentRetryRequest({ provider: 'VNPAY' })).toEqual({ provider: 'VNPAY' });
    expect(parsePaymentRetryRequest({ provider: 'VNPAY', extra: true })).toBeNull();
    expect(
      parseVnpayPaymentResolution({ paymentReference: id('9'), purchaseReference: id('1') }),
    ).toEqual({ paymentReference: id('9'), purchaseReference: id('1') });
    expect(parseVnpayPaymentResolution({ paymentReference: 'not-a-uuid' })).toBeNull();
  });

  it('validates safe payment instructions and state-specific next actions', () => {
    const pending = {
      paymentReference: id('9'),
      purchaseReference: id('1'),
      provider: 'MOMO',
      paymentMethod: 'MOMO',
      status: 'PENDING',
      amountMinor: 10_000,
      currency: 'VND',
      expiresAt: '2026-08-28T12:10:00.000Z',
      nextAction: 'OPEN_MOMO',
      instructions: {
        payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?t=opaque',
        deeplink: 'momo://app?action=pay',
        qrCodeValue: '000201010212',
      },
    };
    expect(isPaymentStatusResponse(pending)).toBe(true);
    expect(isPaymentStatusResponse({ ...pending, nextAction: 'DONE' })).toBe(false);
    expect(
      isPaymentStatusResponse({
        ...pending,
        instructions: { ...pending.instructions, payUrl: 'javascript:alert(1)' },
      }),
    ).toBe(false);
  });

  it('binds payment status, purchase reference, and server total', () => {
    const purchase = momoPurchase();
    const response: OnlinePaymentCheckoutResponse = {
      replayed: false,
      purchase,
      payment: {
        paymentReference: id('9'),
        purchaseReference: purchase.purchaseReference,
        provider: 'MOMO',
        paymentMethod: 'MOMO',
        status: 'PENDING',
        amountMinor: purchase.summary.payableTotalMinor,
        currency: 'VND',
        expiresAt: '2026-08-28T12:10:00.000Z',
        nextAction: 'WAIT',
        instructions: null,
      },
    };
    expect(isPurchaseResult(purchase)).toBe(true);
    expect(isPaymentStatusResponse(response.payment)).toBe(true);
    expect(isOnlinePaymentCheckoutResponse(response)).toBe(true);
    expect(
      isOnlinePaymentCheckoutResponse({
        ...response,
        payment: { ...response.payment, amountMinor: 1 },
      }),
    ).toBe(false);
  });

  it('accepts granular child order states for a multi-shop Purchase', () => {
    const child = id('10');
    const response = {
      paymentReference: id('11'),
      purchaseReference: id('12'),
      provider: 'VNPAY' as const,
      paymentMethod: 'VNPAY' as const,
      status: 'PENDING' as const,
      amountMinor: 5_000,
      currency: 'VND' as const,
      expiresAt: '2026-08-28T12:10:00.000Z',
      nextAction: 'WAIT' as const,
      instructions: null,
      orderStatus: null,
      orderStatuses: [
        {
          orderReference: child,
          status: 'PENDING_PAYMENT' as const,
          paymentStatus: 'PENDING' as const,
        },
      ],
      retryable: false,
      navigation: { kind: 'ORDER' as const, orderReference: id('12') },
    };
    expect(isPaymentStatusResponse(response)).toBe(true);
    expect(
      isPaymentStatusResponse({
        ...response,
        orderStatuses: [{ ...response.orderStatuses[0]!, orderReference: 'not-a-uuid' }],
      }),
    ).toBe(false);
  });
});

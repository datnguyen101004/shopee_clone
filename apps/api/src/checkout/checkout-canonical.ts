import { createHash, timingSafeEqual } from 'node:crypto';

import {
  CHECKOUT_FINGERPRINT_VERSION,
  type CheckoutConfirmationRequest,
  type CheckoutPreviewResponse,
} from '@shopee-clone/contracts';

function sha256(value: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(value)).digest();
}

export function checkoutFingerprint(preview: CheckoutPreviewResponse): string {
  const shops = preview.shops.map((shop) => ({
    ...shop,
    lines: shop.lines.map((line) => {
      if (!line.campaignPrice) return line;
      // campaignPrice.evaluatedAt is an observation timestamp, not a checkout
      // fact. Repricing is still detected through the material price/campaign
      // fields, while a confirm immediately after preview remains valid.
      const { evaluatedAt: _evaluatedAt, ...campaignPrice } = line.campaignPrice;
      return { ...line, campaignPrice };
    }),
  }));
  return sha256({
    version: CHECKOUT_FINGERPRINT_VERSION,
    pricingVersion: preview.pricingVersion,
    voucherVersion: preview.voucherVersion,
    shippingVersion: preview.shippingVersion,
    currency: preview.currency,
    cartVersion: preview.cartVersion,
    address: preview.address,
    shops,
    vouchers: preview.vouchers,
    summary: preview.summary,
  }).toString('hex');
}

export function confirmationRequestDigest(
  userId: string,
  expectedVersion: number,
  request: CheckoutConfirmationRequest,
): string {
  return sha256({
    userId,
    expectedVersion,
    shippingAddressId: request.shippingAddressId,
    services: [...request.services].sort((left, right) => left.shopId.localeCompare(right.shopId)),
    vouchers: request.vouchers
      ? {
          ...(request.vouchers.platformCode ? { platformCode: request.vouchers.platformCode } : {}),
          shopCodes: [...(request.vouchers.shopCodes ?? [])].sort((left, right) =>
            left.shopId.localeCompare(right.shopId),
          ),
          ...(request.vouchers.freeShippingCode
            ? { freeShippingCode: request.vouchers.freeShippingCode }
            : {}),
        }
      : null,
    notes: [...(request.notes ?? [])].sort((left, right) =>
      left.shopId.localeCompare(right.shopId),
    ),
    checkoutFingerprint: request.checkoutFingerprint,
  }).toString('hex');
}

export function advisoryLockKeys(userId: string, idempotencyKey: string): [number, number] {
  const digest = sha256({ userId, idempotencyKey });
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

export function fingerprintsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

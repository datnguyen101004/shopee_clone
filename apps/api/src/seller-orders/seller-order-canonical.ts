import { createHash, timingSafeEqual } from 'node:crypto';

import type { SellerOrderActionRequest } from '@shopee-clone/contracts';

export function sellerOrderActionDigest(
  orderId: string,
  expectedOrderVersion: number,
  expectedFulfillmentVersion: number,
  input: SellerOrderActionRequest,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ orderId, expectedOrderVersion, expectedFulfillmentVersion, ...input }))
    .digest('hex');
}

export function sellerOrderDigestsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && a.length === 32 && timingSafeEqual(a, b);
}

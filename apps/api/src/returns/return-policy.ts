import {
  RETURN_ELIGIBILITY_WINDOW_MS,
  RETURN_RECEIPT_WINDOW_MS,
  RETURN_SELLER_RESPONSE_WINDOW_MS,
  RETURN_SHIPMENT_WINDOW_MS,
} from '@shopee-clone/contracts';

export const RETURN_POLICY_VERSION = 'returns-v1' as const;

export interface ReturnPolicyDeadlines {
  eligibilityAt: Date;
  sellerResponseAt: Date | null;
  shipmentAt: Date | null;
  receiptAt: Date | null;
}

const add = (at: Date, duration: number): Date => new Date(at.getTime() + duration);

/** A command is valid on the exact deadline instant and late afterwards. */
export const isPastDeadline = (now: Date, deadline: Date): boolean =>
  now.getTime() > deadline.getTime();

export function returnEligibilityDeadline(deliveredAt: Date): Date {
  return add(deliveredAt, RETURN_ELIGIBILITY_WINDOW_MS);
}

export function sellerResponseDeadline(requestedAt: Date): Date {
  return add(requestedAt, RETURN_SELLER_RESPONSE_WINDOW_MS);
}

export function shipmentDeadline(acceptedAt: Date): Date {
  return add(acceptedAt, RETURN_SHIPMENT_WINDOW_MS);
}

export function receiptDeadline(submittedAt: Date): Date {
  return add(submittedAt, RETURN_RECEIPT_WINDOW_MS);
}

export function initialReturnDeadlines(
  deliveredAt: Date,
  requestedAt: Date,
): ReturnPolicyDeadlines {
  return {
    eligibilityAt: returnEligibilityDeadline(deliveredAt),
    sellerResponseAt: sellerResponseDeadline(requestedAt),
    shipmentAt: null,
    receiptAt: null,
  };
}

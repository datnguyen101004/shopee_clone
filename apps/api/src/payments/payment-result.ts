import type { PurchasePaymentStatus } from '@shopee-clone/contracts';

export const PAYMENT_RESULT_CLASSES = [
  'SUCCESS',
  'PENDING',
  'DENIED',
  'CANCELLED',
  'EXPIRED',
  'FAILURE',
  'UNKNOWN',
] as const;

export type PaymentResultClass = (typeof PAYMENT_RESULT_CLASSES)[number];
export type PaymentResultDecision =
  'TERMINAL_SUCCESS' | 'TERMINAL_FAILURE' | 'PENDING' | 'UNKNOWN' | 'MISMATCH';

export interface ClassifiedPaymentResult {
  resultClass: PaymentResultClass;
  decision: PaymentResultDecision;
  targetStatus: PurchasePaymentStatus | null;
  terminal: boolean;
  retryable: boolean;
}

const classifications: Readonly<Record<PaymentResultClass, ClassifiedPaymentResult>> = {
  SUCCESS: {
    resultClass: 'SUCCESS',
    decision: 'TERMINAL_SUCCESS',
    targetStatus: 'PAID',
    terminal: true,
    retryable: false,
  },
  PENDING: {
    resultClass: 'PENDING',
    decision: 'PENDING',
    targetStatus: 'PENDING',
    terminal: false,
    retryable: true,
  },
  DENIED: {
    resultClass: 'DENIED',
    decision: 'TERMINAL_FAILURE',
    targetStatus: 'FAILED',
    terminal: true,
    retryable: false,
  },
  CANCELLED: {
    resultClass: 'CANCELLED',
    decision: 'TERMINAL_FAILURE',
    targetStatus: 'CANCELLED',
    terminal: true,
    retryable: false,
  },
  EXPIRED: {
    resultClass: 'EXPIRED',
    decision: 'TERMINAL_FAILURE',
    targetStatus: 'EXPIRED',
    terminal: true,
    retryable: false,
  },
  FAILURE: {
    resultClass: 'FAILURE',
    decision: 'TERMINAL_FAILURE',
    targetStatus: 'FAILED',
    terminal: true,
    retryable: false,
  },
  UNKNOWN: {
    resultClass: 'UNKNOWN',
    decision: 'UNKNOWN',
    targetStatus: 'UNKNOWN',
    terminal: false,
    retryable: true,
  },
};

export function classifyPaymentResult(
  resultClass: PaymentResultClass,
  correlationMatches = true,
): ClassifiedPaymentResult {
  if (!correlationMatches) {
    return {
      resultClass,
      decision: 'MISMATCH',
      targetStatus: null,
      terminal: false,
      retryable: false,
    };
  }
  return classifications[resultClass];
}

export type PaymentProviderErrorCode =
  | 'PROVIDER_TEMPORARY'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_MISMATCH'
  | 'PROVIDER_REJECTED'
  | 'PROVIDER_MALFORMED_RESPONSE';

export abstract class PaymentProviderError extends Error {
  abstract readonly code: PaymentProviderErrorCode;
  abstract readonly retryable: boolean;
  abstract readonly outcomeUnknown: boolean;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ProviderTemporaryError extends PaymentProviderError {
  readonly code = 'PROVIDER_TEMPORARY';
  readonly retryable = true;
  readonly outcomeUnknown = false;
}

export class ProviderTimeoutError extends PaymentProviderError {
  readonly code = 'PROVIDER_TIMEOUT';
  readonly retryable = true;
  readonly outcomeUnknown = true;
}

export class ProviderMismatchError extends PaymentProviderError {
  readonly code = 'PROVIDER_MISMATCH';
  readonly retryable = false;
  readonly outcomeUnknown = true;
}

export class ProviderRejectedError extends PaymentProviderError {
  readonly code = 'PROVIDER_REJECTED';
  readonly retryable = false;
  readonly outcomeUnknown = false;
}

export class ProviderMalformedResponseError extends PaymentProviderError {
  readonly code = 'PROVIDER_MALFORMED_RESPONSE';
  readonly retryable = true;
  readonly outcomeUnknown = true;
}

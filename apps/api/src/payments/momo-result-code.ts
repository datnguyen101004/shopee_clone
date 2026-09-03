import type { PaymentResultClass } from './payment-result';

export type MomoOperation = 'CREATE' | 'PAYMENT_OBSERVATION' | 'REFUND';

export interface MomoResultCodeClassification {
  resultClass: PaymentResultClass;
  final: boolean;
  recognized: boolean;
}

export interface MomoUnknownResultCodeObserver {
  recordUnknownResultCode(operation: MomoOperation, resultCode: number): void;
}

export class MomoResultCodeMetrics implements MomoUnknownResultCodeObserver {
  private readonly unknownResultCodes = new Map<string, number>();

  recordUnknownResultCode(operation: MomoOperation, resultCode: number): void {
    const key = `${operation}:${resultCode}`;
    this.unknownResultCodes.set(key, (this.unknownResultCodes.get(key) ?? 0) + 1);
  }

  snapshot(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.unknownResultCodes);
  }
}

const pendingCodes = new Set([1000, 7000, 7002]);
const nonFinalUnknownCodes = new Set([10, 11, 12, 13, 20, 21, 22, 40, 41, 42, 43, 45, 47]);
const failureCodes = new Set([
  98, 99, 1001, 1002, 1003, 1004, 1007, 1026, 1080, 1081, 1088, 2019, 4001, 4002, 4100,
]);

export function classifyMomoResultCode(
  resultCode: number,
  operation: MomoOperation,
  observer?: MomoUnknownResultCodeObserver,
): MomoResultCodeClassification {
  if (!Number.isSafeInteger(resultCode)) {
    observer?.recordUnknownResultCode(operation, resultCode);
    return { resultClass: 'UNKNOWN', final: false, recognized: false };
  }
  if (resultCode === 0) {
    return operation === 'CREATE'
      ? { resultClass: 'PENDING', final: false, recognized: true }
      : { resultClass: 'SUCCESS', final: true, recognized: true };
  }
  if (resultCode === 9000) {
    return operation === 'PAYMENT_OBSERVATION'
      ? { resultClass: 'SUCCESS', final: true, recognized: true }
      : { resultClass: 'PENDING', final: false, recognized: true };
  }
  if (pendingCodes.has(resultCode)) {
    return { resultClass: 'PENDING', final: false, recognized: true };
  }
  if (resultCode === 1005) {
    return { resultClass: 'EXPIRED', final: true, recognized: true };
  }
  if (resultCode === 1006) {
    return { resultClass: 'DENIED', final: true, recognized: true };
  }
  if (resultCode === 1017) {
    return { resultClass: 'CANCELLED', final: true, recognized: true };
  }
  if (failureCodes.has(resultCode)) {
    return { resultClass: 'FAILURE', final: true, recognized: true };
  }
  if (nonFinalUnknownCodes.has(resultCode)) {
    return { resultClass: 'UNKNOWN', final: false, recognized: true };
  }
  observer?.recordUnknownResultCode(operation, resultCode);
  return { resultClass: 'UNKNOWN', final: false, recognized: false };
}

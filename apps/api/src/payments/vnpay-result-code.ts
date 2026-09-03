import type { PaymentResultClass } from './payment-result';

export type VnpayOperation = 'CREATE' | 'OBSERVATION';

export class VnpayResultCodeMetrics {
  private readonly unknownResultCodes = new Map<string, number>();

  recordUnknownResultCode(operation: VnpayOperation, resultCode: number): void {
    const key = `${operation}:${resultCode}`;
    this.unknownResultCodes.set(key, (this.unknownResultCodes.get(key) ?? 0) + 1);
  }

  snapshot(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.unknownResultCodes);
  }
}

export function classifyVnpayResultCode(
  resultCode: number,
  operation: VnpayOperation,
  observer?: VnpayResultCodeMetrics,
): {
  resultClass: PaymentResultClass;
  final: boolean;
} {
  if (resultCode === 0) {
    return operation === 'CREATE'
      ? { resultClass: 'PENDING', final: false }
      : { resultClass: 'SUCCESS', final: true };
  }
  if (resultCode === 24) return { resultClass: 'CANCELLED', final: true };
  if (resultCode === 11) return { resultClass: 'EXPIRED', final: true };
  if (Number.isSafeInteger(resultCode) && resultCode >= 1 && resultCode <= 99) {
    return { resultClass: 'FAILURE', final: true };
  }
  observer?.recordUnknownResultCode(operation, resultCode);
  return { resultClass: 'UNKNOWN', final: false };
}

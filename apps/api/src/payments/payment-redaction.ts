import type { PaymentProviderError } from './payment-result';

export interface PaymentTelemetry {
  operation?: string;
  provider?: string;
  environment?: string;
  paymentReference?: string;
  orderId?: string;
  requestId?: string;
  resultCode?: number;
  resultClass?: string;
  status?: string;
  durationMs?: number;
  duplicate?: boolean;
  signatureValid?: boolean;
  hasPayUrl: boolean;
  hasDeeplink: boolean;
  hasQrCode: boolean;
}

function optionalSafeString(value: unknown, maximumLength: number): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength)
    return undefined;
  if (
    [...value].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    return undefined;
  }
  return value;
}

function optionalSafeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

/**
 * Produces telemetry from an allowlist. Unknown input keys are deliberately
 * dropped instead of recursively copying provider or customer data.
 */
export function sanitizePaymentTelemetry(
  input: Readonly<Record<string, unknown>>,
): PaymentTelemetry {
  const telemetry: PaymentTelemetry = {
    hasPayUrl: typeof input.payUrl === 'string' && input.payUrl.length > 0,
    hasDeeplink: typeof input.deeplink === 'string' && input.deeplink.length > 0,
    hasQrCode: typeof input.qrCodeUrl === 'string' && input.qrCodeUrl.length > 0,
  };
  const strings = [
    ['operation', 32],
    ['provider', 16],
    ['environment', 16],
    ['paymentReference', 64],
    ['orderId', 64],
    ['requestId', 50],
    ['resultClass', 32],
    ['status', 32],
  ] as const;
  for (const [key, maximumLength] of strings) {
    const value = optionalSafeString(input[key], maximumLength);
    if (value !== undefined) telemetry[key] = value;
  }
  for (const key of ['resultCode', 'durationMs'] as const) {
    const value = optionalSafeNumber(input[key]);
    if (value !== undefined) telemetry[key] = value;
  }
  for (const key of ['duplicate', 'signatureValid'] as const) {
    if (typeof input[key] === 'boolean') telemetry[key] = input[key];
  }
  return telemetry;
}

export interface SafePaymentErrorTelemetry {
  code: string;
  retryable: boolean;
  outcomeUnknown: boolean;
}

export function sanitizePaymentProviderError(
  error: PaymentProviderError,
): SafePaymentErrorTelemetry {
  return {
    code: error.code,
    retryable: error.retryable,
    outcomeUnknown: error.outcomeUnknown,
  };
}

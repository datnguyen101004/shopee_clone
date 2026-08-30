import {
  parseCheckoutConfirmationRequest,
  isPurchaseResult,
  PURCHASE_PAYMENT_STATUSES,
  type CheckoutConfirmationRequest,
  type PurchasePaymentStatus,
  type PurchaseResult,
} from './checkout';

export const PAYMENT_PROVIDERS = ['MOMO'] as const;
export const PAYMENT_NEXT_ACTIONS = [
  'OPEN_MOMO',
  'WAIT',
  'DONE',
  'CHECKOUT_AGAIN',
  'CONTACT_SUPPORT',
] as const;

export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
export type PaymentNextAction = (typeof PAYMENT_NEXT_ACTIONS)[number];

export interface PaymentInstructions {
  payUrl: string | null;
  deeplink: string | null;
  qrCodeValue: string | null;
}

export interface PaymentStatusResponse {
  paymentReference: string;
  purchaseReference: string;
  provider: PaymentProvider;
  paymentMethod: 'MOMO';
  status: PurchasePaymentStatus;
  amountMinor: number;
  currency: 'VND';
  expiresAt: string | null;
  nextAction: PaymentNextAction;
  instructions: PaymentInstructions | null;
}

export interface OnlinePaymentCheckoutRequest extends CheckoutConfirmationRequest {
  provider: 'MOMO';
}

export interface OnlinePaymentCheckoutResponse {
  replayed: boolean;
  purchase: PurchaseResult;
  payment: PaymentStatusResponse;
}

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const paymentStatuses = new Set<string>(PURCHASE_PAYMENT_STATUSES);
const nextActions = new Set<string>(PAYMENT_NEXT_ACTIONS);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasExactKeys(value: Record<string, unknown>, required: string[]): boolean {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key))
  );
}

function isCanonicalDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isSafeNavigationUrl(value: unknown, protocol: 'https:' | 'momo:'): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096) return false;
  const prefix = protocol === 'https:' ? 'https://' : 'momo://';
  return (
    value.startsWith(prefix) &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint <= 32 || codePoint === 127;
    })
  );
}

export function isPaymentInstructions(value: unknown): value is PaymentInstructions {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['payUrl', 'deeplink', 'qrCodeValue']) ||
    !(value.payUrl === null || isSafeNavigationUrl(value.payUrl, 'https:')) ||
    !(value.deeplink === null || isSafeNavigationUrl(value.deeplink, 'momo:')) ||
    !(
      value.qrCodeValue === null ||
      (typeof value.qrCodeValue === 'string' &&
        value.qrCodeValue.length > 0 &&
        value.qrCodeValue.length <= 4_096)
    )
  ) {
    return false;
  }
  return value.payUrl !== null || value.deeplink !== null || value.qrCodeValue !== null;
}

function actionMatchesStatus(
  status: PurchasePaymentStatus,
  action: PaymentNextAction,
  instructions: PaymentInstructions | null,
): boolean {
  if (status === 'PENDING') {
    return action === (instructions === null ? 'WAIT' : 'OPEN_MOMO');
  }
  if (status === 'PENDING_RECONCILIATION' || status === 'UNKNOWN' || status === 'REFUND_PENDING') {
    return action === 'WAIT' && instructions === null;
  }
  if (status === 'PAID' || status === 'REFUNDED') {
    return action === 'DONE' && instructions === null;
  }
  if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') {
    return action === 'CHECKOUT_AGAIN' && instructions === null;
  }
  if (status === 'PARTIALLY_REFUNDED') {
    return action === 'CONTACT_SUPPORT' && instructions === null;
  }
  return false;
}

export function isPaymentStatusResponse(value: unknown): value is PaymentStatusResponse {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'paymentReference',
      'purchaseReference',
      'provider',
      'paymentMethod',
      'status',
      'amountMinor',
      'currency',
      'expiresAt',
      'nextAction',
      'instructions',
    ]) ||
    typeof value.paymentReference !== 'string' ||
    !canonicalUuid.test(value.paymentReference) ||
    typeof value.purchaseReference !== 'string' ||
    !canonicalUuid.test(value.purchaseReference) ||
    value.provider !== 'MOMO' ||
    value.paymentMethod !== 'MOMO' ||
    typeof value.status !== 'string' ||
    !paymentStatuses.has(value.status) ||
    value.status === 'UNPAID' ||
    typeof value.amountMinor !== 'number' ||
    !Number.isSafeInteger(value.amountMinor) ||
    value.amountMinor < 0 ||
    value.currency !== 'VND' ||
    !(value.expiresAt === null || isCanonicalDateTime(value.expiresAt)) ||
    typeof value.nextAction !== 'string' ||
    !nextActions.has(value.nextAction) ||
    !(value.instructions === null || isPaymentInstructions(value.instructions))
  ) {
    return false;
  }

  const payment = value as unknown as PaymentStatusResponse;
  return actionMatchesStatus(payment.status, payment.nextAction, payment.instructions);
}

export function parsePaymentStatusResponse(value: unknown): PaymentStatusResponse | null {
  return isPaymentStatusResponse(value) ? value : null;
}

export function parseOnlinePaymentCheckoutRequest(
  value: unknown,
): OnlinePaymentCheckoutRequest | null {
  if (!isRecord(value) || value.provider !== 'MOMO') return null;
  const checkout: Record<string, unknown> = { ...value };
  delete checkout.provider;
  const parsed = parseCheckoutConfirmationRequest(checkout);
  return parsed ? { ...parsed, provider: 'MOMO' } : null;
}

export function isOnlinePaymentCheckoutResponse(
  value: unknown,
): value is OnlinePaymentCheckoutResponse {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['replayed', 'purchase', 'payment']) ||
    typeof value.replayed !== 'boolean' ||
    !isPurchaseResult(value.purchase) ||
    !isPaymentStatusResponse(value.payment)
  ) {
    return false;
  }

  const response = value as unknown as OnlinePaymentCheckoutResponse;
  return (
    response.purchase.paymentMethod === 'MOMO' &&
    response.purchase.paymentStatus === response.payment.status &&
    response.purchase.purchaseReference === response.payment.purchaseReference &&
    response.purchase.summary.payableTotalMinor === response.payment.amountMinor
  );
}

export function parseOnlinePaymentCheckoutResponse(
  value: unknown,
): OnlinePaymentCheckoutResponse | null {
  return isOnlinePaymentCheckoutResponse(value) ? value : null;
}

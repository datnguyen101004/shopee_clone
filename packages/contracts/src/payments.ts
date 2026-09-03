import {
  parseCheckoutConfirmationRequest,
  isPurchaseResult,
  PURCHASE_PAYMENT_STATUSES,
  SHOP_ORDER_STATUSES,
  type CheckoutConfirmationRequest,
  type PurchasePaymentStatus,
  type PurchaseResult,
  type ShopOrderStatus,
} from './checkout';

export const PAYMENT_PROVIDERS = ['MOMO', 'VNPAY'] as const;
export const PAYMENT_NEXT_ACTIONS = [
  'OPEN_MOMO',
  'OPEN_VNPAY',
  'WAIT',
  'DONE',
  'CHECKOUT_AGAIN',
  'CONTACT_SUPPORT',
] as const;

export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
export type PaymentNextAction = (typeof PAYMENT_NEXT_ACTIONS)[number];

export const PAYMENT_REFERENCE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const VNPAY_TRANSACTION_REFERENCE_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

export interface PaymentRetryRequest {
  provider: PaymentProvider;
}

export interface VnpayPaymentResolution {
  paymentReference: string;
  purchaseReference: string;
}

export interface PaymentInstructions {
  payUrl: string | null;
  deeplink: string | null;
  qrCodeValue: string | null;
}

export interface PaymentOrderStatus {
  orderReference: string;
  status: ShopOrderStatus;
  paymentStatus: PurchasePaymentStatus;
}

export interface PaymentStatusResponse {
  paymentReference: string;
  purchaseReference: string;
  provider: PaymentProvider;
  paymentMethod: 'MOMO' | 'VNPAY';
  status: PurchasePaymentStatus;
  amountMinor: number;
  currency: 'VND';
  expiresAt: string | null;
  nextAction: PaymentNextAction;
  instructions: PaymentInstructions | null;
  /** Canonical shop-order status; null when one payment covers multiple shops. */
  orderStatus?: ShopOrderStatus | null;
  /** ShopOrder states associated with the payment's parent Purchase. */
  orderStatuses?: PaymentOrderStatus[];
  /** Terminal VNPAY purchases are not retryable on the same aggregate. */
  retryable?: boolean;
  /** Safe buyer navigation target after a terminal result. For multi-shop payments, use ORDERS. */
  navigation?: { kind: 'ORDER' | 'ORDERS'; orderReference: string | null } | null;
}

export interface OnlinePaymentCheckoutRequest extends CheckoutConfirmationRequest {
  provider: PaymentProvider;
}

export interface OnlinePaymentCheckoutResponse {
  replayed: boolean;
  purchase: PurchaseResult;
  payment: PaymentStatusResponse;
}

const canonicalUuid = PAYMENT_REFERENCE_PATTERN;
const VNPAY_SANDBOX_PAY_URL_PREFIX = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?';
const paymentStatuses = new Set<string>(PURCHASE_PAYMENT_STATUSES);
const SHOP_ORDER_STATUS_SET = new Set<string>(SHOP_ORDER_STATUSES);
const nextActions = new Set<string>(PAYMENT_NEXT_ACTIONS);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasExactKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
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
  provider: PaymentProvider,
): boolean {
  if (status === 'PENDING') {
    return (
      action ===
      (instructions === null ? 'WAIT' : provider === 'VNPAY' ? 'OPEN_VNPAY' : 'OPEN_MOMO')
    );
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
    !hasExactKeys(
      value,
      [
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
      ],
      ['orderStatus', 'orderStatuses', 'retryable', 'navigation'],
    ) ||
    typeof value.paymentReference !== 'string' ||
    !canonicalUuid.test(value.paymentReference) ||
    typeof value.purchaseReference !== 'string' ||
    !canonicalUuid.test(value.purchaseReference) ||
    (value.provider !== 'MOMO' && value.provider !== 'VNPAY') ||
    !(
      (value.provider === 'MOMO' && value.paymentMethod === 'MOMO') ||
      (value.provider === 'VNPAY' && value.paymentMethod === 'VNPAY')
    ) ||
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

  if (
    value.orderStatus !== undefined &&
    value.orderStatus !== null &&
    (typeof value.orderStatus !== 'string' || !SHOP_ORDER_STATUS_SET.has(value.orderStatus))
  ) {
    return false;
  }
  if (value.orderStatuses !== undefined) {
    if (
      !Array.isArray(value.orderStatuses) ||
      value.orderStatuses.length === 0 ||
      !value.orderStatuses.every(
        (item) =>
          isRecord(item) &&
          hasExactKeys(item, ['orderReference', 'status', 'paymentStatus']) &&
          typeof item.orderReference === 'string' &&
          canonicalUuid.test(item.orderReference) &&
          typeof item.status === 'string' &&
          SHOP_ORDER_STATUS_SET.has(item.status) &&
          typeof item.paymentStatus === 'string' &&
          paymentStatuses.has(item.paymentStatus),
      )
    ) {
      return false;
    }
    if (
      new Set(value.orderStatuses.map((item) => item.orderReference)).size !==
      value.orderStatuses.length
    ) {
      return false;
    }
  }
  if (value.retryable !== undefined && typeof value.retryable !== 'boolean') return false;
  if (value.navigation !== undefined && value.navigation !== null) {
    if (
      !isRecord(value.navigation) ||
      !hasExactKeys(value.navigation, ['kind', 'orderReference']) ||
      (value.navigation.kind !== 'ORDER' && value.navigation.kind !== 'ORDERS') ||
      !(
        value.navigation.orderReference === null ||
        (typeof value.navigation.orderReference === 'string' &&
          canonicalUuid.test(value.navigation.orderReference))
      )
    ) {
      return false;
    }
  }

  const payment = value as unknown as PaymentStatusResponse;
  if (
    payment.provider === 'VNPAY' &&
    payment.instructions?.payUrl !== null &&
    payment.instructions?.payUrl !== undefined &&
    !payment.instructions.payUrl.startsWith(VNPAY_SANDBOX_PAY_URL_PREFIX)
  ) {
    return false;
  }
  return actionMatchesStatus(
    payment.status,
    payment.nextAction,
    payment.instructions,
    payment.provider,
  );
}

export function parsePaymentStatusResponse(value: unknown): PaymentStatusResponse | null {
  return isPaymentStatusResponse(value) ? value : null;
}

export function parseOnlinePaymentCheckoutRequest(
  value: unknown,
): OnlinePaymentCheckoutRequest | null {
  if (!isRecord(value) || (value.provider !== 'MOMO' && value.provider !== 'VNPAY')) return null;
  const checkout: Record<string, unknown> = { ...value };
  delete checkout.provider;
  const parsed = parseCheckoutConfirmationRequest(checkout);
  return parsed ? { ...parsed, provider: value.provider } : null;
}

export function parsePaymentRetryRequest(value: unknown): PaymentRetryRequest | null {
  if (!isRecord(value) || !hasExactKeys(value, ['provider'])) return null;
  return value.provider === 'MOMO' || value.provider === 'VNPAY'
    ? { provider: value.provider }
    : null;
}

export function isVnpayPaymentResolution(value: unknown): value is VnpayPaymentResolution {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['paymentReference', 'purchaseReference']) &&
    typeof value.paymentReference === 'string' &&
    canonicalUuid.test(value.paymentReference) &&
    typeof value.purchaseReference === 'string' &&
    canonicalUuid.test(value.purchaseReference)
  );
}

export function parseVnpayPaymentResolution(value: unknown): VnpayPaymentResolution | null {
  return isVnpayPaymentResolution(value) ? value : null;
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
    response.purchase.paymentMethod === response.payment.paymentMethod &&
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

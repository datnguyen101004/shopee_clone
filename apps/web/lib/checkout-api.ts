import {
  CHECKOUT_IDEMPOTENCY_KEY_PATTERN,
  parseCheckoutConfirmationRequest,
  parseCheckoutConfirmationResponse,
  parseCheckoutPreviewRequest,
  parseCheckoutPreviewResponse,
  parseCheckoutProblemDetails,
  parsePurchaseResult,
  parseOnlinePaymentCheckoutRequest,
  parseOnlinePaymentCheckoutResponse,
  parsePaymentStatusResponse,
  parseVnpayPaymentResolution,
  type CheckoutConfirmationRequest,
  type CheckoutConfirmationResponse,
  type CheckoutPreviewRequest,
  type CheckoutPreviewResponse,
  type CheckoutProblemDetails,
  type PurchaseResult,
  type OnlinePaymentCheckoutRequest,
  type OnlinePaymentCheckoutResponse,
  type PaymentStatusResponse,
} from '@shopee-clone/contracts';

import type { AuthenticatedFetch } from './account-api';

const fallbackBaseUrl = 'http://localhost:3001';

export class CheckoutApiError extends Error {
  constructor(
    readonly kind: 'input' | 'transport' | 'status' | 'contract' | 'aborted',
    readonly status = 0,
    readonly problem: CheckoutProblemDetails | null = null,
  ) {
    super(`Checkout API ${kind} error`);
  }
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

async function checkoutRequest(
  path: string,
  init: RequestInit,
  authenticatedFetch: AuthenticatedFetch,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json, application/problem+json');
    if (init.body) headers.set('Content-Type', 'application/json');
    const response = await authenticatedFetch(endpoint(path), {
      ...init,
      headers,
      cache: 'no-store',
      credentials: 'include',
      signal,
    });
    if (response.ok) return response;
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Preserve the status when an upstream Problem Details body is malformed.
    }
    throw new CheckoutApiError('status', response.status, parseCheckoutProblemDetails(body));
  } catch (error) {
    if (error instanceof CheckoutApiError) throw error;
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new CheckoutApiError('aborted');
    }
    throw new CheckoutApiError('transport');
  }
}

export async function previewCheckout(
  input: CheckoutPreviewRequest,
  cartVersion: number,
  authenticatedFetch: AuthenticatedFetch,
  signal?: AbortSignal,
): Promise<CheckoutPreviewResponse> {
  const parsedInput = parseCheckoutPreviewRequest(input);
  if (!parsedInput || !Number.isSafeInteger(cartVersion) || cartVersion < 0) {
    throw new CheckoutApiError('input');
  }
  const response = await checkoutRequest(
    '/api/v1/checkout/preview',
    {
      method: 'POST',
      headers: { 'If-Match': `"cart-${cartVersion}"` },
      body: JSON.stringify(parsedInput),
    },
    authenticatedFetch,
    signal,
  );
  const parsed = parseCheckoutPreviewResponse(await response.json());
  if (!parsed || parsed.cartVersion !== cartVersion) {
    throw new CheckoutApiError('contract', response.status);
  }
  return parsed;
}

export async function confirmCodCheckout(
  input: CheckoutConfirmationRequest,
  cartVersion: number,
  idempotencyKey: string,
  authenticatedFetch: AuthenticatedFetch,
): Promise<CheckoutConfirmationResponse> {
  const parsedInput = parseCheckoutConfirmationRequest(input);
  if (
    !parsedInput ||
    !Number.isSafeInteger(cartVersion) ||
    cartVersion < 0 ||
    !CHECKOUT_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)
  ) {
    throw new CheckoutApiError('input');
  }
  const response = await checkoutRequest(
    '/api/v1/checkout/cod',
    {
      method: 'POST',
      headers: {
        'If-Match': `"cart-${cartVersion}"`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(parsedInput),
    },
    authenticatedFetch,
  );
  const parsed = parseCheckoutConfirmationResponse(await response.json());
  if (!parsed || parsed.purchase.sourceCartVersion !== cartVersion) {
    throw new CheckoutApiError('contract', response.status);
  }
  return parsed;
}

export async function confirmMomoCheckout(
  input: OnlinePaymentCheckoutRequest,
  cartVersion: number,
  idempotencyKey: string,
  authenticatedFetch: AuthenticatedFetch,
): Promise<OnlinePaymentCheckoutResponse> {
  const parsedInput = parseOnlinePaymentCheckoutRequest(input);
  if (
    !parsedInput ||
    !Number.isSafeInteger(cartVersion) ||
    cartVersion < 0 ||
    !CHECKOUT_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)
  ) {
    throw new CheckoutApiError('input');
  }
  const response = await checkoutRequest(
    '/api/v1/checkout/online-payments',
    {
      method: 'POST',
      headers: {
        'If-Match': `"cart-${cartVersion}"`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(parsedInput),
    },
    authenticatedFetch,
  );
  const parsed = parseOnlinePaymentCheckoutResponse(await response.json());
  if (!parsed || parsed.purchase.sourceCartVersion !== cartVersion) {
    throw new CheckoutApiError('contract', response.status);
  }
  return parsed;
}

export async function confirmVnpayCheckout(
  input: OnlinePaymentCheckoutRequest,
  cartVersion: number,
  idempotencyKey: string,
  authenticatedFetch: AuthenticatedFetch,
): Promise<OnlinePaymentCheckoutResponse> {
  const parsedInput = parseOnlinePaymentCheckoutRequest(input);
  if (
    !parsedInput ||
    parsedInput.provider !== 'VNPAY' ||
    !Number.isSafeInteger(cartVersion) ||
    cartVersion < 0 ||
    !CHECKOUT_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)
  ) {
    throw new CheckoutApiError('input');
  }
  const response = await checkoutRequest(
    '/api/v1/checkout/online-payments',
    {
      method: 'POST',
      headers: {
        'If-Match': `"cart-${cartVersion}"`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(parsedInput),
    },
    authenticatedFetch,
  );
  const parsed = parseOnlinePaymentCheckoutResponse(await response.json());
  if (!parsed || parsed.purchase.sourceCartVersion !== cartVersion) {
    throw new CheckoutApiError('contract', response.status);
  }
  return parsed;
}

export async function resolveVnpayPayment(
  transactionReference: string,
  authenticatedFetch: AuthenticatedFetch,
  signal?: AbortSignal,
): Promise<{ paymentReference: string; purchaseReference: string }> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(transactionReference)) throw new CheckoutApiError('input');
  const response = await checkoutRequest(
    `/api/v1/payments/vnpay/resolve?vnp_TxnRef=${encodeURIComponent(transactionReference)}`,
    { method: 'GET' },
    authenticatedFetch,
    signal,
  );
  const body: unknown = await response.json();
  const parsed = parseVnpayPaymentResolution(body);
  if (!parsed) throw new CheckoutApiError('contract', response.status);
  return parsed;
}

export async function settleVnpayReturn(
  fields: Readonly<Record<string, string>>,
  authenticatedFetch: AuthenticatedFetch,
  signal?: AbortSignal,
): Promise<PaymentStatusResponse> {
  const entries = Object.entries(fields);
  if (
    entries.length === 0 ||
    entries.some(([key, value]) => !/^vnp_[A-Za-z0-9_]{1,64}$/.test(key) || value.length > 512)
  ) {
    throw new CheckoutApiError('input');
  }
  const response = await checkoutRequest(
    '/api/v1/payments/vnpay/return',
    {
      method: 'POST',
      body: JSON.stringify({ fields }),
    },
    authenticatedFetch,
    signal,
  );
  const parsed = parsePaymentStatusResponse(await response.json());
  if (!parsed) throw new CheckoutApiError('contract', response.status);
  return parsed;
}

export async function getPaymentStatus(
  paymentReference: string,
  authenticatedFetch: AuthenticatedFetch,
  signal?: AbortSignal,
): Promise<PaymentStatusResponse> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(paymentReference)) {
    throw new CheckoutApiError('input');
  }
  const response = await checkoutRequest(
    `/api/v1/payments/${encodeURIComponent(paymentReference)}`,
    { method: 'GET' },
    authenticatedFetch,
    signal,
  );
  const parsed = parsePaymentStatusResponse(await response.json());
  if (!parsed || parsed.paymentReference !== paymentReference) {
    throw new CheckoutApiError('contract', response.status);
  }
  return parsed;
}

export async function retryPayment(
  paymentReference: string,
  provider: 'MOMO' | 'VNPAY',
  idempotencyKey: string,
  authenticatedFetch: AuthenticatedFetch,
): Promise<OnlinePaymentCheckoutResponse> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(paymentReference) ||
    !CHECKOUT_IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey) ||
    (provider !== 'MOMO' && provider !== 'VNPAY')
  ) {
    throw new CheckoutApiError('input');
  }
  const response = await checkoutRequest(
    `/api/v1/payments/${encodeURIComponent(paymentReference)}/retry`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ provider }),
    },
    authenticatedFetch,
  );
  const parsed = parseOnlinePaymentCheckoutResponse(await response.json());
  if (!parsed || parsed.payment.provider !== provider) {
    throw new CheckoutApiError('contract', response.status);
  }
  return parsed;
}

export async function getCheckoutPurchase(
  purchaseReference: string,
  authenticatedFetch: AuthenticatedFetch,
  signal?: AbortSignal,
): Promise<PurchaseResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(purchaseReference)) {
    throw new CheckoutApiError('input');
  }
  const response = await checkoutRequest(
    `/api/v1/checkout/purchases/${encodeURIComponent(purchaseReference)}`,
    { method: 'GET' },
    authenticatedFetch,
    signal,
  );
  const parsed = parsePurchaseResult(await response.json());
  if (!parsed || parsed.purchaseReference !== purchaseReference) {
    throw new CheckoutApiError('contract', response.status);
  }
  return parsed;
}

import type { CheckoutPreviewResponse } from '@shopee-clone/contracts';

export class CheckoutValidationError extends Error {
  constructor(public readonly invalidParameters: string[]) {
    super('Invalid checkout request');
  }
}

export class CheckoutCartConflictError extends Error {
  constructor(public readonly currentCartVersion?: number) {
    super('Cart version is stale');
  }
}

export class CheckoutNotReadyError extends Error {
  constructor(public readonly preview?: CheckoutPreviewResponse) {
    super('Checkout is not ready');
  }
}

export class CheckoutPreviewChangedError extends Error {
  constructor(public readonly preview: CheckoutPreviewResponse) {
    super('Checkout preview changed');
  }
}

export class CheckoutIdempotencyConflictError extends Error {}
export class CheckoutInventoryConflictError extends Error {
  constructor(public readonly availableQuantity: number) {
    super('Inventory is insufficient');
  }
}
export class CheckoutPurchaseNotFoundError extends Error {}
export class CheckoutUnavailableError extends Error {}
export class CheckoutRateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds = 1) { super('Checkout request rate limit exceeded'); }
}
export class CheckoutFlashSaleBusyError extends Error {
  constructor(public readonly retryAfterSeconds = 1) { super('Flash Sale confirmation capacity is temporarily full'); }
}
export class CheckoutFlashSaleError extends Error {
  constructor(public readonly code: 'FLASH_SALE_SOLD_OUT' | 'FLASH_SALE_LIMIT_REACHED' | 'FLASH_SALE_COD_ONLY', message: string) { super(message); }
}
export class CheckoutFlashSaleSoldOutError extends CheckoutFlashSaleError { constructor() { super('FLASH_SALE_SOLD_OUT', 'The Flash Sale allocation is sold out.'); } }
export class CheckoutFlashSaleLimitError extends CheckoutFlashSaleError { constructor() { super('FLASH_SALE_LIMIT_REACHED', 'This buyer has already claimed this product in the campaign.'); } }
export class CheckoutFlashSaleCodOnlyError extends CheckoutFlashSaleError { constructor() { super('FLASH_SALE_COD_ONLY', 'Flash Sale purchases must use COD.'); } }

/** The selected attempt cannot be retried without changing payment state. */
export class PaymentRetryNotAllowedError extends Error {}

/** A retry was requested while another attempt is already active. */
export class PaymentRetryActiveError extends Error {}

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

/** The selected attempt cannot be retried without changing payment state. */
export class PaymentRetryNotAllowedError extends Error {}

/** A retry was requested while another attempt is already active. */
export class PaymentRetryActiveError extends Error {}

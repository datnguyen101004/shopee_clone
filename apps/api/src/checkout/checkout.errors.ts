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
export class CheckoutPurchaseNotFoundError extends Error {}
export class CheckoutUnavailableError extends Error {}

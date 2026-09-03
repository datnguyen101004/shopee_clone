export class SellerOrderValidationError extends Error {
  constructor(public readonly invalidParameters: string[]) {
    super('Invalid seller order request');
  }
}
export class SellerOrderNotFoundError extends Error {
  constructor() {
    super('Seller order not found');
  }
}
export class SellerOrderUnavailableError extends Error {
  constructor() {
    super('Seller order is temporarily unavailable');
  }
}
export class SellerOrderStaleError extends Error {
  constructor(
    public readonly currentOrderVersion: number,
    public readonly currentFulfillmentVersion: number,
  ) {
    super('Seller order version is stale');
  }
}
export class SellerOrderTransitionError extends Error {
  constructor() {
    super('Seller order transition is not allowed');
  }
}
export class SellerOrderIdempotencyConflictError extends Error {
  constructor() {
    super('Seller order idempotency key was already used with different input');
  }
}
export class SellerOrderCompensationConflictError extends Error {
  constructor() {
    super('Seller order inventory compensation is already committed');
  }
}
export class SellerOrderInventoryInvariantError extends Error {
  constructor() {
    super('Seller order inventory compensation is unavailable');
  }
}

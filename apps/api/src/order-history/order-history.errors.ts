export class OrderHistoryValidationError extends Error {
  constructor(public readonly invalidParameters: string[]) {
    super('Invalid order-history request');
  }
}

export class OrderNotFoundError extends Error {}
export class OrderHistoryUnavailableError extends Error {}
export class OrderIdempotencyConflictError extends Error {}

export class OrderStaleConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super('Order version is stale');
  }
}

export class OrderTransitionConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super('Order transition is not allowed');
  }
}

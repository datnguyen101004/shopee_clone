export class CartValidationError extends Error {
  constructor(public readonly invalidParameters: string[]) {
    super('Invalid cart request');
  }
}

export class CartConflictError extends Error {}
export class CartLineNotFoundError extends Error {}
export class CartItemUnavailableError extends Error {}
export class CartSelfPurchaseError extends Error {}
export class CartCapacityError extends Error {}
export class CartUnavailableError extends Error {}

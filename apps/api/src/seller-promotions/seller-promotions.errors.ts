export class SellerPromotionValidationError extends Error {
  constructor(
    public readonly invalidParameters: string[],
    detail = 'One or more promotion fields are invalid.',
  ) {
    super(detail);
  }
}
export class SellerPromotionNotFoundError extends Error { constructor() { super('Seller promotion unavailable'); } }
export class SellerPromotionStaleError extends Error { constructor(public readonly currentVersion: number) { super('Seller promotion version mismatch'); } }
export class SellerPromotionConflictError extends Error { constructor(public readonly code = 'PROMOTION_CONFLICT', message = 'Seller promotion cannot be changed.') { super(message); } }
export class SellerPromotionIdempotencyConflictError extends Error { constructor() { super('Promotion idempotency key was already used with different input'); } }
export class SellerPromotionUnavailableError extends Error { constructor() { super('Seller promotion is temporarily unavailable'); } }

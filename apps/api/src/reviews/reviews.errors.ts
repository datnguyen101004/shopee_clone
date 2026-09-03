export class ReviewValidationError extends Error {
  constructor(public readonly invalidParameters: string[]) { super('Invalid review request'); }
}
export class ReviewNotFoundError extends Error {}
export class ReviewEligibilityError extends Error {}
export class ReviewDuplicateError extends Error {}
export class ReviewIdempotencyConflictError extends Error {}
export class ReviewStaleError extends Error { constructor(public readonly currentVersion: number) { super('Review is stale'); } }
export class ReviewMediaError extends Error { constructor(public readonly code: string) { super(code); } }
export class ReviewUnavailableError extends Error {}

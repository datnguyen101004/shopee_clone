export const RETURN_CONFLICT_CODES = {
  STALE: 'RETURN_STALE',
  ACTION_NOT_ALLOWED: 'RETURN_ACTION_NOT_ALLOWED',
  ELIGIBILITY_EXPIRED: 'RETURN_ELIGIBILITY_EXPIRED',
  DEADLINE_EXPIRED: 'RETURN_DEADLINE_EXPIRED',
  IDEMPOTENCY_CONFLICT: 'RETURN_IDEMPOTENCY_CONFLICT',
  ALLOCATION_INVALID: 'RETURN_ALLOCATION_INVALID',
} as const;

export class ReturnValidationError extends Error {
  constructor(public readonly invalidParameters: string[]) {
    super('Invalid return request');
  }
}
export class ReturnNotFoundError extends Error {}
export class ReturnUnavailableError extends Error {}
export class ReturnStaleError extends Error {
  readonly code = RETURN_CONFLICT_CODES.STALE;
  constructor(public readonly currentVersion: number) {
    super('Return version is stale');
  }
}
export class ReturnActionConflictError extends Error {
  readonly code = RETURN_CONFLICT_CODES.ACTION_NOT_ALLOWED;
  constructor(public readonly currentVersion: number) {
    super('Return action is not available');
  }
}
export class ReturnEligibilityConflictError extends Error {
  readonly code = RETURN_CONFLICT_CODES.ELIGIBILITY_EXPIRED;
  constructor(public readonly currentVersion: number) {
    super('Return eligibility has expired');
  }
}
export class ReturnDeadlineConflictError extends Error {
  readonly code = RETURN_CONFLICT_CODES.DEADLINE_EXPIRED;
  constructor(public readonly currentVersion: number) {
    super('Return deadline has expired');
  }
}
export class ReturnIdempotencyConflictError extends Error {
  readonly code = RETURN_CONFLICT_CODES.IDEMPOTENCY_CONFLICT;
  constructor() {
    super('Return idempotency key was reused with different input');
  }
}

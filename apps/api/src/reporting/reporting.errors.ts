export class ReportInvalidInputError extends Error {
  constructor(
    message: string = 'One or more report parameters are invalid.',
    public readonly invalidParameters?: string[],
  ) {
    super(message);
    this.name = 'ReportInvalidInputError';
  }
}

export class ReportTargetNotFoundError extends Error {
  constructor(message: string = 'The requested target was not found or is unavailable.') {
    super(message);
    this.name = 'ReportTargetNotFoundError';
  }
}

export class SelfReportForbiddenError extends Error {
  constructor(message: string = 'Sellers cannot report their own shop or products.') {
    super(message);
    this.name = 'SelfReportForbiddenError';
  }
}

export class ReportIdempotencyConflictError extends Error {
  constructor(message: string = 'The idempotency key has already been used with different request parameters.') {
    super(message);
    this.name = 'ReportIdempotencyConflictError';
  }
}

export class ReportRateLimitExceededError extends Error {
  constructor(
    public readonly retryAfterSeconds: number = 3600,
    message: string = 'Report submission rate limit exceeded.',
  ) {
    super(message);
    this.name = 'ReportRateLimitExceededError';
  }
}

export class ReportNotFoundError extends Error {
  constructor(message: string = 'The report was not found.') {
    super(message);
    this.name = 'ReportNotFoundError';
  }
}

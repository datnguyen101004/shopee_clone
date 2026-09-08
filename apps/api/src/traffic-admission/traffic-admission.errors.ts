export class TrafficAdmissionError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number, public readonly retryAfterSeconds?: number) { super(message); }
}
export class AdmissionRequiredError extends TrafficAdmissionError { constructor() { super('ADMISSION_REQUIRED', 'Checkout access requires an admission ticket.', 428, 5); } }
export class AdmissionInvalidError extends TrafficAdmissionError { constructor() { super('ADMISSION_INVALID', 'The admission token is invalid for this session.', 403); } }
export class AdmissionExpiredError extends TrafficAdmissionError { constructor() { super('ADMISSION_EXPIRED', 'The admission ticket has expired.', 428, 5); } }
export class WaitingRoomFullError extends TrafficAdmissionError { constructor() { super('WAITING_ROOM_FULL', 'The waiting room is temporarily full.', 429, 10); } }
export class AdmissionRateLimitError extends TrafficAdmissionError { constructor(retryAfterSeconds = 1) { super('ADMISSION_RATE_LIMITED', 'The admission token request budget is exhausted.', 429, retryAfterSeconds); } }
export class AdmissionUnavailableError extends TrafficAdmissionError { constructor() { super('ADMISSION_UNAVAILABLE', 'The admission control plane is temporarily unavailable.', 503, 5); } }
export class AdmissionIdempotencyConflictError extends TrafficAdmissionError { constructor() { super('ADMISSION_IDEMPOTENCY_CONFLICT', 'The admission idempotency key was already used for different join parameters.', 409); } }
export class AdmissionValidationError extends TrafficAdmissionError { constructor() { super('ADMISSION_INVALID_REQUEST', 'A valid admission idempotency key is required.', 400); } }

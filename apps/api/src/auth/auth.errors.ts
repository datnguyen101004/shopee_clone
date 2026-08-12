export class AuthInputError extends Error {
  constructor(public readonly invalidParameters: string[]) {
    super('Invalid authentication request');
  }
}

export class RegistrationUnavailableError extends Error {}
export class AuthenticationFailedError extends Error {}
export class RefreshSessionFailedError extends Error {
  constructor(public readonly clearCookie = true) {
    super('Refresh session failed');
  }
}
export class PasswordResetFailedError extends Error {}
export class RecoveryDeliveryFailedError extends Error {}
export class AuthOriginDeniedError extends Error {}
export class GoogleSignInFailedError extends Error {}
export class GoogleAccountMethodRequiredError extends Error {}

export class AuthRateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('Authentication request rate limited');
  }
}

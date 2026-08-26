export class AuthInputError extends Error {
  constructor(public readonly invalidParameters: string[]) {
    super('Invalid authentication request');
  }
}

export class RegistrationUnavailableError extends Error {}
export class AuthenticationFailedError extends Error {}
export class AccountSuspendedError extends Error {
  constructor() {
    super('The account and its shop have been disabled.');
  }
}
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
export class AuthorizationDeniedError extends Error {}
export class RoleConflictError extends Error {}
export class RoleTargetUnavailableError extends Error {}
export class RoleRequestError extends Error {}

export class AuthRateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('Authentication request rate limited');
  }
}

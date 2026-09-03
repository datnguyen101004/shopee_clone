export class AccountInputError extends Error {
  constructor(public readonly invalidParameters: string[]) {
    super('Invalid account request');
  }
}

export class AccountAddressNotFoundError extends Error {}
export class AccountInvariantConflictError extends Error {}
export class AccountUnavailableError extends Error {}

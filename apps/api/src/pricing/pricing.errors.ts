export class PricingValidationError extends Error {
  constructor(public readonly invalidParameters: string[]) {
    super('Invalid pricing quote request');
  }
}

export class PricingConflictError extends Error {}
export class PricingAddressNotFoundError extends Error {}
export class PricingUnavailableError extends Error {}

export class SellerOnboardingInputError extends Error {
  constructor(public readonly invalidParameters: string[]) {
    super('Invalid seller shop request');
  }
}

export class SellerShopConflictError extends Error {
  constructor(public readonly invalidParameters: string[]) {
    super('Seller shop conflict');
  }
}

export class SellerShopNotFoundError extends Error {}
export class SellerOnboardingUnavailableError extends Error {}


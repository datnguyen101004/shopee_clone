export class SellerAnalyticsValidationError extends Error {
  constructor(public readonly invalidParameters: string[]) { super('Invalid seller analytics request'); }
}
export class SellerAnalyticsNotFoundError extends Error { constructor() { super('Seller analytics unavailable'); } }
export class SellerAnalyticsUnavailableError extends Error { constructor() { super('Seller analytics is temporarily unavailable'); } }

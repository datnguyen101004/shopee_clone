export class SellerProductInputError extends Error {
  constructor(readonly invalidParameters: string[]) { super('Invalid seller product request'); }
}
export class SellerProductNotFoundError extends Error {}
export class SellerProductConflictError extends Error {
  constructor(readonly invalidParameters: string[]) { super('Seller product conflict'); }
}
export class SellerProductUnavailableError extends Error {}
export class SellerProductMediaError extends Error {
  constructor(readonly code = 'invalid-seller-product-media') { super(code); }
}

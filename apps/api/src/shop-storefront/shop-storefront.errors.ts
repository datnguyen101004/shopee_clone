export class ShopStorefrontValidationError extends Error {
  constructor(readonly invalidParameters: string[]) {
    super('Invalid shop storefront request');
  }
}

export class PublicShopNotFoundError extends Error {
  constructor() {
    super('Public shop is unavailable');
  }
}

export class ShopSelfFollowConflictError extends Error {
  constructor() {
    super('A shop owner cannot follow their own shop');
  }
}

export class ShopFollowOwnerUnavailableError extends Error {
  constructor() {
    super('Authenticated buyer is unavailable');
  }
}

export class ShopStorefrontAggregateError extends Error {
  constructor() {
    super('Shop aggregate exceeds the safe integer boundary');
  }
}

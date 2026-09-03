export class EngagementValidationError extends Error {
  constructor(readonly invalidParameters: string[]) {
    super('Invalid engagement request');
  }
}

export class EngagementProductNotFoundError extends Error {
  constructor() {
    super('Product is not displayable');
  }
}

export class EngagementOwnerUnavailableError extends Error {
  constructor() {
    super('Authenticated buyer is unavailable');
  }
}

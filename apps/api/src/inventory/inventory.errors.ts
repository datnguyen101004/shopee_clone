export class InventoryValidationError extends Error {
  constructor(public readonly invalidParameters: string[]) { super('Invalid inventory request'); }
}
export class InventoryNotFoundError extends Error { constructor() { super('Inventory item not found'); } }
export class InventoryStaleError extends Error { constructor(public readonly currentVersion: number) { super('Inventory is stale'); } }
export class InventoryIdempotencyConflictError extends Error { constructor() { super('Inventory idempotency key was already used with a different request'); } }
export class InventoryInsufficientError extends Error { constructor(public readonly availableQuantity: number) { super('Insufficient inventory'); } }
export class InventoryUnavailableError extends Error { constructor() { super('Inventory is temporarily unavailable'); } }

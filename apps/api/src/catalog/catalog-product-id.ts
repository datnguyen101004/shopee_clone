import { isCanonicalProductId } from '@shopee-clone/contracts';

export class CatalogProductIdValidationError extends Error {
  constructor() {
    super('Product identifier must be a lowercase canonical UUID.');
  }
}

export class CatalogProductNotFoundError extends Error {
  constructor() {
    super('Public product was not found.');
  }
}

export class CatalogProductDeletedError extends Error {
  constructor() {
    super('The requested product was deleted.');
  }
}

export function parseCatalogProductId(value: unknown): string {
  if (typeof value !== 'string' || !isCanonicalProductId(value)) {
    throw new CatalogProductIdValidationError();
  }
  return value;
}

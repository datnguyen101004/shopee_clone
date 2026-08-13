export class UnsafePricingArithmeticError extends Error {
  constructor() {
    super('Pricing arithmetic is outside the supported safe-integer range.');
  }
}

export function checkedInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new UnsafePricingArithmeticError();
  return value;
}

export function checkedMoneyFromBigInt(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new UnsafePricingArithmeticError();
  }
  return Number(value);
}

export function checkedAdd(...values: number[]): number {
  return values.reduce((total, value) => checkedInteger(total + checkedInteger(value)), 0);
}

export function checkedSubtract(left: number, right: number): number {
  return checkedInteger(checkedInteger(left) - checkedInteger(right));
}

export function checkedMultiply(left: number, right: number): number {
  return checkedInteger(checkedInteger(left) * checkedInteger(right));
}

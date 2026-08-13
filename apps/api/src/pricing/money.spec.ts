import {
  checkedAdd,
  checkedMoneyFromBigInt,
  checkedMultiply,
  checkedSubtract,
  UnsafePricingArithmeticError,
} from './money';

describe('checked VND arithmetic', () => {
  it('performs exact non-negative integer arithmetic', () => {
    expect(checkedMoneyFromBigInt(123_456n)).toBe(123_456);
    expect(checkedAdd(100, 20, 3)).toBe(123);
    expect(checkedMultiply(12_000, 3)).toBe(36_000);
    expect(checkedSubtract(50_000, 12_000)).toBe(38_000);
  });

  it.each([
    () => checkedMoneyFromBigInt(-1n),
    () => checkedMoneyFromBigInt(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
    () => checkedAdd(Number.MAX_SAFE_INTEGER, 1),
    () => checkedMultiply(Number.MAX_SAFE_INTEGER, 2),
    () => checkedSubtract(1, 2),
  ])('fails closed for negative or unsafe values', (operation) => {
    expect(operation).toThrow(UnsafePricingArithmeticError);
  });
});

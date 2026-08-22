import { checkedMoneyFromBigInt } from '../pricing/money';

export class ReturnAllocationInvariantError extends Error {}

export interface ReturnLineAllocationInput {
  lineReference: string;
  purchasedQuantity: number;
  requestedQuantity: number;
  payableMerchandiseMinor: bigint;
}

export interface ReturnLineAllocation extends ReturnLineAllocationInput {
  refundMinor: bigint;
}

function validQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function allocateReturnLine(input: ReturnLineAllocationInput): ReturnLineAllocation {
  if (
    !input.lineReference ||
    !validQuantity(input.purchasedQuantity) ||
    !validQuantity(input.requestedQuantity) ||
    input.requestedQuantity > input.purchasedQuantity ||
    input.payableMerchandiseMinor < 0n
  )
    throw new ReturnAllocationInvariantError();
  const refundMinor =
    input.requestedQuantity === input.purchasedQuantity
      ? input.payableMerchandiseMinor
      : (input.payableMerchandiseMinor * BigInt(input.requestedQuantity)) /
        BigInt(input.purchasedQuantity);
  return { ...input, refundMinor };
}

export function allocateReturnLines(inputs: ReturnLineAllocationInput[]): ReturnLineAllocation[] {
  if (
    inputs.length === 0 ||
    new Set(inputs.map((line) => line.lineReference)).size !== inputs.length
  )
    throw new ReturnAllocationInvariantError();
  return inputs.map(allocateReturnLine);
}

export function returnAllocationTotal(
  lines: readonly Pick<ReturnLineAllocation, 'refundMinor'>[],
): bigint {
  const total = lines.reduce((sum, line) => sum + line.refundMinor, 0n);
  if (total < 0n) throw new ReturnAllocationInvariantError();
  return total;
}

export function projectReturnMoney(value: bigint): number {
  return checkedMoneyFromBigInt(value);
}

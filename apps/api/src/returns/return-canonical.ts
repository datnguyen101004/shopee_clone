import { createHash, timingSafeEqual } from 'node:crypto';

import type {
  AdminReturnDecisionRequest,
  BuyerReturnActionRequest,
  CreateReturnRequest,
  SellerReturnActionRequest,
} from '@shopee-clone/contracts';

type MutationInput =
  | CreateReturnRequest
  | BuyerReturnActionRequest
  | SellerReturnActionRequest
  | AdminReturnDecisionRequest;

function digest(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function returnCreateDigest(
  orderReference: string,
  expectedOrderVersion: number,
  input: CreateReturnRequest,
): string {
  return digest({
    kind: 'create',
    orderReference,
    expectedOrderVersion,
    reasonCode: input.reasonCode,
    description: input.description,
    items: [...input.items].sort((left, right) =>
      left.lineReference.localeCompare(right.lineReference),
    ),
    evidenceIds: [...input.evidenceIds].sort(),
  });
}

export function returnMutationDigest(
  returnReference: string,
  expectedVersion: number,
  input: Exclude<MutationInput, CreateReturnRequest>,
): string {
  return digest({ kind: 'mutation', returnReference, expectedVersion, ...input });
}

export function returnDigestsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && a.length === 32 && timingSafeEqual(a, b);
}

export function deterministicReturnReason(action: string): string {
  return `RETURN_${action}`;
}

import {
  normalizeVoucherCode,
  type VoucherBenefitType,
  type VoucherIssuer,
} from '@shopee-clone/contracts';

export interface VoucherDefinitionWrite {
  code: string;
  issuer: VoucherIssuer;
  shopId: string | null;
  benefitType: VoucherBenefitType;
  fixedAmountMinor: bigint | null;
  percentageBasisPoints: number | null;
  maximumDiscountMinor: bigint | null;
  minimumSpendMinor: bigint;
  startsAt: Date;
  endsAt: Date;
  usageLimit: number;
  perBuyerLimit: number;
}

export function canonicalizeVoucherDefinition(
  input: VoucherDefinitionWrite,
): VoucherDefinitionWrite {
  const code = normalizeVoucherCode(input.code);
  if (!code) throw new Error('Voucher code is invalid.');
  if ((input.issuer === 'SHOP') !== (input.shopId !== null)) {
    throw new Error('Voucher issuer and shop are inconsistent.');
  }
  if (!(input.startsAt < input.endsAt)) throw new Error('Voucher activity window is invalid.');
  if (
    input.minimumSpendMinor < 0n ||
    input.minimumSpendMinor > BigInt(Number.MAX_SAFE_INTEGER) ||
    !Number.isSafeInteger(input.usageLimit) ||
    !Number.isSafeInteger(input.perBuyerLimit) ||
    input.usageLimit < 1 ||
    input.perBuyerLimit < 1 ||
    input.perBuyerLimit > input.usageLimit
  ) {
    throw new Error('Voucher limits are invalid.');
  }
  const positiveMoney = (value: bigint | null) =>
    value !== null && value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER);
  const benefitIsValid =
    (input.benefitType === 'FIXED_AMOUNT' &&
      positiveMoney(input.fixedAmountMinor) &&
      input.percentageBasisPoints === null &&
      input.maximumDiscountMinor === null) ||
    (input.benefitType === 'PERCENTAGE' &&
      input.fixedAmountMinor === null &&
      input.percentageBasisPoints !== null &&
      Number.isInteger(input.percentageBasisPoints) &&
      input.percentageBasisPoints >= 1 &&
      input.percentageBasisPoints <= 10_000 &&
      positiveMoney(input.maximumDiscountMinor)) ||
    (input.benefitType === 'FREE_SHIPPING' &&
      input.fixedAmountMinor === null &&
      input.percentageBasisPoints === null &&
      positiveMoney(input.maximumDiscountMinor));
  if (!benefitIsValid) throw new Error('Voucher benefit configuration is invalid.');
  return { ...input, code };
}

export function assertVoucherProductScopeConsistency(
  voucher: Pick<VoucherDefinitionWrite, 'issuer' | 'shopId'>,
  products: readonly { id: string; shopId: string }[],
): void {
  if (voucher.issuer === 'SHOP' && products.some(({ shopId }) => shopId !== voucher.shopId)) {
    throw new Error('A shop voucher cannot scope products from another shop.');
  }
  if (new Set(products.map(({ id }) => id)).size !== products.length) {
    throw new Error('Voucher product scope contains duplicate products.');
  }
}

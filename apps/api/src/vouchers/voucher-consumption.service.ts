import { createHash, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { checkedAdd, checkedInteger } from '../pricing/money';
import type { AppliedVoucherSnapshot } from './voucher-pricing.calculator';

export class VoucherConsumptionConflictError extends Error {}
export class VoucherConsumptionUnavailableError extends Error {}

export interface ConsumeVouchersInput {
  purchaseReference: string;
  userId: string;
  evaluatedAt: Date;
  applied: readonly AppliedVoucherSnapshot[];
}

export interface VoucherConsumptionResult {
  consumptionId: string | null;
  created: boolean;
  redemptionCount: number;
  redemptions: { id: string; voucherId: string }[];
}

interface LockedVoucher {
  id: string;
  isEnabled: boolean;
  startsAt: Date;
  endsAt: Date;
  usageLimit: number;
  usedCount: number;
  perBuyerLimit: number;
}

interface LockedUsage {
  voucherId: string;
  usedCount: number;
}

function voucherSetDigest(userId: string, applied: readonly AppliedVoucherSnapshot[]): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        userId,
        vouchers: [...applied]
          .sort((left, right) => left.voucherId.localeCompare(right.voucherId))
          .map((voucher) => ({
            voucherId: voucher.voucherId,
            merchandiseDiscountMinor: voucher.merchandiseDiscountMinor,
            shippingDiscountMinor: voucher.shippingDiscountMinor,
            discountMinor: voucher.discountMinor,
          })),
      }),
    )
    .digest('hex');
}

function validateApplied(applied: readonly AppliedVoucherSnapshot[]): AppliedVoucherSnapshot[] {
  const ordered = [...applied].sort((left, right) => left.voucherId.localeCompare(right.voucherId));
  if (new Set(ordered.map(({ voucherId }) => voucherId)).size !== ordered.length) {
    throw new VoucherConsumptionConflictError('Voucher set contains duplicate definitions.');
  }
  for (const item of ordered) {
    checkedInteger(item.merchandiseDiscountMinor);
    checkedInteger(item.shippingDiscountMinor);
    checkedInteger(item.discountMinor);
    if (
      item.discountMinor < 1 ||
      checkedAdd(item.merchandiseDiscountMinor, item.shippingDiscountMinor) !== item.discountMinor
    ) {
      throw new VoucherConsumptionConflictError('Voucher benefit is inconsistent.');
    }
  }
  return ordered;
}

@Injectable()
export class VoucherConsumptionService {
  async consumeInTransaction(
    transaction: Prisma.TransactionClient,
    input: ConsumeVouchersInput,
  ): Promise<VoucherConsumptionResult> {
    if (!Number.isFinite(input.evaluatedAt.getTime())) {
      throw new VoucherConsumptionConflictError('Voucher evaluation time is invalid.');
    }
    const ordered = validateApplied(input.applied);
    if (ordered.length === 0) {
      return { consumptionId: null, created: false, redemptionCount: 0, redemptions: [] };
    }
    const digest = voucherSetDigest(input.userId, ordered);
    const proposedId = randomUUID();
    const inserted = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO "voucher_consumptions" (
        "id", "purchase_reference", "user_id", "voucher_set_digest"
      ) VALUES (
        ${proposedId}::uuid,
        ${input.purchaseReference}::uuid,
        ${input.userId}::uuid,
        ${digest}
      )
      ON CONFLICT ("purchase_reference") DO NOTHING
      RETURNING "id"
    `);
    const created = inserted.length === 1;
    const consumption = created
      ? { id: inserted[0]!.id, userId: input.userId, voucherSetDigest: digest, redemptions: [] }
      : await transaction.voucherConsumption.findUnique({
          where: { purchaseReference: input.purchaseReference },
          include: { redemptions: true },
        });
    if (!consumption) throw new VoucherConsumptionUnavailableError('Consumption disappeared.');
    if (consumption.userId !== input.userId || consumption.voucherSetDigest !== digest) {
      throw new VoucherConsumptionConflictError('Purchase reference was already used differently.');
    }
    if (!created) {
      if (consumption.redemptions.length !== ordered.length) {
        throw new VoucherConsumptionConflictError('Existing voucher consumption is incomplete.');
      }
      return {
        consumptionId: consumption.id,
        created: false,
        redemptionCount: consumption.redemptions.length,
        redemptions: consumption.redemptions
          .map(({ id, voucherId }) => ({ id, voucherId }))
          .sort((left, right) => left.voucherId.localeCompare(right.voucherId)),
      };
    }

    const voucherIds = ordered.map(({ voucherId }) => voucherId);
    const voucherSqlIds = voucherIds.map((id) => Prisma.sql`${id}::uuid`);
    const lockedVouchers = await transaction.$queryRaw<LockedVoucher[]>(Prisma.sql`
      SELECT
        "id",
        "is_enabled" AS "isEnabled",
        "starts_at" AS "startsAt",
        "ends_at" AS "endsAt",
        "usage_limit" AS "usageLimit",
        "used_count" AS "usedCount",
        "per_buyer_limit" AS "perBuyerLimit"
      FROM "vouchers"
      WHERE "id" IN (${Prisma.join(voucherSqlIds)})
      ORDER BY "id"
      FOR UPDATE
    `);
    if (lockedVouchers.length !== ordered.length) {
      throw new VoucherConsumptionUnavailableError('An applied voucher no longer exists.');
    }

    await transaction.voucherUserUsage.createMany({
      data: voucherIds.map((voucherId) => ({ voucherId, userId: input.userId, usedCount: 0 })),
      skipDuplicates: true,
    });
    const lockedUsages = await transaction.$queryRaw<LockedUsage[]>(Prisma.sql`
      SELECT "voucher_id" AS "voucherId", "used_count" AS "usedCount"
      FROM "voucher_user_usages"
      WHERE "user_id" = ${input.userId}::uuid
        AND "voucher_id" IN (${Prisma.join(voucherSqlIds)})
      ORDER BY "voucher_id"
      FOR UPDATE
    `);
    if (lockedUsages.length !== ordered.length) {
      throw new VoucherConsumptionUnavailableError('Voucher buyer usage is unavailable.');
    }
    const usageByVoucher = new Map(
      lockedUsages.map(({ voucherId, usedCount }) => [voucherId, usedCount]),
    );
    const voucherById = new Map(lockedVouchers.map((voucher) => [voucher.id, voucher]));
    for (const item of ordered) {
      const voucher = voucherById.get(item.voucherId)!;
      const buyerUsedCount = usageByVoucher.get(item.voucherId)!;
      if (
        !voucher.isEnabled ||
        input.evaluatedAt < voucher.startsAt ||
        input.evaluatedAt >= voucher.endsAt ||
        voucher.usedCount >= voucher.usageLimit ||
        buyerUsedCount >= voucher.perBuyerLimit
      ) {
        throw new VoucherConsumptionUnavailableError('Voucher eligibility changed at checkout.');
      }
    }

    for (const item of ordered) {
      const globalUpdated = await transaction.voucher.updateMany({
        where: {
          id: item.voucherId,
          usedCount: { lt: voucherById.get(item.voucherId)!.usageLimit },
        },
        data: { usedCount: { increment: 1 } },
      });
      const buyerUpdated = await transaction.voucherUserUsage.updateMany({
        where: {
          voucherId: item.voucherId,
          userId: input.userId,
          usedCount: { lt: voucherById.get(item.voucherId)!.perBuyerLimit },
        },
        data: { usedCount: { increment: 1 } },
      });
      if (globalUpdated.count !== 1 || buyerUpdated.count !== 1) {
        throw new VoucherConsumptionUnavailableError('Voucher usage limit changed at checkout.');
      }
    }
    await transaction.voucherRedemption.createMany({
      data: ordered.map((item) => ({
        consumptionId: consumption.id,
        voucherId: item.voucherId,
        userId: input.userId,
        merchandiseDiscountMinor: BigInt(item.merchandiseDiscountMinor),
        shippingDiscountMinor: BigInt(item.shippingDiscountMinor),
        discountMinor: BigInt(item.discountMinor),
      })),
    });
    const redemptions = await transaction.voucherRedemption.findMany({
      where: { consumptionId: consumption.id },
      select: { id: true, voucherId: true },
      orderBy: { voucherId: 'asc' },
    });
    return {
      consumptionId: consumption.id,
      created: true,
      redemptionCount: redemptions.length,
      redemptions,
    };
  }
}

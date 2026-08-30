import { Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import type { AppliedVoucherSnapshot } from './voucher-pricing.calculator';
import {
  VoucherConsumptionConflictError,
  VoucherConsumptionUnavailableError,
} from './voucher-consumption.service';

interface LockedVoucherAvailability {
  id: string;
  isEnabled: boolean;
  startsAt: Date;
  endsAt: Date;
  usageLimit: number;
  usedCount: number;
  perBuyerLimit: number;
  buyerUsedCount: number;
  heldCount: bigint;
  buyerHeldCount: bigint;
}

export interface HoldVouchersInput {
  purchaseId: string;
  userId: string;
  evaluatedAt: Date;
  applied: readonly AppliedVoucherSnapshot[];
}

@Injectable()
export class VoucherHoldService {
  async assertAvailableInTransaction(
    transaction: Prisma.TransactionClient,
    input: HoldVouchersInput,
  ): Promise<void> {
    const voucherIds = [...new Set(input.applied.map(({ voucherId }) => voucherId))].sort();
    if (voucherIds.length !== input.applied.length) {
      throw new VoucherConsumptionConflictError('Voucher hold contains duplicate definitions.');
    }
    if (voucherIds.length === 0) return;
    const voucherSqlIds = voucherIds.map((id) => Prisma.sql`${id}::uuid`);
    const rows = await transaction.$queryRaw<LockedVoucherAvailability[]>(Prisma.sql`
      SELECT
        voucher."id",
        voucher."is_enabled" AS "isEnabled",
        voucher."starts_at" AS "startsAt",
        voucher."ends_at" AS "endsAt",
        voucher."usage_limit" AS "usageLimit",
        voucher."used_count" AS "usedCount",
        voucher."per_buyer_limit" AS "perBuyerLimit",
        COALESCE(buyer_usage."used_count", 0) AS "buyerUsedCount",
        (
          SELECT count(*)
          FROM "purchase_vouchers" held_voucher
          INNER JOIN "purchases" held_purchase ON held_purchase."id" = held_voucher."purchase_id"
          INNER JOIN "payment_attempts" attempt ON attempt."purchase_id" = held_purchase."id"
          WHERE held_voucher."voucher_id" = voucher."id"
            AND held_purchase."id" <> ${input.purchaseId}::uuid
            AND attempt."status" IN (
              'pending'::"purchase_payment_status",
              'unknown'::"purchase_payment_status",
              'pending_reconciliation'::"purchase_payment_status"
            )
            AND attempt."expires_at" > clock_timestamp()
        ) AS "heldCount",
        (
          SELECT count(*)
          FROM "purchase_vouchers" held_voucher
          INNER JOIN "purchases" held_purchase ON held_purchase."id" = held_voucher."purchase_id"
          INNER JOIN "payment_attempts" attempt ON attempt."purchase_id" = held_purchase."id"
          WHERE held_voucher."voucher_id" = voucher."id"
            AND held_purchase."buyer_id" = ${input.userId}::uuid
            AND held_purchase."id" <> ${input.purchaseId}::uuid
            AND attempt."status" IN (
              'pending'::"purchase_payment_status",
              'unknown'::"purchase_payment_status",
              'pending_reconciliation'::"purchase_payment_status"
            )
            AND attempt."expires_at" > clock_timestamp()
        ) AS "buyerHeldCount"
      FROM "vouchers" voucher
      LEFT JOIN "voucher_user_usages" buyer_usage
        ON buyer_usage."voucher_id" = voucher."id"
       AND buyer_usage."user_id" = ${input.userId}::uuid
      WHERE voucher."id" IN (${Prisma.join(voucherSqlIds)})
      ORDER BY voucher."id"
      FOR UPDATE OF voucher
    `);
    if (rows.length !== voucherIds.length) {
      throw new VoucherConsumptionUnavailableError('An applied voucher is unavailable for hold.');
    }
    for (const voucher of rows) {
      const globallyUnavailable =
        BigInt(voucher.usedCount) + voucher.heldCount >= BigInt(voucher.usageLimit);
      const buyerUnavailable =
        BigInt(voucher.buyerUsedCount) + voucher.buyerHeldCount >= BigInt(voucher.perBuyerLimit);
      if (
        !voucher.isEnabled ||
        input.evaluatedAt < voucher.startsAt ||
        input.evaluatedAt >= voucher.endsAt ||
        globallyUnavailable ||
        buyerUnavailable
      ) {
        throw new VoucherConsumptionUnavailableError('Voucher capacity changed before hold.');
      }
    }
  }
}

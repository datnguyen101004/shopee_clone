-- VNPAY sandbox support and sequential payment attempts.
-- This migration is additive for existing COD/MoMo data.

ALTER TYPE "purchase_payment_method" ADD VALUE IF NOT EXISTS 'vnpay';
ALTER TYPE "payment_provider" ADD VALUE IF NOT EXISTS 'vnpay';

DROP INDEX IF EXISTS "payment_attempts_purchase_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "payment_attempts_one_active_per_purchase_key"
  ON "payment_attempts" ("purchase_id")
  WHERE "status" IN ('pending', 'unknown', 'pending_reconciliation');

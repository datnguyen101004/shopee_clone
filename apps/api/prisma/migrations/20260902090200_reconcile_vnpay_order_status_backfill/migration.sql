-- Reconcile legacy VNPAY rows that were created before PENDING_PAYMENT existed.
-- This migration is additive and keeps already-terminal logistics states intact.

UPDATE "payment_attempts" AS pa
SET "status" = p."payment_status"
FROM "purchases" AS p
WHERE pa."purchase_id" = p."id"
  AND p."payment_method" = 'vnpay'
  AND pa."status" IN ('pending', 'unknown', 'pending_reconciliation')
  AND p."payment_status" IN ('pending', 'unknown', 'pending_reconciliation', 'paid', 'failed', 'cancelled', 'expired');

UPDATE "shop_orders" AS so
SET "payment_status" = p."payment_status"
FROM "purchases" AS p
WHERE so."purchase_id" = p."id"
  AND p."payment_method" = 'vnpay'
  AND so."payment_status" IS DISTINCT FROM p."payment_status";

UPDATE "shop_orders" AS so
SET "status" = 'pending_payment'
FROM "purchases" AS p
WHERE so."purchase_id" = p."id"
  AND p."payment_method" = 'vnpay'
  AND p."payment_status" IN ('pending', 'unknown', 'pending_reconciliation')
  AND so."status" NOT IN ('delivered', 'cancelled', 'returned', 'refunded');

UPDATE "shop_orders" AS so
SET "status" = 'pending_confirmation'
FROM "purchases" AS p
WHERE so."purchase_id" = p."id"
  AND p."payment_method" = 'vnpay'
  AND p."payment_status" = 'paid'
  AND so."status" = 'pending_payment';

UPDATE "shop_orders" AS so
SET "status" = 'cancelled'
FROM "purchases" AS p
WHERE so."purchase_id" = p."id"
  AND p."payment_method" = 'vnpay'
  AND p."payment_status" IN ('failed', 'cancelled', 'expired')
  AND so."status" IN ('pending_payment', 'pending_confirmation');

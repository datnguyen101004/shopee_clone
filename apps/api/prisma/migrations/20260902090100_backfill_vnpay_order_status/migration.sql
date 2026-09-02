-- The enum value is committed by the preceding migration before it is used.
-- Existing VNPAY rows are derived from authoritative Purchase payment state.
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
  AND so."status" = 'pending_payment';

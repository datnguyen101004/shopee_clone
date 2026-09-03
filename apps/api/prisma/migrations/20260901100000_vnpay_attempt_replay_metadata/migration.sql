-- Immutable metadata for deterministic VNPAY redirect replay and retry idempotency.
-- Nullable columns preserve existing COD/MoMo attempts.

ALTER TABLE "payment_attempts"
  ADD COLUMN IF NOT EXISTS "provider_created_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "idempotency_key" UUID,
  ADD COLUMN IF NOT EXISTS "request_digest" CHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_attempts_purchase_idempotency_key"
  ON "payment_attempts" ("purchase_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- VNPAY sandbox accepts payment attempts up to 500,000,000 VND.
-- The original MoMo-only constraint capped all attempts at 50,000,000 VND.
ALTER TABLE "payment_attempts"
  DROP CONSTRAINT IF EXISTS "payment_attempts_amount_check";

ALTER TABLE "payment_attempts"
  ADD CONSTRAINT "payment_attempts_amount_check"
  CHECK ("amount_minor" BETWEEN 1000 AND 500000000);

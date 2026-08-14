ALTER TABLE "purchase_vouchers"
ADD COLUMN "redemption_id" UUID;

CREATE UNIQUE INDEX "purchase_vouchers_redemption_id_key"
ON "purchase_vouchers"("redemption_id");

ALTER TABLE "purchase_vouchers"
ADD CONSTRAINT "purchase_vouchers_redemption_id_fkey"
FOREIGN KEY ("redemption_id") REFERENCES "voucher_redemptions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

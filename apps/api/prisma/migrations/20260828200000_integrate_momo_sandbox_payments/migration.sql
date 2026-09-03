-- MoMo remains sandbox-only. This migration is additive and leaves existing COD
-- purchases and fulfillment data unchanged. Enum values were committed by the
-- preceding migration so they can safely be used as defaults here.

CREATE TABLE "payment_attempts" (
  "id" UUID NOT NULL,
  "public_reference" UUID NOT NULL,
  "purchase_id" UUID NOT NULL,
  "provider" "payment_provider" NOT NULL DEFAULT 'momo',
  "environment" "payment_environment" NOT NULL DEFAULT 'sandbox',
  "order_id" VARCHAR(64) NOT NULL,
  "request_id" VARCHAR(50) NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "status" "purchase_payment_status" NOT NULL DEFAULT 'pending',
  "provider_transaction_id" BIGINT,
  "last_result_code" INTEGER,
  "last_result_class" VARCHAR(32),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "create_requested_at" TIMESTAMPTZ(3),
  "instructions_issued_at" TIMESTAMPTZ(3),
  "last_observed_at" TIMESTAMPTZ(3),
  "next_reconcile_at" TIMESTAMPTZ(3),
  "reconcile_attempts" INTEGER NOT NULL DEFAULT 0,
  "lease_expires_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_attempts_amount_check" CHECK ("amount_minor" BETWEEN 1000 AND 50000000),
  CONSTRAINT "payment_attempts_currency_check" CHECK ("currency" = 'VND'),
  CONSTRAINT "payment_attempts_order_id_check" CHECK (char_length("order_id") BETWEEN 1 AND 64),
  CONSTRAINT "payment_attempts_request_id_check" CHECK (char_length("request_id") BETWEEN 1 AND 50),
  CONSTRAINT "payment_attempts_reconcile_attempts_check" CHECK ("reconcile_attempts" >= 0),
  CONSTRAINT "payment_attempts_version_check" CHECK ("version" >= 0),
  CONSTRAINT "payment_attempts_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "payment_attempts_purchase_id_fkey"
    FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_attempts_public_reference_key"
  ON "payment_attempts"("public_reference");
CREATE UNIQUE INDEX "payment_attempts_purchase_id_key"
  ON "payment_attempts"("purchase_id");
CREATE UNIQUE INDEX "payment_attempts_provider_order_id_key"
  ON "payment_attempts"("provider", "order_id");
CREATE UNIQUE INDEX "payment_attempts_provider_request_id_key"
  ON "payment_attempts"("provider", "request_id");
CREATE UNIQUE INDEX "payment_attempts_provider_provider_transaction_id_key"
  ON "payment_attempts"("provider", "provider_transaction_id");
CREATE INDEX "payment_attempts_status_next_reconcile_at_id_idx"
  ON "payment_attempts"("status", "next_reconcile_at", "id");
CREATE INDEX "payment_attempts_expires_at_status_id_idx"
  ON "payment_attempts"("expires_at", "status", "id");

CREATE TABLE "payment_events" (
  "id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "source" "payment_event_source" NOT NULL,
  "dedupe_key" CHAR(64) NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "result_code" INTEGER,
  "result_class" VARCHAR(32) NOT NULL,
  "observed_status" "purchase_payment_status",
  "provider_transaction_id" BIGINT,
  "sanitized_metadata" JSONB NOT NULL,
  "decision" "payment_event_decision" NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(3),
  CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_events_dedupe_key_check" CHECK ("dedupe_key" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "payment_events_fingerprint_check" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "payment_events_result_class_check" CHECK (char_length("result_class") BETWEEN 1 AND 32),
  CONSTRAINT "payment_events_metadata_check" CHECK (jsonb_typeof("sanitized_metadata") = 'object'),
  CONSTRAINT "payment_events_processed_at_check" CHECK (
    "processed_at" IS NULL OR "processed_at" >= "received_at"
  ),
  CONSTRAINT "payment_events_attempt_id_fkey"
    FOREIGN KEY ("attempt_id") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_events_dedupe_key_key"
  ON "payment_events"("dedupe_key");
CREATE INDEX "payment_events_attempt_id_received_at_id_idx"
  ON "payment_events"("attempt_id", "received_at", "id");
CREATE INDEX "payment_events_source_result_class_received_at_idx"
  ON "payment_events"("source", "result_class", "received_at");

CREATE TABLE "payment_refunds" (
  "id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "provider" "payment_provider" NOT NULL DEFAULT 'momo',
  "order_id" VARCHAR(64) NOT NULL,
  "request_id" VARCHAR(50) NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "status" "payment_refund_status" NOT NULL DEFAULT 'pending',
  "provider_transaction_id" BIGINT,
  "last_result_code" INTEGER,
  "last_result_class" VARCHAR(32),
  "requested_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "next_reconcile_at" TIMESTAMPTZ(3),
  "reconcile_attempts" INTEGER NOT NULL DEFAULT 0,
  "lease_expires_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_refunds_amount_check" CHECK ("amount_minor" BETWEEN 1 AND 50000000),
  CONSTRAINT "payment_refunds_currency_check" CHECK ("currency" = 'VND'),
  CONSTRAINT "payment_refunds_order_id_check" CHECK (char_length("order_id") BETWEEN 1 AND 64),
  CONSTRAINT "payment_refunds_request_id_check" CHECK (char_length("request_id") BETWEEN 1 AND 50),
  CONSTRAINT "payment_refunds_reconcile_attempts_check" CHECK ("reconcile_attempts" >= 0),
  CONSTRAINT "payment_refunds_version_check" CHECK ("version" >= 0),
  CONSTRAINT "payment_refunds_completed_at_check" CHECK (
    "completed_at" IS NULL OR "requested_at" IS NULL OR "completed_at" >= "requested_at"
  ),
  CONSTRAINT "payment_refunds_attempt_id_fkey"
    FOREIGN KEY ("attempt_id") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_refunds_provider_order_id_key"
  ON "payment_refunds"("provider", "order_id");
CREATE UNIQUE INDEX "payment_refunds_provider_request_id_key"
  ON "payment_refunds"("provider", "request_id");
CREATE UNIQUE INDEX "payment_refunds_provider_provider_transaction_id_key"
  ON "payment_refunds"("provider", "provider_transaction_id");
CREATE INDEX "payment_refunds_attempt_id_created_at_id_idx"
  ON "payment_refunds"("attempt_id", "created_at", "id");
CREATE INDEX "payment_refunds_status_next_reconcile_at_id_idx"
  ON "payment_refunds"("status", "next_reconcile_at", "id");

-- Existing rows already use the legacy defaults COD + UNPAID. The explicit
-- invariant check makes accidental historical rewrites fail the migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "purchases"
    WHERE "payment_method" <> 'cod' OR "payment_status" <> 'unpaid'
  ) THEN
    RAISE EXCEPTION 'Unexpected non-COD purchase found before enabling MoMo sandbox';
  END IF;
END
$$;

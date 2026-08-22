-- T29 is entirely additive. Existing purchases and shop orders remain untouched.
ALTER TYPE "privileged_target_type" ADD VALUE IF NOT EXISTS 'return_request';
ALTER TYPE "privileged_action" ADD VALUE IF NOT EXISTS 'approve_return';
ALTER TYPE "privileged_action" ADD VALUE IF NOT EXISTS 'approve_refund';

CREATE TYPE "return_status" AS ENUM (
  'requested', 'awaiting_return', 'in_transit', 'escalated',
  'cancelled', 'expired', 'rejected', 'refunded'
);
CREATE TYPE "return_reason_code" AS ENUM (
  'damaged', 'wrong_item', 'missing_item', 'not_as_described', 'other'
);
CREATE TYPE "return_actor_type" AS ENUM ('buyer', 'seller', 'admin', 'system');
CREATE TYPE "return_action" AS ENUM (
  'create', 'cancel', 'submit_shipment', 'accept_return', 'reject_and_escalate',
  'escalate', 'confirm_receipt', 'approve_return', 'approve_refund', 'reject',
  'expire_shipment', 'escalate_deadline'
);
CREATE TYPE "return_evidence_state" AS ENUM ('staged', 'attached');
CREATE TYPE "refund_ledger_kind" AS ENUM ('mock_credit');

CREATE TABLE "return_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "buyer_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "status" "return_status" NOT NULL DEFAULT 'requested',
  "version" INTEGER NOT NULL DEFAULT 0,
  "reason_code" "return_reason_code" NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "policy_version" VARCHAR(40) NOT NULL DEFAULT 'returns-v1',
  "eligibility_deadline_at" TIMESTAMPTZ(3) NOT NULL,
  "seller_response_deadline_at" TIMESTAMPTZ(3),
  "shipment_deadline_at" TIMESTAMPTZ(3),
  "receipt_deadline_at" TIMESTAMPTZ(3),
  "refund_amount_minor" BIGINT NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "idempotency_key" UUID NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_requests_order_id_key" UNIQUE ("order_id"),
  CONSTRAINT "return_requests_buyer_id_idempotency_key_key" UNIQUE ("buyer_id", "idempotency_key"),
  CONSTRAINT "return_requests_version_non_negative_check" CHECK ("version" >= 0),
  CONSTRAINT "return_requests_amount_non_negative_check" CHECK ("refund_amount_minor" >= 0),
  CONSTRAINT "return_requests_currency_check" CHECK ("currency" = 'VND'),
  CONSTRAINT "return_requests_policy_check" CHECK (char_length(trim("policy_version")) > 0),
  CONSTRAINT "return_requests_description_check" CHECK (
    char_length(trim("description")) BETWEEN 20 AND 1000
    AND "description" = btrim("description")
    AND "description" !~ E'[\\x00-\\x1F\\x7F]'
  ),
  CONSTRAINT "return_requests_digest_check" CHECK ("request_digest" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "return_request_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "return_request_id" UUID NOT NULL,
  "order_line_id" UUID NOT NULL,
  "requested_quantity" INTEGER NOT NULL,
  "purchased_quantity" INTEGER NOT NULL,
  "payable_minor" BIGINT NOT NULL,
  "refund_minor" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_request_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_request_items_request_line_key" UNIQUE ("return_request_id", "order_line_id"),
  CONSTRAINT "return_request_items_quantity_check" CHECK (
    "requested_quantity" > 0 AND "purchased_quantity" > 0 AND "requested_quantity" <= "purchased_quantity"
  ),
  CONSTRAINT "return_request_items_money_check" CHECK (
    "payable_minor" >= 0 AND "refund_minor" >= 0 AND "refund_minor" <= "payable_minor"
  )
);

CREATE TABLE "return_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "return_request_id" UUID NOT NULL,
  "previous_status" "return_status",
  "status" "return_status" NOT NULL,
  "version" INTEGER NOT NULL,
  "actor_type" "return_actor_type" NOT NULL,
  "actor_user_id" UUID,
  "action" "return_action" NOT NULL,
  "reason_code" VARCHAR(80) NOT NULL,
  "public_reason" VARCHAR(500),
  "idempotency_key" UUID NOT NULL,
  "request_digest" CHAR(64) NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_events_request_version_key" UNIQUE ("return_request_id", "version"),
  CONSTRAINT "return_events_request_idempotency_key_key" UNIQUE ("return_request_id", "idempotency_key"),
  CONSTRAINT "return_events_version_non_negative_check" CHECK ("version" >= 0),
  CONSTRAINT "return_events_actor_identity_check" CHECK (
    ("actor_type" = 'system' AND "actor_user_id" IS NULL)
    OR ("actor_type" <> 'system' AND "actor_user_id" IS NOT NULL)
  ),
  CONSTRAINT "return_events_reason_check" CHECK (
    char_length(trim("reason_code")) > 0
    AND ("public_reason" IS NULL OR (char_length(trim("public_reason")) BETWEEN 8 AND 500 AND "public_reason" = btrim("public_reason")))
  ),
  CONSTRAINT "return_events_digest_check" CHECK ("request_digest" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "return_evidence_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "uploader_id" UUID NOT NULL,
  "return_request_id" UUID,
  "storage_key" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(32) NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "state" "return_evidence_state" NOT NULL DEFAULT 'staged',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_evidence_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_evidence_assets_storage_key_key" UNIQUE ("storage_key"),
  CONSTRAINT "return_evidence_assets_request_sort_order_key" UNIQUE ("return_request_id", "sort_order"),
  CONSTRAINT "return_evidence_assets_media_check" CHECK (
    "mime_type" IN ('image/jpeg', 'image/png', 'image/webp')
    AND "byte_size" > 0 AND "byte_size" <= 5242880
    AND "width" > 0 AND "width" <= 8000 AND "height" > 0 AND "height" <= 8000
  ),
  CONSTRAINT "return_evidence_assets_state_shape_check" CHECK (
    ("state" = 'staged' AND "return_request_id" IS NULL AND "expires_at" IS NOT NULL)
    OR ("state" = 'attached' AND "return_request_id" IS NOT NULL AND "expires_at" IS NULL)
  ),
  CONSTRAINT "return_evidence_assets_sort_order_check" CHECK ("sort_order" >= 0)
);

CREATE TABLE "return_shipments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "return_request_id" UUID NOT NULL,
  "tracking_code" VARCHAR(80) NOT NULL,
  "destination" JSONB NOT NULL,
  "submitted_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_shipments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_shipments_return_request_id_key" UNIQUE ("return_request_id"),
  CONSTRAINT "return_shipments_tracking_code_key" UNIQUE ("tracking_code"),
  CONSTRAINT "return_shipments_tracking_code_check" CHECK ("tracking_code" ~ '^MOCK-[A-F0-9]{16}$')
);

CREATE TABLE "return_decisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "return_request_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "decision" "return_action" NOT NULL,
  "public_reason" VARCHAR(500) NOT NULL,
  "internal_note" VARCHAR(1000),
  "correlation_id" UUID NOT NULL,
  "decided_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "return_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "return_decisions_event_id_key" UNIQUE ("event_id"),
  CONSTRAINT "return_decisions_correlation_id_key" UNIQUE ("correlation_id"),
  CONSTRAINT "return_decisions_action_check" CHECK ("decision" IN ('approve_return', 'approve_refund', 'reject')),
  CONSTRAINT "return_decisions_public_reason_check" CHECK (char_length(trim("public_reason")) BETWEEN 8 AND 500 AND "public_reason" = btrim("public_reason")),
  CONSTRAINT "return_decisions_internal_note_check" CHECK ("internal_note" IS NULL OR (char_length(trim("internal_note")) <= 1000 AND "internal_note" = btrim("internal_note")))
);

CREATE TABLE "refund_ledger_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "return_request_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "buyer_id" UUID NOT NULL,
  "shop_id" UUID NOT NULL,
  "kind" "refund_ledger_kind" NOT NULL DEFAULT 'mock_credit',
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "amount_minor" BIGINT NOT NULL,
  "allocations" JSONB NOT NULL,
  "actor_type" "return_actor_type" NOT NULL,
  "actor_user_id" UUID,
  "public_reason" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refund_ledger_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refund_ledger_entries_return_request_id_key" UNIQUE ("return_request_id"),
  CONSTRAINT "refund_ledger_entries_currency_amount_check" CHECK ("currency" = 'VND' AND "amount_minor" >= 0),
  CONSTRAINT "refund_ledger_entries_actor_identity_check" CHECK (
    ("actor_type" = 'system' AND "actor_user_id" IS NULL)
    OR ("actor_type" <> 'system' AND "actor_user_id" IS NOT NULL)
  ),
  CONSTRAINT "refund_ledger_entries_reason_check" CHECK (char_length(trim("public_reason")) BETWEEN 8 AND 500 AND "public_reason" = btrim("public_reason"))
);

ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_request_items" ADD CONSTRAINT "return_request_items_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_request_items" ADD CONSTRAINT "return_request_items_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_events" ADD CONSTRAINT "return_events_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_events" ADD CONSTRAINT "return_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_evidence_assets" ADD CONSTRAINT "return_evidence_assets_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_evidence_assets" ADD CONSTRAINT "return_evidence_assets_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_shipments" ADD CONSTRAINT "return_shipments_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_decisions" ADD CONSTRAINT "return_decisions_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_decisions" ADD CONSTRAINT "return_decisions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "return_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_decisions" ADD CONSTRAINT "return_decisions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_ledger_entries" ADD CONSTRAINT "refund_ledger_entries_return_request_id_fkey" FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_ledger_entries" ADD CONSTRAINT "refund_ledger_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_ledger_entries" ADD CONSTRAINT "refund_ledger_entries_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refund_ledger_entries" ADD CONSTRAINT "refund_ledger_entries_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "privileged_audit_events" ADD COLUMN "return_decision_id" UUID;
ALTER TABLE "privileged_audit_events" ADD CONSTRAINT "privileged_audit_events_return_decision_id_fkey" FOREIGN KEY ("return_decision_id") REFERENCES "return_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "return_requests_buyer_updated_id_idx" ON "return_requests"("buyer_id", "updated_at" DESC, "id" DESC);
CREATE INDEX "return_requests_shop_updated_id_idx" ON "return_requests"("shop_id", "updated_at" DESC, "id" DESC);
CREATE INDEX "return_requests_status_updated_id_idx" ON "return_requests"("status", "updated_at" DESC, "id" DESC);
CREATE INDEX "return_requests_seller_deadline_status_idx" ON "return_requests"("seller_response_deadline_at", "status");
CREATE INDEX "return_requests_shipment_deadline_status_idx" ON "return_requests"("shipment_deadline_at", "status");
CREATE INDEX "return_requests_receipt_deadline_status_idx" ON "return_requests"("receipt_deadline_at", "status");
CREATE INDEX "return_request_items_order_line_id_idx" ON "return_request_items"("order_line_id");
CREATE INDEX "return_events_request_occurred_id_idx" ON "return_events"("return_request_id", "occurred_at", "id");
CREATE INDEX "return_events_actor_occurred_id_idx" ON "return_events"("actor_user_id", "occurred_at", "id");
CREATE INDEX "return_evidence_assets_uploader_state_expiry_idx" ON "return_evidence_assets"("uploader_id", "state", "expires_at");
CREATE INDEX "return_evidence_assets_state_expiry_idx" ON "return_evidence_assets"("state", "expires_at");
CREATE INDEX "return_decisions_request_decided_id_idx" ON "return_decisions"("return_request_id", "decided_at", "id");
CREATE INDEX "return_decisions_actor_decided_id_idx" ON "return_decisions"("actor_user_id", "decided_at", "id");
CREATE INDEX "refund_ledger_entries_order_id_idx" ON "refund_ledger_entries"("order_id");
CREATE INDEX "refund_ledger_entries_buyer_created_id_idx" ON "refund_ledger_entries"("buyer_id", "created_at", "id");
CREATE INDEX "refund_ledger_entries_shop_created_id_idx" ON "refund_ledger_entries"("shop_id", "created_at", "id");
CREATE INDEX "privileged_audit_events_return_decision_id_idx" ON "privileged_audit_events"("return_decision_id");

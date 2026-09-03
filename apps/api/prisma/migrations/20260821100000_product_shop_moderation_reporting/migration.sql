-- AlterEnum
ALTER TYPE "privileged_target_type" ADD VALUE IF NOT EXISTS 'review';
ALTER TYPE "privileged_target_type" ADD VALUE IF NOT EXISTS 'moderation_case';

-- AlterEnum
ALTER TYPE "privileged_action" ADD VALUE IF NOT EXISTS 'hide';
ALTER TYPE "privileged_action" ADD VALUE IF NOT EXISTS 'no_action';

-- CreateEnum
CREATE TYPE "report_target_type" AS ENUM ('product', 'shop');

-- CreateEnum
CREATE TYPE "report_reason_code" AS ENUM (
    'prohibited_item',
    'counterfeit',
    'misleading_information',
    'inappropriate_content',
    'fraud_scam',
    'abusive_behavior',
    'prohibited_seller',
    'other'
);

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('submitted', 'reviewed');

-- CreateEnum
CREATE TYPE "moderation_case_status" AS ENUM ('open', 'in_review', 'resolved');

-- CreateEnum
CREATE TYPE "moderation_case_outcome" AS ENUM ('no_action', 'suspend_target', 'restore_target');

-- CreateEnum
CREATE TYPE "moderation_case_event_type" AS ENUM (
    'report_attached',
    'assigned',
    'unassigned',
    'note_added',
    'decision_made',
    'decision_reversed'
);

-- CreateEnum
CREATE TYPE "seller_moderation_notice_action" AS ENUM (
    'product_suspended',
    'product_restored',
    'shop_suspended',
    'shop_restored'
);

-- CreateTable: moderation_cases
CREATE TABLE "moderation_cases" (
    "id" UUID NOT NULL,
    "target_type" "report_target_type" NOT NULL,
    "product_id" UUID,
    "shop_id" UUID,
    "target_snapshot" JSONB NOT NULL,
    "status" "moderation_case_status" NOT NULL DEFAULT 'open',
    "report_count" INTEGER NOT NULL DEFAULT 1,
    "primary_reason" "report_reason_code" NOT NULL,
    "assigned_admin_id" UUID,
    "current_outcome" "moderation_case_outcome",
    "version" INTEGER NOT NULL DEFAULT 0,
    "first_report_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_cases_pkey" PRIMARY KEY ("id")
);

-- Exactly-one-target constraint for moderation_cases
ALTER TABLE "moderation_cases"
    ADD CONSTRAINT "moderation_cases_target_type_check"
    CHECK (
        ("target_type" = 'product' AND "product_id" IS NOT NULL AND "shop_id" IS NULL) OR
        ("target_type" = 'shop' AND "shop_id" IS NOT NULL AND "product_id" IS NULL)
    );

-- Partial unique indexes for active moderation cases (one open/in_review case per product/shop)
CREATE UNIQUE INDEX "moderation_cases_active_product_unique_idx"
    ON "moderation_cases"("product_id")
    WHERE "status" != 'resolved';

CREATE UNIQUE INDEX "moderation_cases_active_shop_unique_idx"
    ON "moderation_cases"("shop_id")
    WHERE "status" != 'resolved';

-- Standard indexes for moderation_cases
CREATE INDEX "moderation_cases_status_last_activity_at_id_idx"
    ON "moderation_cases"("status", "last_activity_at" DESC, "id");

CREATE INDEX "moderation_cases_target_type_last_activity_at_idx"
    ON "moderation_cases"("target_type", "last_activity_at" DESC);

CREATE INDEX "moderation_cases_assigned_admin_id_status_idx"
    ON "moderation_cases"("assigned_admin_id", "status");

CREATE INDEX "moderation_cases_product_id_idx"
    ON "moderation_cases"("product_id");

CREATE INDEX "moderation_cases_shop_id_idx"
    ON "moderation_cases"("shop_id");

-- Foreign keys for moderation_cases
ALTER TABLE "moderation_cases"
    ADD CONSTRAINT "moderation_cases_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "moderation_cases"
    ADD CONSTRAINT "moderation_cases_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "moderation_cases"
    ADD CONSTRAINT "moderation_cases_assigned_admin_id_fkey"
    FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: user_reports
CREATE TABLE "user_reports" (
    "id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "target_type" "report_target_type" NOT NULL,
    "product_id" UUID,
    "shop_id" UUID,
    "reason_code" "report_reason_code" NOT NULL,
    "details" VARCHAR(1000) NOT NULL,
    "target_snapshot" JSONB NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "status" "report_status" NOT NULL DEFAULT 'submitted',
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- Exactly-one-target and details bounds checks for user_reports
ALTER TABLE "user_reports"
    ADD CONSTRAINT "user_reports_target_type_check"
    CHECK (
        ("target_type" = 'product' AND "product_id" IS NOT NULL AND "shop_id" IS NULL) OR
        ("target_type" = 'shop' AND "shop_id" IS NOT NULL AND "product_id" IS NULL)
    );

ALTER TABLE "user_reports"
    ADD CONSTRAINT "user_reports_details_length_check"
    CHECK (char_length(trim("details")) >= 20 AND char_length("details") <= 1000);

-- Unique index for reporter idempotency
CREATE UNIQUE INDEX "user_reports_reporter_user_id_idempotency_key_key"
    ON "user_reports"("reporter_user_id", "idempotency_key");

-- Partial unique indexes: one unresolved report per reporter and product/shop
CREATE UNIQUE INDEX "user_reports_active_reporter_product_unique_idx"
    ON "user_reports"("reporter_user_id", "product_id")
    WHERE "status" = 'submitted';

CREATE UNIQUE INDEX "user_reports_active_reporter_shop_unique_idx"
    ON "user_reports"("reporter_user_id", "shop_id")
    WHERE "status" = 'submitted';

-- Standard indexes for user_reports
CREATE INDEX "user_reports_reporter_user_id_created_at_id_idx"
    ON "user_reports"("reporter_user_id", "created_at" DESC, "id");

CREATE INDEX "user_reports_case_id_created_at_idx"
    ON "user_reports"("case_id", "created_at");

CREATE INDEX "user_reports_product_id_idx"
    ON "user_reports"("product_id");

CREATE INDEX "user_reports_shop_id_idx"
    ON "user_reports"("shop_id");

-- Foreign keys for user_reports
ALTER TABLE "user_reports"
    ADD CONSTRAINT "user_reports_reporter_user_id_fkey"
    FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_reports"
    ADD CONSTRAINT "user_reports_case_id_fkey"
    FOREIGN KEY ("case_id") REFERENCES "moderation_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_reports"
    ADD CONSTRAINT "user_reports_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_reports"
    ADD CONSTRAINT "user_reports_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: report_evidence_references
CREATE TABLE "report_evidence_references" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_evidence_references_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "report_evidence_references"
    ADD CONSTRAINT "report_evidence_references_url_https_check"
    CHECK ("url" LIKE 'https://%');

CREATE UNIQUE INDEX "report_evidence_references_report_id_sort_order_key"
    ON "report_evidence_references"("report_id", "sort_order");

ALTER TABLE "report_evidence_references"
    ADD CONSTRAINT "report_evidence_references_report_id_fkey"
    FOREIGN KEY ("report_id") REFERENCES "user_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: moderation_case_events
CREATE TABLE "moderation_case_events" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "event_type" "moderation_case_event_type" NOT NULL,
    "actor_user_id" UUID,
    "version" INTEGER NOT NULL,
    "note" VARCHAR(2000),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_case_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "moderation_case_events_case_id_created_at_id_idx"
    ON "moderation_case_events"("case_id", "created_at", "id");

CREATE INDEX "moderation_case_events_actor_user_id_created_at_idx"
    ON "moderation_case_events"("actor_user_id", "created_at");

ALTER TABLE "moderation_case_events"
    ADD CONSTRAINT "moderation_case_events_case_id_fkey"
    FOREIGN KEY ("case_id") REFERENCES "moderation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "moderation_case_events"
    ADD CONSTRAINT "moderation_case_events_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: moderation_decisions
CREATE TABLE "moderation_decisions" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "outcome" "moderation_case_outcome" NOT NULL,
    "public_reason" VARCHAR(240) NOT NULL,
    "private_note" VARCHAR(2000),
    "previous_target_status" VARCHAR(50) NOT NULL,
    "next_target_status" VARCHAR(50) NOT NULL,
    "reverses_decision_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_decisions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "moderation_decisions"
    ADD CONSTRAINT "moderation_decisions_public_reason_length_check"
    CHECK (char_length(trim("public_reason")) >= 8 AND char_length("public_reason") <= 240);

CREATE INDEX "moderation_decisions_case_id_created_at_idx"
    ON "moderation_decisions"("case_id", "created_at" DESC);

CREATE INDEX "moderation_decisions_actor_user_id_created_at_idx"
    ON "moderation_decisions"("actor_user_id", "created_at");

CREATE INDEX "moderation_decisions_reverses_decision_id_idx"
    ON "moderation_decisions"("reverses_decision_id");

ALTER TABLE "moderation_decisions"
    ADD CONSTRAINT "moderation_decisions_case_id_fkey"
    FOREIGN KEY ("case_id") REFERENCES "moderation_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "moderation_decisions"
    ADD CONSTRAINT "moderation_decisions_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "moderation_decisions"
    ADD CONSTRAINT "moderation_decisions_reverses_decision_id_fkey"
    FOREIGN KEY ("reverses_decision_id") REFERENCES "moderation_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: moderation_commands
CREATE TABLE "moderation_commands" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "resource_type" VARCHAR(60) NOT NULL,
    "resource_id" UUID NOT NULL,
    "action_name" VARCHAR(60) NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "moderation_commands_actor_user_id_idempotency_key_key"
    ON "moderation_commands"("actor_user_id", "idempotency_key");

CREATE INDEX "moderation_commands_resource_type_resource_id_idx"
    ON "moderation_commands"("resource_type", "resource_id");

ALTER TABLE "moderation_commands"
    ADD CONSTRAINT "moderation_commands_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: report_rate_limit_events
CREATE TABLE "report_rate_limit_events" (
    "id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_rate_limit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "report_rate_limit_events_reporter_user_id_attempted_at_idx"
    ON "report_rate_limit_events"("reporter_user_id", "attempted_at" DESC);

CREATE INDEX "report_rate_limit_events_attempted_at_idx"
    ON "report_rate_limit_events"("attempted_at");

ALTER TABLE "report_rate_limit_events"
    ADD CONSTRAINT "report_rate_limit_events_reporter_user_id_fkey"
    FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: seller_moderation_notices
CREATE TABLE "seller_moderation_notices" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "target_type" "report_target_type" NOT NULL,
    "product_id" UUID,
    "shop_id" UUID,
    "target_snapshot" JSONB NOT NULL,
    "action" "seller_moderation_notice_action" NOT NULL,
    "reason" VARCHAR(240) NOT NULL,
    "decision_id" UUID,
    "read_at" TIMESTAMPTZ(3),
    "effective_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_moderation_notices_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "seller_moderation_notices"
    ADD CONSTRAINT "seller_moderation_notices_reason_length_check"
    CHECK (char_length(trim("reason")) >= 8 AND char_length("reason") <= 240);

CREATE UNIQUE INDEX "seller_moderation_notices_decision_id_key"
    ON "seller_moderation_notices"("decision_id");

CREATE INDEX "seller_moderation_notices_owner_read_effective_idx"
    ON "seller_moderation_notices"("owner_user_id", "read_at", "effective_at" DESC);

CREATE INDEX "seller_moderation_notices_owner_effective_idx"
    ON "seller_moderation_notices"("owner_user_id", "effective_at" DESC);

CREATE INDEX "seller_moderation_notices_product_id_idx"
    ON "seller_moderation_notices"("product_id");

CREATE INDEX "seller_moderation_notices_shop_id_idx"
    ON "seller_moderation_notices"("shop_id");

ALTER TABLE "seller_moderation_notices"
    ADD CONSTRAINT "seller_moderation_notices_owner_user_id_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "seller_moderation_notices"
    ADD CONSTRAINT "seller_moderation_notices_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "seller_moderation_notices"
    ADD CONSTRAINT "seller_moderation_notices_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "seller_moderation_notices"
    ADD CONSTRAINT "seller_moderation_notices_decision_id_fkey"
    FOREIGN KEY ("decision_id") REFERENCES "moderation_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: privileged_audit_events
ALTER TABLE "privileged_audit_events"
    ADD COLUMN "decision_id" UUID,
    ADD COLUMN "review_moderation_event_id" UUID;

CREATE INDEX "privileged_audit_events_decision_id_idx"
    ON "privileged_audit_events"("decision_id");

CREATE INDEX "privileged_audit_events_review_moderation_event_id_idx"
    ON "privileged_audit_events"("review_moderation_event_id");

ALTER TABLE "privileged_audit_events"
    ADD CONSTRAINT "privileged_audit_events_decision_id_fkey"
    FOREIGN KEY ("decision_id") REFERENCES "moderation_decisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "privileged_audit_events"
    ADD CONSTRAINT "privileged_audit_events_review_moderation_event_id_fkey"
    FOREIGN KEY ("review_moderation_event_id") REFERENCES "review_moderation_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

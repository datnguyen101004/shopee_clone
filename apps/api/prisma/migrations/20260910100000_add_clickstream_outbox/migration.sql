-- Additive, disabled-by-default clickstream export outbox.
CREATE TYPE "clickstream_outbox_status" AS ENUM ('pending', 'leased', 'delivered', 'terminal', 'dropped');

CREATE TABLE "clickstream_outbox" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "surface" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "status" "clickstream_outbox_status" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_owner" UUID,
    "lease_until" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(3),
    "terminal_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error_code" VARCHAR(64),
    "last_http_status" INTEGER,
    CONSTRAINT "clickstream_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clickstream_outbox_event_id_key" ON "clickstream_outbox"("event_id");
CREATE INDEX "clickstream_outbox_status_next_attempt_at_accepted_at_idx" ON "clickstream_outbox"("status", "next_attempt_at", "accepted_at");
CREATE INDEX "clickstream_outbox_status_lease_until_idx" ON "clickstream_outbox"("status", "lease_until");
CREATE INDEX "clickstream_outbox_expires_at_idx" ON "clickstream_outbox"("expires_at");

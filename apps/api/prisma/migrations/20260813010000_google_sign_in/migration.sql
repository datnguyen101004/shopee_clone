CREATE TYPE "external_identity_provider" AS ENUM ('google');

CREATE TABLE "external_identities" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" "external_identity_provider" NOT NULL,
  "provider_subject" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_login_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_identities_subject_not_blank"
    CHECK (length("provider_subject") > 0),
  CONSTRAINT "external_identities_valid_last_login"
    CHECK ("last_login_at" >= "created_at")
);

CREATE TABLE "google_login_attempts" (
  "id" UUID NOT NULL,
  "state_hash" CHAR(64) NOT NULL,
  "browser_binding_hash" CHAR(64) NOT NULL,
  "nonce_hash" CHAR(64) NOT NULL,
  "protected_payload" TEXT NOT NULL,
  "return_to" VARCHAR(500) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "google_login_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "google_login_attempts_state_hash_format"
    CHECK ("state_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "google_login_attempts_browser_hash_format"
    CHECK ("browser_binding_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "google_login_attempts_nonce_hash_format"
    CHECK ("nonce_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "google_login_attempts_return_to_local"
    CHECK ("return_to" = '/' OR "return_to" ~ '^/products/[0-9a-f-]{36}$'),
  CONSTRAINT "google_login_attempts_valid_expiry"
    CHECK ("expires_at" > "created_at"),
  CONSTRAINT "google_login_attempts_valid_consumption"
    CHECK ("consumed_at" IS NULL OR "consumed_at" >= "created_at")
);

CREATE UNIQUE INDEX "external_identities_provider_provider_subject_key"
  ON "external_identities"("provider", "provider_subject");
CREATE UNIQUE INDEX "external_identities_provider_user_id_key"
  ON "external_identities"("provider", "user_id");
CREATE INDEX "external_identities_user_id_idx" ON "external_identities"("user_id");

CREATE UNIQUE INDEX "google_login_attempts_state_hash_key"
  ON "google_login_attempts"("state_hash");
CREATE INDEX "google_login_attempts_expires_at_idx"
  ON "google_login_attempts"("expires_at");
CREATE INDEX "google_login_attempts_consumed_at_expires_at_idx"
  ON "google_login_attempts"("consumed_at", "expires_at");

ALTER TABLE "external_identities"
  ADD CONSTRAINT "external_identities_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

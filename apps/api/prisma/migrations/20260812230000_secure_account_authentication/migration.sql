DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    GROUP BY lower(btrim("email"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize user emails because canonical values collide';
  END IF;
END $$;

UPDATE "users"
SET "email" = lower(btrim("email"));

ALTER TABLE "users"
  ADD COLUMN "password_hash" VARCHAR(255),
  ADD CONSTRAINT "users_email_normalized"
    CHECK ("email" = lower(btrim("email")));

CREATE TYPE "password_reset_delivery_status" AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE "auth_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "family_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "rotated_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "replaced_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_sessions_token_hash_format"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "auth_sessions_valid_expiry"
    CHECK ("expires_at" > "created_at"),
  CONSTRAINT "auth_sessions_valid_rotation"
    CHECK (
      ("rotated_at" IS NULL AND "replaced_by_id" IS NULL)
      OR ("rotated_at" IS NOT NULL AND "rotated_at" >= "created_at")
    ),
  CONSTRAINT "auth_sessions_valid_revocation"
    CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at"),
  CONSTRAINT "auth_sessions_valid_last_use"
    CHECK ("last_used_at" >= "created_at")
);

CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "delivery_status" "password_reset_delivery_status" NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_reset_tokens_token_hash_format"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "password_reset_tokens_valid_expiry"
    CHECK ("expires_at" > "created_at"),
  CONSTRAINT "password_reset_tokens_valid_use"
    CHECK ("used_at" IS NULL OR "used_at" >= "created_at"),
  CONSTRAINT "password_reset_tokens_valid_revocation"
    CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
);

CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");
CREATE UNIQUE INDEX "auth_sessions_replaced_by_id_key" ON "auth_sessions"("replaced_by_id");
CREATE INDEX "auth_sessions_user_id_revoked_at_expires_at_idx"
  ON "auth_sessions"("user_id", "revoked_at", "expires_at");
CREATE INDEX "auth_sessions_family_id_revoked_at_idx"
  ON "auth_sessions"("family_id", "revoked_at");
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key"
  ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_used_at_revoked_at_expires_at_idx"
  ON "password_reset_tokens"("user_id", "used_at", "revoked_at", "expires_at");
CREATE INDEX "password_reset_tokens_expires_at_idx"
  ON "password_reset_tokens"("expires_at");

ALTER TABLE "auth_sessions"
  ADD CONSTRAINT "auth_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auth_sessions"
  ADD CONSTRAINT "auth_sessions_replaced_by_id_fkey"
  FOREIGN KEY ("replaced_by_id") REFERENCES "auth_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

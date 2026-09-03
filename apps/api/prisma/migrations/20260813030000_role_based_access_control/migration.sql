CREATE TYPE "marketplace_role" AS ENUM ('buyer', 'seller', 'admin');
CREATE TYPE "role_audit_action" AS ENUM ('grant', 'revoke');
CREATE TYPE "role_audit_source" AS ENUM ('system', 'migration', 'seed', 'bootstrap', 'admin');

CREATE TABLE "user_role_assignments" (
  "user_id" UUID NOT NULL,
  "role" "marketplace_role" NOT NULL,
  "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" "role_audit_source" NOT NULL,
  "granted_by_user_id" UUID,

  CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("user_id", "role"),
  CONSTRAINT "user_role_assignments_actor_source"
    CHECK (
      ("source" = 'admin' AND "granted_by_user_id" IS NOT NULL)
      OR ("source" <> 'admin' AND "granted_by_user_id" IS NULL)
    )
);

CREATE TABLE "role_audit_events" (
  "id" UUID NOT NULL,
  "target_user_id" UUID NOT NULL,
  "role" "marketplace_role" NOT NULL,
  "action" "role_audit_action" NOT NULL,
  "source" "role_audit_source" NOT NULL,
  "actor_user_id" UUID,
  "reason" VARCHAR(240) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "role_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_audit_events_reason_bounded"
    CHECK (length(btrim("reason")) BETWEEN 8 AND 240 AND "reason" = btrim("reason")),
  CONSTRAINT "role_audit_events_actor_source"
    CHECK (
      ("source" = 'admin' AND "actor_user_id" IS NOT NULL)
      OR ("source" <> 'admin' AND "actor_user_id" IS NULL)
    )
);

CREATE INDEX "user_role_assignments_role_user_id_idx"
  ON "user_role_assignments"("role", "user_id");
CREATE INDEX "user_role_assignments_granted_by_user_id_idx"
  ON "user_role_assignments"("granted_by_user_id");
CREATE INDEX "role_audit_events_created_at_id_idx"
  ON "role_audit_events"("created_at", "id");
CREATE INDEX "role_audit_events_target_user_id_created_at_idx"
  ON "role_audit_events"("target_user_id", "created_at");
CREATE INDEX "role_audit_events_actor_user_id_created_at_idx"
  ON "role_audit_events"("actor_user_id", "created_at");
CREATE INDEX "role_audit_events_role_action_created_at_idx"
  ON "role_audit_events"("role", "action", "created_at");

ALTER TABLE "user_role_assignments"
  ADD CONSTRAINT "user_role_assignments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_role_assignments"
  ADD CONSTRAINT "user_role_assignments_granted_by_user_id_fkey"
  FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "role_audit_events"
  ADD CONSTRAINT "role_audit_events_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "role_audit_events"
  ADD CONSTRAINT "role_audit_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "user_role_assignments" (
  "user_id", "role", "granted_at", "source", "granted_by_user_id"
)
SELECT "id", 'buyer', CURRENT_TIMESTAMP, 'migration', NULL
FROM "users"
WHERE "deleted_at" IS NULL
ON CONFLICT ("user_id", "role") DO NOTHING;

INSERT INTO "role_audit_events" (
  "id", "target_user_id", "role", "action", "source", "actor_user_id", "reason", "created_at"
)
SELECT
  md5('t12:migration:buyer:' || "id"::text)::uuid,
  "id",
  'buyer',
  'grant',
  'migration',
  NULL,
  'T12 migration buyer backfill',
  CURRENT_TIMESTAMP
FROM "users"
WHERE "deleted_at" IS NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "user_role_assignments" (
  "user_id", "role", "granted_at", "source", "granted_by_user_id"
)
SELECT s."owner_id", 'seller', CURRENT_TIMESTAMP, 'migration', NULL
FROM "shops" s
JOIN "users" u ON u."id" = s."owner_id"
WHERE s."deleted_at" IS NULL AND u."deleted_at" IS NULL
ON CONFLICT ("user_id", "role") DO NOTHING;

INSERT INTO "role_audit_events" (
  "id", "target_user_id", "role", "action", "source", "actor_user_id", "reason", "created_at"
)
SELECT
  md5('t12:migration:seller:' || s."owner_id"::text)::uuid,
  s."owner_id",
  'seller',
  'grant',
  'migration',
  NULL,
  'T12 migration seller backfill',
  CURRENT_TIMESTAMP
FROM "shops" s
JOIN "users" u ON u."id" = s."owner_id"
WHERE s."deleted_at" IS NULL AND u."deleted_at" IS NULL
ON CONFLICT ("id") DO NOTHING;

CREATE FUNCTION "deny_role_audit_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'role audit events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "role_audit_events_append_only"
BEFORE UPDATE OR DELETE ON "role_audit_events"
FOR EACH ROW EXECUTE FUNCTION "deny_role_audit_mutation"();

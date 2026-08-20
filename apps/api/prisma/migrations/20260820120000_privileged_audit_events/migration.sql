-- CreateEnum
CREATE TYPE "privileged_target_type" AS ENUM ('user', 'shop', 'category', 'banner', 'homepage_module');

-- CreateEnum
CREATE TYPE "privileged_action" AS ENUM ('suspend', 'restore', 'create', 'update', 'delete', 'reorder', 'approve', 'reject');

-- CreateTable
CREATE TABLE "privileged_audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "target_type" "privileged_target_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "action" "privileged_action" NOT NULL,
    "reason" VARCHAR(240) NOT NULL,
    "before_summary" JSONB,
    "after_summary" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "privileged_audit_events_pkey" PRIMARY KEY ("id")
);

-- Constraints
ALTER TABLE "privileged_audit_events"
    ADD CONSTRAINT "privileged_audit_events_reason_length_check" CHECK (char_length(trim("reason")) >= 8 AND char_length("reason") <= 240);

-- CreateIndex
CREATE INDEX "privileged_audit_events_created_at_id_idx" ON "privileged_audit_events"("created_at", "id");

-- CreateIndex
CREATE INDEX "privileged_audit_events_target_type_target_id_created_at_idx" ON "privileged_audit_events"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "privileged_audit_events_actor_user_id_created_at_idx" ON "privileged_audit_events"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "privileged_audit_events_action_created_at_idx" ON "privileged_audit_events"("action", "created_at");

-- AddForeignKey
ALTER TABLE "privileged_audit_events" ADD CONSTRAINT "privileged_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

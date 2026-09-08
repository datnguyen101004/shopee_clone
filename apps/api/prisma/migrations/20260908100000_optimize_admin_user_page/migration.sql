-- Support the fixed-size Admin user page query in its default and status-filtered forms.
CREATE INDEX "users_deleted_at_created_at_id_idx"
ON "users"("deleted_at", "created_at" DESC, "id" DESC);

CREATE INDEX "users_deleted_at_status_created_at_id_idx"
ON "users"("deleted_at", "status", "created_at" DESC, "id" DESC);

CREATE TABLE "dataset_sources" (
  "id" UUID NOT NULL,
  "key" VARCHAR(64) NOT NULL,
  "file_name" VARCHAR(120) NOT NULL,
  "source_url" TEXT NOT NULL,
  "checksum" CHAR(64) NOT NULL,
  "record_count" INTEGER NOT NULL,
  "root_metadata" JSONB NOT NULL,
  "policy_version" VARCHAR(40) NOT NULL,
  "imported_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dataset_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dataset_sources_key_not_blank"
    CHECK (length(btrim("key")) BETWEEN 1 AND 64 AND "key" = btrim("key")),
  CONSTRAINT "dataset_sources_checksum_format"
    CHECK ("checksum" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "dataset_sources_record_count_nonnegative"
    CHECK ("record_count" >= 0)
);

CREATE TABLE "dataset_product_records" (
  "id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "product_id" UUID NOT NULL,
  "stable_record_key" CHAR(64) NOT NULL,
  "source_identity" TEXT NOT NULL,
  "source_index" INTEGER NOT NULL,
  "source_product_url" TEXT,
  "source_page_url" TEXT,
  "raw_notes" TEXT,
  "raw_payload" JSONB NOT NULL,
  "generated_fields" JSONB NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "normalized_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "dataset_product_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dataset_product_records_stable_key_format"
    CHECK ("stable_record_key" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "dataset_product_records_source_index_nonnegative"
    CHECK ("source_index" >= 0),
  CONSTRAINT "dataset_product_records_source_identity_not_blank"
    CHECK (length(btrim("source_identity")) > 0 AND "source_identity" = btrim("source_identity"))
);

CREATE UNIQUE INDEX "dataset_sources_key_key" ON "dataset_sources"("key");
CREATE UNIQUE INDEX "dataset_sources_file_name_key" ON "dataset_sources"("file_name");
CREATE INDEX "dataset_sources_policy_version_idx" ON "dataset_sources"("policy_version");
CREATE UNIQUE INDEX "dataset_product_records_product_id_key"
  ON "dataset_product_records"("product_id");
CREATE UNIQUE INDEX "dataset_product_records_source_id_stable_record_key_key"
  ON "dataset_product_records"("source_id", "stable_record_key");
CREATE INDEX "dataset_product_records_source_id_is_active_source_index_idx"
  ON "dataset_product_records"("source_id", "is_active", "source_index");

ALTER TABLE "dataset_product_records"
  ADD CONSTRAINT "dataset_product_records_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "dataset_sources"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dataset_product_records"
  ADD CONSTRAINT "dataset_product_records_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

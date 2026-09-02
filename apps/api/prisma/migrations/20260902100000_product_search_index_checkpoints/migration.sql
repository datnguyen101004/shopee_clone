-- Persist versioned product-search indexing progress and the active physical index.
CREATE TABLE "product_search_index_checkpoints" (
    "scope" VARCHAR(64) NOT NULL DEFAULT 'products',
    "projection_version" INTEGER NOT NULL,
    "analyzer_version" INTEGER NOT NULL,
    "last_completed_at" TIMESTAMPTZ(3),
    "last_run_at" TIMESTAMPTZ(3),
    "active_index" VARCHAR(255),
    "last_error" VARCHAR(120),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_search_index_checkpoints_pkey" PRIMARY KEY ("scope")
);

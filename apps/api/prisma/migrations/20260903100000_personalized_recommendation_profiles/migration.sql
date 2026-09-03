-- Additive bounded buyer-profile and offline ranking-model persistence.
CREATE TYPE "recommendation_model_activation_status" AS ENUM ('candidate', 'active', 'retired');

CREATE TABLE "buyer_search_profiles" (
    "user_id" UUID NOT NULL,
    "profile_version" INTEGER NOT NULL,
    "feature_schema_version" INTEGER NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL,
    "eligibility_score" INTEGER NOT NULL,
    "eligible" BOOLEAN NOT NULL DEFAULT FALSE,
    "view_count_30d" INTEGER NOT NULL,
    "favorite_count_90d" INTEGER NOT NULL,
    "followed_shop_count" INTEGER NOT NULL,
    "order_count_90d" INTEGER NOT NULL,
    "category_affinities" JSONB NOT NULL,
    "shop_affinities" JSONB NOT NULL,
    "preferred_price_min_minor" BIGINT,
    "preferred_price_max_minor" BIGINT,
    "preferred_price_mean_minor" BIGINT,
    "recent_product_ids" JSONB NOT NULL,
    "source" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "buyer_search_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "personalized_ranking_models" (
    "id" UUID NOT NULL,
    "model_version" INTEGER NOT NULL,
    "product_projection_version" INTEGER NOT NULL,
    "feature_schema_version" INTEGER NOT NULL,
    "stored_script_version" INTEGER NOT NULL,
    "dataset_version" VARCHAR(80) NOT NULL,
    "random_seed" INTEGER NOT NULL,
    "training_source" VARCHAR(80) NOT NULL,
    "intercept" DOUBLE PRECISION NOT NULL,
    "feature_weights" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "activation_status" "recommendation_model_activation_status" NOT NULL DEFAULT 'candidate',
    "trained_at" TIMESTAMPTZ(3) NOT NULL,
    "activated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "personalized_ranking_models_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "personalized_ranking_models_model_version_key"
ON "personalized_ranking_models"("model_version");

CREATE INDEX "buyer_search_profiles_feature_schema_version_generated_at_idx"
ON "buyer_search_profiles"("feature_schema_version", "generated_at" DESC);

CREATE INDEX "buyer_search_profiles_eligibility_score_generated_at_idx"
ON "buyer_search_profiles"("eligibility_score", "generated_at" DESC);

CREATE INDEX "personalized_ranking_models_activation_status_feature_schema_version_stored_script_version_idx"
ON "personalized_ranking_models"("activation_status", "feature_schema_version", "stored_script_version");

CREATE INDEX "personalized_ranking_models_dataset_version_trained_at_idx"
ON "personalized_ranking_models"("dataset_version", "trained_at" DESC);

ALTER TABLE "buyer_search_profiles"
ADD CONSTRAINT "buyer_search_profiles_user_id_fkey" FOREIGN KEY ("user_id")
REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

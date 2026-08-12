ALTER TABLE "shops"
  ADD COLUMN "location" VARCHAR(120) NOT NULL DEFAULT 'Việt Nam';

ALTER TABLE "products"
  ADD COLUMN "rating_average_basis_points" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rating_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sold_count" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "products_rating_average_bounded" CHECK ("rating_average_basis_points" BETWEEN 0 AND 500),
  ADD CONSTRAINT "products_rating_count_nonnegative" CHECK ("rating_count" >= 0),
  ADD CONSTRAINT "products_sold_count_nonnegative" CHECK ("sold_count" >= 0);

CREATE INDEX "products_status_created_at_id_idx" ON "products"("status", "created_at", "id");

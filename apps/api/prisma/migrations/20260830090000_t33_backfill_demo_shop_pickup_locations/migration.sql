-- Demo Carrier quotes require a district-level pickup origin. Backfill only the
-- deterministic seed and canonical dataset shops; seller-owned addresses are
-- never inferred from their broad display location.
UPDATE "shops" AS shop
SET
  "pickup_province" = COALESCE(NULLIF(BTRIM(shop."pickup_province"), ''), fixture."pickup_province"),
  "pickup_district" = COALESCE(NULLIF(BTRIM(shop."pickup_district"), ''), fixture."pickup_district"),
  "updated_at" = CURRENT_TIMESTAMP
FROM (
  VALUES
    ('shopee-tech-store', '79', '79-001'),
    ('happy-home-store', '01', '01-001'),
    ('bach-hoa-xanh-dataset', '79', '79-001'),
    ('dien-thoai-hay-dataset', '01', '01-001'),
    ('linh-cosmetics-dataset', '79', '79-001'),
    ('space-t-dataset', '79', '79-001'),
    ('myshoes-dataset', '01', '01-001'),
    ('icon-denim-dataset', '79', '79-001')
) AS fixture("slug", "pickup_province", "pickup_district")
WHERE shop."slug" = fixture."slug"
  AND (
    NULLIF(BTRIM(shop."pickup_province"), '') IS NULL
    OR NULLIF(BTRIM(shop."pickup_district"), '') IS NULL
  );

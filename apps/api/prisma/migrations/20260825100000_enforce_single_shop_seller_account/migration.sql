-- Enforce one lifetime shop ownership slot and reconcile only the safe seller-role inverse.
--
-- Keep the preflight, role backfill, audit writes, and ownership index replacement
-- atomic. The explicit transaction is also required for the ON COMMIT DROP table
-- to remain available throughout the migration.
BEGIN;

-- Prevent ownership and role writes from changing the inspected rows between the
-- preflight and the final unique-index creation.
LOCK TABLE shops IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE user_role_assignments IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE role_audit_events IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  duplicate_owner_ids TEXT;
  invalid_seller_ids TEXT;
BEGIN
  SELECT string_agg(owner_id::text, ', ' ORDER BY owner_id::text)
  INTO duplicate_owner_ids
  FROM (
    SELECT owner_id
    FROM shops
    GROUP BY owner_id
    HAVING count(*) > 1
  ) duplicate_owners;

  IF duplicate_owner_ids IS NOT NULL THEN
    RAISE EXCEPTION
      'single-shop migration blocked: duplicate ownership requires reviewed reconciliation (owner ids: %)',
      duplicate_owner_ids;
  END IF;

  SELECT string_agg(user_id::text, ', ' ORDER BY user_id::text)
  INTO invalid_seller_ids
  FROM (
    SELECT ura.user_id
    FROM user_role_assignments ura
    LEFT JOIN shops s
      ON s.owner_id = ura.user_id
     AND s.deleted_at IS NULL
     AND s.onboarding_status = 'approved'
    WHERE ura.role = 'seller'
    GROUP BY ura.user_id
    HAVING count(s.id) <> 1
  ) invalid_sellers;

  IF invalid_seller_ids IS NOT NULL THEN
    RAISE EXCEPTION
      'single-shop migration blocked: seller role is not backed by exactly one approved non-deleted shop; do not revoke access or fabricate a shop automatically (user ids: %)',
      invalid_seller_ids;
  END IF;
END;
$$;

CREATE TEMP TABLE single_shop_seller_role_backfill (owner_id UUID PRIMARY KEY) ON COMMIT DROP;

INSERT INTO single_shop_seller_role_backfill (owner_id)
SELECT s.owner_id
FROM shops s
JOIN users u ON u.id = s.owner_id
LEFT JOIN user_role_assignments ura
  ON ura.user_id = s.owner_id
 AND ura.role = 'seller'
WHERE s.deleted_at IS NULL
  AND s.onboarding_status = 'approved'
  AND u.deleted_at IS NULL
  AND ura.user_id IS NULL;

INSERT INTO user_role_assignments (user_id, role, granted_at, source, granted_by_user_id)
SELECT owner_id, 'seller', CURRENT_TIMESTAMP, 'migration', NULL
FROM single_shop_seller_role_backfill
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO role_audit_events (id, target_user_id, role, action, source, actor_user_id, reason, created_at)
SELECT md5('single-shop-seller-account:role-backfill:' || owner_id::text)::uuid,
       owner_id,
       'seller',
       'grant',
       'migration',
       NULL,
       'Backfill seller role for approved single-owner shop',
       CURRENT_TIMESTAMP
FROM single_shop_seller_role_backfill
ON CONFLICT (id) DO NOTHING;

-- The safe backfill above must close the inverse gap. Any remaining approved shop
-- without SELLER needs explicit review (for example, a deleted owner account).
DO $$
DECLARE
  invalid_owner_ids TEXT;
BEGIN
  SELECT string_agg(owner_id::text, ', ' ORDER BY owner_id::text)
  INTO invalid_owner_ids
  FROM (
    SELECT s.owner_id
    FROM shops s
    LEFT JOIN user_role_assignments ura
      ON ura.user_id = s.owner_id
     AND ura.role = 'seller'
    WHERE s.deleted_at IS NULL
      AND s.onboarding_status = 'approved'
      AND ura.user_id IS NULL
  ) invalid_owners;

  IF invalid_owner_ids IS NOT NULL THEN
    RAISE EXCEPTION
      'single-shop migration blocked: approved shop owner is still missing the seller role after safe backfill (owner ids: %)',
      invalid_owner_ids;
  END IF;
END;
$$;

DROP INDEX IF EXISTS shops_owner_id_live_key;
CREATE UNIQUE INDEX shops_owner_id_key ON shops(owner_id);

COMMIT;

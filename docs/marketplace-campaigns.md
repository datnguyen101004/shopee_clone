# Marketplace campaigns

Campaign type behavior is registered in `apps/api/src/marketplace-campaigns/campaign-policy.ts`. Add a new type by adding a closed contract key, registry definition, deterministic seed row, and a renderer entry. Unknown types use the API validation error and are never rendered.

The feature uses the existing API and worker process. `MarketplaceCampaignsModule` registers the five-minute seller notification sweep. `NotificationService` controls email preferences and retry delivery through the existing outbox. No worker is required for lifecycle correctness.

Optional rollout settings are `CAMPAIGN_COLLECTIONS_ENABLED` (defaults to `true`), `CAMPAIGN_FLASH_SALE_SHELF_ENABLED` (defaults to `true`, set to `false` to keep the legacy Flash Sale shelf) and `CAMPAIGN_ENROLLMENT_REMINDER_HOURS` (defaults to `24`, bounded to 1–168 hours). The sweep claims due campaigns with PostgreSQL `FOR UPDATE SKIP LOCKED`; notification rows use the campaign version in their deduplication key.

Deploy the additive migration with `pnpm --filter @shopee-clone/api db:migrate:deploy` on Amazon RDS. The database role must be allowed to create or use the `btree_gist` extension. The migration reports the product and campaign windows when existing shop discounts overlap. Repair those rows, rerun the migration, and then run `pnpm --filter @shopee-clone/api db:seed`.

Search projections must be rebuilt after the migration with `pnpm --filter @shopee-clone/api search:reindex`. The campaign ranking tier is bounded (`0`, `1`, `2`) and can be disabled by setting the search campaign factor to zero in the server registry before a new deployment. Explicit price, newest and best-selling sorts keep their existing ordering.

Frontend routes are `/admin/campaigns`, `/seller/campaigns`, `/seller/campaigns/:campaignId`, and `/banner/:bannerId`. The API routes are under `/api/v1/admin/campaign-types`, `/api/v1/admin/campaigns`, `/api/v1/seller/campaigns`, and `/api/v1/campaigns/by-banner/:bannerId`.

The homepage reads active `HomepageCampaignCollection` placements for any configured module and enrolled products through the same scheduled-price resolver used by catalog and checkout. The Flash Sale module is omitted when it has no active `FLASH_SALE` placement, so it never falls back to a stale independent discount source; other legacy modules retain their existing product lists during rollout. Campaign create/publish/cancel and seller participation/withdraw requests require an `Idempotency-Key` UUID; retries with the same key replay the stored response. A public cancelled campaign keeps its banner identity and status but exposes no campaign products or active discount prices.

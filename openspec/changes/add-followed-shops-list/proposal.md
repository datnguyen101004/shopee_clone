## Why

T15 lets buyers follow and unfollow a shop, but the relationship is visible only while visiting that individual storefront. T15.1 gives authenticated buyers a durable account destination where they can rediscover and manage every shop they chose to follow.

## What Changes

- Add an authenticated, owner-scoped, page-based `GET /api/v1/account/followed-shops` endpoint ordered by newest follow time with deterministic pagination metadata.
- Return public shop summaries for available shops and a minimal unavailable state for relationships whose shop later becomes inactive or deleted, while keeping those relationships removable.
- Add `/account/followed-shops` with protected loading, empty, error, pagination, available/unavailable card, shop navigation, and accessible unfollow behavior.
- Add the followed-shop destination to authenticated account navigation and reuse the existing session, safe login return path, no-store, Problem Details, and idempotent unfollow boundaries.
- Add strict shared contracts, OpenAPI documentation, repository/service coverage, real PostgreSQL ordering and ownership checks, frontend tests, and a mocked quick browser journey without re-enabling automatic CI triggers.
- Keep feeds, recommendations, notifications, seller follower identities, folders, search within followed shops, and bulk unfollow outside this change.

## Capabilities

### New Capabilities

- `buyer-followed-shops`: Authenticated paginated followed-shop discovery and management, including availability policy, deterministic ordering, privacy, account navigation, and unfollow behavior.

### Modified Capabilities

- None. The completed T15 shop capability has not been synchronized into `openspec/specs`; T15.1 consumes its implemented follow relationship and mutation contract without claiming a nonexistent main-spec modification.

## Impact

- **Shared contracts:** Add followed-shop item, availability union, pagination, page query, page response, and strict runtime parsers under the shop contract surface.
- **Backend:** Extend the existing shop storefront module/controller/service/repository with one authenticated list read, strict query parsing, owner-scoped projection, OpenAPI coverage, and no-store responses.
- **Database:** Reuse `shop_followers` and its `(user_id, followed_at DESC, shop_id)` index; no new table, column, migration, or relationship backfill is expected.
- **Frontend:** Add `/account/followed-shops`, a list API helper and management components, account navigation links, responsive states, and reuse of the existing DELETE mutation.
- **Verification:** Extend contract, API, repository/service, PostgreSQL, component, accessibility, and shop quick-E2E coverage while keeping developer data read-only in the quick browser gate.

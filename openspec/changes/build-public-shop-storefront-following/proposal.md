## Why

Products already expose a shop identity, but buyers cannot open a stable storefront, browse that seller's catalog, or follow the shop. T15 closes that discovery gap and establishes the public shop boundary needed by later seller, chat, recommendation, and loyalty work.

## What Changes

- Add a stable public storefront route for every active, non-deleted shop, with a deliberate unavailable response for inactive, deleted, or unknown shops.
- Expose a public shop profile with display identity, location, joined date, aggregate product/rating/sales summaries, response metadata placeholder, follower count, and public category facets.
- Add a paginated shop catalog with strict category, keyword, page, page-size, and deterministic sort controls.
- Add authenticated, idempotent follow and unfollow operations plus an owner-scoped follow-state lookup; keep follower counts transactionally consistent.
- Link product-detail shop identity to its canonical storefront and reuse the existing public-product displayability rules across shop APIs and screens.
- Add responsive, accessible storefront states and automated contract, persistence, API, frontend, and mocked browser verification.

## Capabilities

### New Capabilities

- `public-shop-storefront`: Public shop discovery, shop-scoped catalog browsing, authenticated following, canonical navigation, privacy, and unavailable-shop behavior.

### Modified Capabilities

- None.

## Impact

- `packages/contracts`: framework-neutral public shop, catalog query/page, category facet, and follow-state contracts with strict runtime parsers.
- `apps/api/prisma`: additive shop-follower relationship and indexes; existing shops and users require no backfill.
- `apps/api`: a capability-oriented public shop module, authenticated follow mutations, owner-scoped state lookup, OpenAPI coverage, and safe Problem Details responses.
- `apps/web`: `/shops/[shopSlug]`, reusable shop header/catalog/follow controls, product-detail navigation, and responsive loading/empty/error states.
- Tests and docs: deterministic seed/verification, isolated PostgreSQL checks, unit/Supertest/Playwright coverage, and local endpoint/screen guidance.
- No external service, seller onboarding, seller profile editing, realtime chat, or review submission is introduced.

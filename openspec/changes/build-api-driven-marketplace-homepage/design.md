## Context

See `proposal.md` for motivation and `specs/marketplace-homepage/spec.md` for observable behavior. T03 provides PostgreSQL/Prisma entities for shops, categories, products, variants, images, and inventory; T05 provides the visual vocabulary; T06 provides the shared storefront shell. The homepage still owns hardcoded module and product constants, the API exposes only health, and the existing product image seeds point at non-routable demonstration URLs.

The design must cross the Prisma, NestJS, framework-neutral contracts, Next.js server rendering, local environment, CI, and Playwright boundaries without making the browser a database client or requiring the API to be available during `next build`.

## Goals / Non-Goals

**Goals:**

- Establish one stable public aggregate optimized for homepage rendering rather than making the web application coordinate several catalogue calls.
- Keep module schedules, ordering, membership, and display copy deterministic and seedable while catalogue facts remain server-authoritative.
- Preserve the current Shopee-inspired visual hierarchy with a data-driven module registry and reusable product/category/banner views.
- Make build, unit, integration, and end-to-end verification deterministic, including activation-boundary tests with an injected clock.

**Non-Goals:**

- Admin CRUD for homepage configuration, seller Mall verification, personalized recommendations, real sales ranking, reservation semantics, or concurrency-safe Flash Sale inventory.
- Full catalogue browsing (T08), search relevance (T09), or product details and variant selection (T10).
- Client-side direct access to NestJS, Redis caching, a CMS, or third-party campaign/media hosting.

## Decisions

### 1. Expose one aggregate `GET /api/v1/homepage` contract

The NestJS homepage capability will return one response with `evaluatedAt` and an ordered discriminated union of modules: `campaign-banner`, `category-shortcuts`, `flash-sale`, `top-selling`, `mall`, and `daily-recommendations`. Base fields stay consistent while each type owns its typed payload. Product summaries are deliberately compact and contain display-ready price values, media/fallback information, shop name, presentation labels, and an internal `href`.

The framework-neutral union plus a conservative runtime guard will live in `packages/contracts`. NestJS may map to that contract but will not export Prisma records or Nest-specific DTO classes into the package. The web adapter rejects invalid top-level responses, filters unknown future module types, and keeps recognized modules renderable.

**Alternatives considered:** Multiple endpoints would allow independent caching but force the first homepage to coordinate requests and define partial failure in the UI. GraphQL and a generic JSON page-builder schema add flexibility that the approved stack and T07 scope do not need.

### 2. Normalize scheduled configuration instead of storing opaque module JSON

An additive Prisma migration will introduce:

- `HomepageModule`: stable key, enum type, title/subtitle, enabled flag, `sortOrder`, and optional `activeFrom`/exclusive `activeUntil` UTC timestamps.
- `HomepageBanner`: module relation, ordered copy, optional local media path, safe destination path, and presentation theme key.
- `HomepageModuleCategory`: ordered join from a module to an existing category with optional display-label/icon overrides.
- `HomepageModuleProduct`: ordered join from a module to an existing product with optional seeded promotion label and mock sold-count metadata.

Foreign keys and unique `(moduleId, sortOrder)` or `(moduleId, referencedId)` constraints prevent ambiguous seed output. Explicit tables keep referential integrity and typed fields visible to migrations; a free-form JSON payload would move too much validation into application code. The module type determines which child relation is legal, and deterministic seed verification will reject incompatible or mixed configurations.

Mall is a presentation module in T07, not verified shop status. The design therefore does not add an `isMall` trust flag to `Shop`; T36 can introduce genuine Mall semantics later without inheriting a misleading boolean.

### 3. Evaluate eligibility once per request with deterministic fallbacks

The application service receives a clock abstraction and captures one `now` value per request. Active module filtering uses `activeFrom <= now` and `activeUntil > now`, then orders by `(sortOrder, id)`. Child records use the same stable secondary order.

A category item is displayable only when its category is active and not deleted. A product item is displayable only when the product and shop are active/not deleted and at least one active, non-deleted variant has positive available inventory (`quantityOnHand - quantityReserved`). The representative offer is the lowest-priced eligible variant with identifier as a tie-breaker. Compare-at price is returned only when greater than the selected price; the first ordered product image is preferred and a typed fallback is returned otherwise.

Invalid references, unsafe destinations, and empty child collections remove only the affected item or module. Database/query failures are translated at the controller boundary to a sanitized `application/problem+json` 503 response. A focused homepage exception filter is preferred over changing all existing API error behavior inside this issue.

**Alternatives considered:** Deriving top-selling from orders is impossible before the commerce phases, so T07 uses explicitly curated seed order. Application caching is deferred because activation boundaries are more important than optimizing a small seed-backed aggregate; later caching must include schedule-aware expiry.

### 4. Fetch on the Next.js server at request time

The homepage remains a server-rendered buyer route. A server-only API adapter reads a documented `HOMEPAGE_API_BASE_URL`, applies a short timeout, uses `cache: 'no-store'`, and validates the response with the shared guard. The route is forced dynamic so `next build` never depends on a running API or database.

The page delegates module rendering to a typed registry. Shared banner, category-shortcut, product-section, and product-card components consume contract types and existing UI primitives. `loading.tsx` supplies the route skeleton. A valid empty response maps to `EmptyState`; transport, timeout, non-success, and invalid-contract errors map to `ErrorState` with a same-route retry link. Neither path reintroduces hardcoded commerce data.

**Alternatives considered:** Browser-side fetching would add hydration, CORS, and layout-shift costs for public content. Static generation with a fixed revalidation window can display expired campaigns and makes local/CI builds depend on API availability.

### 5. Reserve `/products/[productId]` as the T10 handoff route

Product summaries use opaque product IDs and link to `/products/{encodedId}`. T07 adds a storefront placeholder route that clearly identifies the requested product and explains that full gallery/variant/stock behavior belongs to T10. Category links continue using `/search?category=<slug>`, while campaign paths are allowlisted to `/`, `/search`, or `/products/...` before serialization.

**Alternatives considered:** Linking product cards back to generic search technically avoids a 404 but does not satisfy the product-detail destination contract. Building full details now would collapse T10 into T07.

### 6. Test the real API boundary locally and keep CI manually dispatchable

Contract tests cover valid/invalid discriminated fixtures. Nest service and database tests use an injected clock and isolated PostgreSQL data to cover activation boundaries, ordering, eligibility, price selection, partial modules, and empty responses. Supertest covers the success contract and sanitized failure shape. Frontend tests mock the server adapter and cover every module plus populated, empty, unknown, and failed states.

For Playwright, the local full-stack gate will start isolated PostgreSQL, deploy migrations, seed data, and run the built NestJS and Next.js applications. Playwright will then verify the API-driven homepage and product placeholder at the three reference viewports. Cleanup remains scoped to the repository Compose project. `.github/workflows/ci.yml` stays aligned with this path and can be run explicitly with `workflow_dispatch`, but it must not react to pushes or pull requests until the project owner re-enables those triggers. This is heavier than a frontend fixture server, but it proves the exact cross-application path required by the issue and avoids production-only test switches.

## Risks / Trade-offs

- **[Homepage now depends on API/database availability]** → Keep the shell operational, fail into an explicit retry state, use a short server timeout, and test the outage path.
- **[Polymorphic module tables can contain a child relation that does not match the module type]** → Validate seed/configuration invariants in the service and verification script; keep database constraints for uniqueness and referential integrity.
- **[Curated “top-selling” and mock sold counts can look authoritative]** → Keep the selection explicitly seed-owned, avoid analytics claims in API names, and defer real ranking to order-backed work.
- **[No-store server rendering increases API reads]** → Accept the small T07 dataset cost; measure before introducing schedule-aware caching.
- **[Local media paths can drift from seeded records]** → Commit deterministic demo assets, verify their paths in seed tests, and render an explicit accessible fallback when media is absent.
- **[Adding database-backed E2E increases CI time]** → Reuse pinned tooling and isolated Compose helpers, run only critical journeys, and guarantee cleanup even on failure.

- **[Regressions are not caught automatically while push and pull-request CI triggers are paused]** → Require the complete local quality suite before direct pushes, keep the workflow manually dispatchable, and verify that delivery creates no automatic run.

## Migration Plan

1. Add the normalized homepage tables and indexes in one additive Prisma migration.
2. Extend deterministic seed data with fixed module, banner, category-membership, and product-membership identifiers plus routable demo media.
3. Deploy the migration before the NestJS version that queries the new tables; the old application ignores the additive schema.
4. Deploy NestJS and then the dynamic Next.js homepage. If the API is temporarily unavailable, the web failure state remains safe and navigable.
5. Roll back application code independently if needed; leave additive tables in place until a later forward migration removes them, avoiding destructive rollback against seeded or future admin data.

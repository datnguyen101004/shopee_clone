## Context

See `proposal.md` for motivation and `specs/public-shop-storefront/spec.md` for observable behavior. T08 supplies the shared responsive storefront shell, T10 supplies canonical public catalog and product-detail projections, T11 supplies rotating authenticated sessions, and T14 supplies the scoped optimistic-state and safe guest return-path patterns.

`Shop` already has a unique slug, name, location, lifecycle status, owner, timestamps, and products. Product detail already returns the shop id and slug, but renders the shop identity as text. The schema has no buyer-shop follow relation, and the global catalog implementation owns the current public-product displayability, presentation, search, sorting, and pagination rules. T15 spans contracts, additive persistence, public and authenticated NestJS routes, server-rendered Next.js discovery, client session state, and database/browser verification without adding infrastructure.

## Goals / Non-Goals

**Goals:**

- Make the stored unique shop slug the stable public identity and preserve one unavailable response for every non-public state.
- Reuse one canonical public-product projection for global and shop-scoped catalog results.
- Add a small relational follow model whose uniqueness, privacy, and follower counts remain correct under retries and concurrency.
- Keep public storefront responses session-neutral while hydrating follow state only after client-side session restoration.
- Generalize reusable catalog presentation just enough for a shop-specific route without regressing `/search`, product favorites, or product detail.

**Non-Goals:**

- Adding or editing shop descriptions, logos, banners, contact details, addresses, status, or onboarding; T22 owns those seller-management capabilities.
- A followed-shops account list, following feed, notifications, marketing analytics, seller follower identities, or follower export.
- Response-rate computation, chat presence, review submission, or new rating persistence; neutral placeholders and existing product aggregates are used.
- Anonymous follows, local-storage follow persistence, hidden post-login follow execution, or social graph recommendations.
- Changing global catalog URLs/contracts, authentication token/cookie semantics, or automatic GitHub Actions triggers.

## Decisions

### 1. Split cache-neutral public reads from private follow operations

Add a capability-oriented `shop-storefront` NestJS module with these routes:

- `GET /api/v1/shops/:shopSlug` returns the public profile, aggregates, category facets, and public follower count.
- `GET /api/v1/shops/:shopSlug/products?q=&category=&sort=&page=&pageSize=` returns the shop-scoped catalog page.
- `GET /api/v1/account/followed-shops/status?shopIds=` returns up to 48 owner-scoped follow states in request order.
- `PUT /api/v1/account/followed-shops/:shopId` creates a follow if absent.
- `DELETE /api/v1/account/followed-shops/:shopId` removes the caller's relationship if present, including after a shop becomes unavailable.

Public controllers do not run authentication opportunistically and never include `isFollowing`, so a guest and signed-in server render receive the same representation. Private routes use `AuthGuard`; PUT and DELETE also use `AuthOriginGuard`. All routes get strict parameter/query parsing, OpenAPI annotations, and shop-specific sanitized Problem Details. Idempotent mutations return `200` with `{ shopId, isFollowing, followedAt, followerCount }`; `followerCount` is nullable only when the target is no longer public during an idempotent DELETE.

Embedding follow state in `GET /shops/:slug` was rejected because it would make public rendering and cache behavior session-dependent. Following by slug was rejected because relationships and future internal references should survive a presentation-slug policy change; public navigation uses slug while authenticated mutations use the opaque shop UUID already exposed by the profile.

### 2. Add strict shop contracts and reuse existing catalog vocabulary

Add framework-neutral shop contracts for:

- canonical slug/UUID validation and the query constants already used by catalog;
- public profile, aggregate, response-placeholder, category-facet-with-count, and storefront Problem Details shapes;
- shop-catalog query context and page response containing existing `CatalogProductCard` items;
- follow-state batch and mutation responses with strict cross-field validation.

The shop catalog accepts only `q`, `category`, `sort`, `page`, and `pageSize`, reusing `catalogSortValues`, page 1, page size 12, maximum 48, keyword limit 120, and the existing default-sort rule. Runtime parsers reject unknown keys, arrays/repeated values, unknown response keys, invalid timestamps, invalid pagination math, duplicate state IDs, and inconsistent mutation fields.

Creating a second product-card type was rejected because price, discount, availability, image fallback, rating, sales, and product navigation already have a canonical public contract. Adding the shop id/slug to every global `CatalogProductCard.shop` would be a public contract expansion with broad unrelated impact, so T15 keeps shop identity in its surrounding profile and uses existing cards inside the scoped result.

### 3. Promote catalog projection through an explicit public facade

Refactor the catalog module to expose a small public reader/facade used by both global catalog and shop storefront services. It owns the Prisma displayability predicate, candidate loading, `mapCatalogProductCard`, text normalization/relevance, stable sort comparators, category hierarchy matching, and pagination. Its shop-scoped method requires a resolved shop id and applies that predicate before mapping, totals, and facets.

The shop storefront module owns shop lookup, follower persistence, profile composition, and response errors; it does not reach into catalog repository internals. The global catalog service remains a consumer of the same facade so equivalence tests can prove displayability and card presentation did not fork. Category facets for a shop are calculated from the unfiltered displayable shop candidate set, while item totals and pages use the active keyword/category query.

Copying the catalog rules into a new repository was rejected because lifecycle and pricing behavior would drift. Moving Prisma shapes into `packages/contracts` was rejected because shared contracts must stay framework-neutral.

### 4. Derive shop summaries from public product projections and persisted relationships

The profile reader resolves an active, non-deleted shop by canonical slug, loads its unfiltered displayable product projection, and computes:

- `activeProductCount` as the number of mapped displayable products;
- `soldCount` as a safe integer sum;
- `ratingCount` as a safe integer sum;
- `ratingAverageBasisPoints` as the rounded weighted sum of `productAverage * productRatingCount / totalRatingCount`, or zero when there are no ratings;
- category facets with displayable-product counts;
- `followerCount` from `COUNT(shop_followers)`;
- `joinedAt` from the persisted shop creation timestamp;
- response rate/time as explicit null fields with a neutral message.

The web renders an initial-based avatar and a CSS banner from the existing name instead of adding profile-media columns before T22. Aggregates are calculated server-side and capped/rejected if corrupted source integers would exceed JavaScript safe bounds.

Using an average of product averages was rejected because it overweights products with few ratings. Persisting denormalized rating, sales, or follower counters was rejected for T15 because current data volume is small and transactionally derived values cannot drift; later measured performance work may add maintained counters with reconciliation.

### 5. Model following as a composite-key relationship with query-supporting indexes

Add `ShopFollower` with `userId`, `shopId`, and `followedAt`, composite primary key `(userId, shopId)`, and relations on `User` and `Shop`. Use cascading foreign keys for hard deletion and indexes on `(shopId, followedAt DESC, userId)` for public counts/later follower operations and `(userId, followedAt DESC, shopId)` for future followed-shop reads. Existing records need no backfill.

The composite key is the only source of membership truth. No `followerCount` column is added to `Shop`, and no identity list is exposed publicly. Deterministic seed fixtures cover multiple buyers, multiple shops, self-owner boundaries, an unfollowed buyer, and empty follower states using existing development accounts and shops only.

JSON arrays on `User` or `Shop` were rejected because they cannot enforce relationship integrity, uniqueness, cascades, efficient ownership lookup, or future feed queries.

### 6. Make follow writes idempotent while preserving the first timestamp

Follow PUT runs a short transaction that locks/resolves the target shop, verifies public status and `ownerId !== userId`, inserts with conflict-ignore semantics, then reads the caller's relationship and current count. A conflict preserves the original `followedAt`. DELETE performs an owned `deleteMany` without requiring public displayability, then returns unfollowed state and the count only if the shop is still public. Unknown, hard-deleted, and already-unfollowed identifiers all avoid revealing a relationship and return the same idempotent unfollowed shape.

Concurrent writes rely on the composite primary key rather than check-then-insert. The count is queried from persisted unique rows after the mutation; responses are authoritative at their transaction snapshot, while later concurrent follows may naturally change the next read. Status lookup uses one bounded query scoped by `userId` and reconstructs output in request order, returning false for canonical unknown or unavailable shop IDs.

A denormalized increment/decrement counter was rejected because retries and concurrent deletes require additional locking and reconciliation. Updating `followedAt` on repeated PUT was rejected because an idempotent retry must not reorder future followed-shop views.

### 7. Render public data on the server and isolate follow state in a client control

Add the dynamic App Router page `/shops/[shopSlug]`. It fetches the public profile first; sanitized not-found maps to Next `notFound()`. The catalog request uses the route's strict query helper; catalog failures keep the shop header visible and render an actionable retry state. Search, category, sort, and pagination use canonical GET links/forms rooted at the current shop path so URLs are shareable and contain only public discovery filters.

Extract route-neutral product-grid and catalog-control primitives from the current catalog component, parameterized by action path and href builder. Both `/search` and the shop page keep the existing `FavoriteStateProvider` batch behavior, canonical product cards, and accessible pagination. Focused regression tests protect the global search URL contract.

Add `ShopFollowControl` as the only personalized client boundary. It waits for `AuthSessionProvider` restoration, loads one bounded status batch, performs an optimistic boolean/count update with a pending guard, parses the server mutation as authoritative, and rolls back with a live announcement on failure. Logout or user change resets the state. Guest activation navigates to login with only the validated current internal storefront path; it never queues a follow or writes shop behavior to local/session storage.

Rendering the whole shop page as a client component was rejected because profile/catalog discovery is public, linkable, and server-renderable. Automatically following after login was rejected because the user's original gesture must not become a delayed hidden mutation.

### 8. Link product detail through the existing shop slug without changing its contract

`ProductDetailResponse.shop` already includes `id`, `slug`, `name`, `location`, and active product count. Change only the Next.js presentation so the shop name/header links to `/shops/${product.shop.slug}`. The API response contract and product-detail service remain unchanged.

Product cards inside a shop still link to canonical product UUID routes. Product detail, favorites, recent recording, related products, and anonymous purchase intent receive regression coverage because the shop link is added near those existing interactions.

### 9. Start public reads with explicit no-store caching and preserve error privacy

Both public shop reads initially use `Cache-Control: no-store` because follower count and catalog lifecycle currently have no cache invalidation layer. This remains compatible with the spec's optional future anonymous caching and matches the global catalog. Follow state/mutations are always no-store. Errors include only safe parameter names, stable codes, trace ids, and the public request path; they never include follower identities, complete state batches, owner ids, SQL details, or internal lifecycle status.

Adding TTL caching now was rejected because stale follower/product counts would complicate acceptance testing without a measured performance need. Returning distinct suspended/deleted/unknown errors was rejected because the public result does not need private lifecycle detail.

### 10. Verify equivalence and concurrency at the narrowest useful layers

Contract tests cover exact profiles/pages, query bounds, strict unknown-key rejection, batch order, nullable unavailable-unfollow response, and aggregate invariants. Catalog/shop unit tests cover canonical displayability reuse, weighted ratings, facets, query/sort tie-breakers, ownership, self-follow, timestamp preservation, and rollback-safe UI state. Supertest covers exact routes, public versus authenticated behavior, origin enforcement, no-store headers, 400/401/404/409/503 mapping, OpenAPI descriptions, and sanitized errors.

Isolated PostgreSQL tests cover composite uniqueness, both indexes, cascades, concurrent PUT/DELETE, first timestamp preservation, cross-user isolation, unavailable DELETE, and derived counts. Frontend tests cover route helpers, server states, session restoration, guest handoff, optimistic success/rollback, duplicate-submit prevention, storage/URL privacy, and global-search regression. A mocked, non-mutating `test:e2e:shop:quick` suite covers public profile/catalog, follow UI, product-to-shop navigation, query/request shapes, responsive widths, keyboard operation, and accessibility; engagement, product, auth, and homepage quick suites remain regression gates without enabling automatic CI triggers.

## Risks / Trade-offs

- [Profile and catalog can observe slightly different data across their separate requests] → Keep each response internally consistent and deterministic; later combine or version reads only if users observe a real coherence problem.
- [Derived follower/product aggregates cost database and application work on every request] → Add supporting indexes, bound catalog pages, measure first, and defer cache/counter complexity until a performance task supplies invalidation and reconciliation.
- [Refactoring catalog presentation can regress global search URLs or favorite batching] → Keep public contracts unchanged and add equivalence plus `/search` regression tests before integrating the shop route.
- [Optimistic follower count may momentarily differ from another concurrent follower] → Treat mutation responses as authoritative for the current snapshot and refresh on the next profile load; never claim realtime precision.
- [Inactive shops retain follow rows] → Hide profile/state publicly, allow owned idempotent DELETE, and rely on hard-delete cascades; preserving rows supports possible reactivation without inventing an unfollow event.
- [Weighted product aggregates are placeholders until verified-review aggregation exists] → Label them as current product summaries and keep the calculation behind the public shop facade so T21 can replace the source without changing the storefront contract.
- [No logo/banner columns makes the initial page less seller-customizable] → Use deterministic initial/CSS presentation now and let T22 add managed media with its ownership and validation rules.
- [Follower relationships are sensitive behavioral data] → Keep membership owner-scoped, responses non-cacheable, fixtures synthetic, and prohibit follower identities/mappings in logs, URLs, browser storage, and public APIs.

## Migration Plan

1. Add the `ShopFollower` model, `User`/`Shop` relations, composite key, cascading foreign keys, and both deterministic indexes in an additive migration. Generate/validate Prisma and deploy twice against an isolated database; existing users and shops need no backfill.
2. Add strict shared contracts, promote the catalog public facade while keeping global catalog behavior stable, then add the shop storefront repository/service/controllers and deterministic seed/database verification.
3. Deploy the API before or together with the web route. Add server fetch helpers, route-neutral catalog presentation, follow client state, product-detail link, responsive styles, documentation, and focused tests.
4. Run format, lint, typecheck, all contract/API/web tests, production builds, isolated PostgreSQL concurrency tests, `test:e2e:shop:quick`, and auth/product/engagement/homepage quick regressions with pinned pnpm.
5. Roll back web/application code first if needed. The unused additive relationship table is backward-compatible and may remain for a forward fix; dropping it would delete follow data and therefore requires an explicit retention decision rather than an automatic rollback.

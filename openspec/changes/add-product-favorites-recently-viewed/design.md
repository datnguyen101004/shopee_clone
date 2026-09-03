## Context

See `proposal.md` for motivation and `specs/buyer-product-engagement/spec.md` for observable behavior. T10 supplies canonical public product detail/card projections and T11 supplies rotating HttpOnly-backed authentication with in-memory bearer access tokens. T13 adds protected account layout and navigation patterns. The current schema has `User` and `Product` ownership roots but no buyer-product engagement relations, and catalog pages do not know authenticated favorite state.

T14 crosses PostgreSQL persistence, NestJS APIs, shared contracts, server-rendered catalog surfaces, and client session state. PostgreSQL remains authoritative, the API exclusively owns engagement mutations, no new infrastructure dependency is introduced, and automatic GitHub Actions triggers remain paused.

## Goals / Non-Goals

**Goals:**

- Add small, bounded buyer-product relations with deterministic idempotency, ordering, and pagination.
- Preserve the public catalog contract while projecting current product data safely into private engagement pages.
- Batch visible favorite-state hydration to avoid per-card request fan-out.
- Record authenticated views without turning the public product-detail GET into a side-effecting endpoint.
- Reuse the existing session, Problem Details, product presentation, responsive account, and isolated PostgreSQL test patterns.

**Non-Goals:**

- Anonymous favorites/history, local-storage persistence, guest-to-account merging, cross-device conflict UI, or public sharing.
- Recommendation/ranking models, behavioral event analytics, click/impression tracking, marketing attribution, or seller-facing engagement analytics.
- Favorite folders, notes, manual favorite ordering, history search, clear-history controls, or history export.
- Restoring a favorite after a product is hard-deleted, snapshotting complete product content, or exposing draft/private catalog data.
- Changing authentication tokens/cookies or public catalog/product-detail response shapes.

## Decisions

### 1. Create a dedicated buyer engagement module under the account API boundary

Add a capability-oriented NestJS module rooted at `/api/v1/account` with these authenticated operations:

- `GET /favorites?page=&pageSize=` lists the buyer's favorites.
- `GET /favorites/status?productIds=` returns bounded favorite membership for visible products.
- `PUT /favorites/:productId` favorites idempotently.
- `DELETE /favorites/:productId` unfavorites idempotently, including unavailable saved products.
- `GET /recently-viewed?page=&pageSize=` lists displayable recent products.
- `PUT /recently-viewed/:productId` records or refreshes a view idempotently.

All reads use `AuthGuard`; PUT/DELETE operations also use the existing trusted-origin policy. Responses use `Cache-Control: no-store`, strict canonical UUID and query parsing, documented OpenAPI shapes, and engagement-specific Problem Details mapping. A dedicated module keeps behavioral data distinct from profile/address mutations while retaining the familiar account ownership URL.

Adding favorite state to public catalog/product-detail responses was rejected because those responses are shared/cache-neutral and do not receive an authenticated bearer token in server components. Side-effecting `GET /catalog/products/:id` was rejected because public reads must remain safe and retryable.

### 2. Add framework-neutral engagement contracts and a catalog-safe private projection

Add a contracts file defining page constants, query metadata, `FavoriteState`, favorite/history items, product availability, mutation responses, and strict runtime parsers. Available items reuse the current catalog card fields. The engagement wrapper adds the relationship timestamp and an explicit availability state; unavailable favorites return only a safe identity/presentation subset with `href: null`, nullable current commerce fields, and no purchase action.

The batch status response contains one canonical `{ productId, isFavorite }` entry for every requested distinct identifier in request order. Limit it to 48 identifiers, matching the maximum storefront page size. Unknown but canonical public IDs return `false`; malformed or duplicate identifiers reject the full query so client/request bugs are visible.

Changing `CatalogProductCard` to carry personalized state was rejected because it would make a public reusable contract session-dependent. Returning full draft/archived product details to prior favoritors was rejected because availability history does not authorize current private catalog content.

### 3. Model favorites and recently viewed as explicit composite-key relations

Add `ProductFavorite` with `userId`, `productId`, and `favoritedAt`, plus `RecentlyViewedProduct` with `userId`, `productId`, and `lastViewedAt`. Each uses composite primary key `(userId, productId)` to enforce uniqueness. Indexes on `(userId, timestamp DESC, productId)` support deterministic owned pagination; product indexes support lifecycle cleanup. Relations cascade when a user or product is hard-deleted, while normal product lifecycle remains soft-delete/status based.

Favorites use a normal relation row rather than a boolean on `Product` or JSON on `User`, because ownership, uniqueness, pagination, deletion, and later aggregation require relational integrity. Recently viewed uses one updatable row rather than an append-only event table because T14 needs only deduplicated latest state, not analytics history.

### 4. Use insert-if-absent favorites and serialize recent-view retention per buyer

Favorite PUT uses a uniqueness-safe insert/upsert that preserves the original `favoritedAt`; repeated PUT does not reorder an already-saved item. DELETE uses owned `deleteMany`, so absence is a successful no-op. New favorites first verify that the product, shop, and soft-delete/status conditions match the public catalog. Unfavorite does not require current displayability so unavailable rows remain removable.

Recent-view PUT starts a transaction by locking the owning user row, verifies current public displayability, upserts `lastViewedAt` using server time, then removes rows beyond the newest 100 ordered by `lastViewedAt DESC, productId ASC`. The same per-user lock serializes concurrent view refresh/trim operations across API replicas and makes the committed order deterministic. The injected clock used by existing modules remains the test seam; client timestamps are never accepted.

An append-only view log plus asynchronous compaction was rejected because it adds unbounded storage and background-job complexity without serving a T14 requirement. Client-only timestamps or retention were rejected because they cannot enforce cross-device order or privacy.

### 5. Apply different unavailable-product policies to favorites and history

Favorite list queries start from the owned relation and left/project the current product lifecycle. Soft-deleted, non-active, or inactive-shop products remain as unavailable entries so the buyer understands why a saved item disappeared and can remove it. If the physical product row is deleted, the cascade removes the relation and the item is omitted.

Recently viewed queries join only the same displayable product predicate used by public catalog detail and calculate `totalItems` from that filtered set. Non-displayable history rows can remain internally until displaced by retention, but are never returned or counted. This preserves correct public pagination and avoids leaking draft/archived state.

Using one policy for both lists was rejected: silently dropping a favorite is confusing, while preserving unavailable browsing history adds clutter and increases the risk of exposing private catalog states.

### 6. Use strict page-based pagination consistent with the existing catalog

Both list endpoints accept only `page` and `pageSize`, default to `1` and `20`, and cap page size at `48`. Queries reject unknown/repeated/noncanonical values. Reads use a stable secondary product-ID order and return `page`, `pageSize`, `totalItems`, and `totalPages`; an out-of-range valid page is an empty success.

Cursor pagination was considered, but page metadata and numbered navigation already exist in the storefront and the bounded per-user collections are small enough for consistent count-plus-offset queries. Deterministic ordering and database indexes protect repeatability within the normal limitation that concurrent mutations can shift later pages.

### 7. Keep personalized state inside client boundaries and the current auth lifecycle

Add account API helpers that call only through `authenticatedFetch`. A reusable favorite-state client boundary batches visible product IDs once session restoration resolves, shares state across controls on that surface, and performs optimistic toggles with per-product pending guards and rollback announcements. Guest controls remain unpressed and link to sign-in with only a safe internal return path; they do not queue a hidden mutation.

Integrate favorite controls into search/home product cards and product detail without changing product navigation semantics. Product detail records a view once per mounted product after both the product exists and session restoration resolves authenticated; failure is non-blocking because browsing succeeded. The two account screens reuse protected loading/guest/error composition and canonical product-card presentation, with unavailable favorite cards rendered separately.

Engagement state stays out of `AuthUser`, access tokens, cookies, URLs, local storage, and session storage. Logout unmount/state reset clears it. A global client state dependency was rejected because current needs fit scoped React state and request helpers.

### 8. Verify privacy, idempotency, and presentation at the narrowest useful layers

Contract tests cover strict shapes, bounds, pagination, unavailable items, and batch ordering. Repository/service tests cover ownership, displayability predicates, stable order, favorite timestamp preservation, repeated deletion, concurrent recent upserts, and deterministic retention. Supertest covers exact routes, auth/origin guards, validation, status codes, no-store headers, and sanitized errors. Isolated PostgreSQL tests cover migration, composite uniqueness, indexes/cascades, concurrent duplicates, retention, unrelated-user isolation, and unavailable-product policies.

Frontend tests cover session restoration, guest handoff, batched hydration, optimistic success/rollback, duplicate-submit prevention, view-record failure tolerance, page states, and storage/URL privacy. A mocked non-mutating `test:e2e:engagement:quick` suite covers guest/authenticated flows, responsive screens, accessibility, and API request shapes on mobile/tablet/desktop without modifying the developer database.

## Risks / Trade-offs

- [Page-number results can shift when favorites/views change between requests] → Keep deterministic ordering, expose canonical totals, and accept normal bounded-collection page semantics.
- [An unavailable favorite exposes that the buyer once saved a now-private product] → Return only safe minimal identity and unavailable state to its owner; expose no draft content, price, or link.
- [Product-card personalization can create excessive requests] → Batch at most 48 visible IDs per surface and share the result among controls.
- [Rapid view records create write traffic] → Record only authenticated successful product-detail mounts, deduplicate by composite key, and make retries idempotent.
- [Recent retention transaction locks the user row] → Keep the transaction small and use the same user-first lock ordering documented by T13 to avoid future cross-capability deadlocks.
- [Optimistic favorite UI can temporarily disagree with the server] → Disable duplicate actions, rollback on failure, announce the error, and treat parsed server responses as authoritative.
- [Behavioral mappings are sensitive even when product IDs are public] → Keep responses owner-only/non-cacheable and prohibit complete mappings in telemetry or browser persistence.

## Migration Plan

1. Add the two relation models and an additive migration with foreign keys, composite primary keys, timestamp defaults, and deterministic pagination indexes.
2. Apply the migration from empty and twice to the isolated PostgreSQL environment. Existing users/products require no backfill and begin with empty collections.
3. Add contracts, backend module/routes, seed/verification fixtures, frontend controls/screens, documentation, and focused tests; deploy API before or with the web so client helpers never target missing routes.
4. Run formatting, lint, typecheck, contract/API/web suites, isolated PostgreSQL tests, production builds, and engagement/auth/homepage quick E2E regressions.
5. Roll back application code first if necessary. The unused additive tables are backward-compatible and can remain for a forward correction; dropping behavioral data requires an explicit retention decision rather than an automatic rollback.

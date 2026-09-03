## Purpose

Defines stable public shop discovery, shop-scoped product browsing, and private authenticated following so buyers can evaluate and revisit marketplace sellers safely.

## ADDED Requirements

### Requirement: Canonical public shop identity and availability

The system SHALL expose each active, non-deleted shop at the canonical storefront path `/shops/{shopSlug}` using its unique stored slug. Unknown, malformed, inactive, suspended, or deleted shops MUST not expose a public profile or catalog and SHALL produce the same sanitized unavailable behavior.

#### Scenario: Active shop is addressable by slug

- **WHEN** a buyer opens the canonical path for an active, non-deleted shop
- **THEN** the system returns that shop's public storefront and canonical slug without relying on a numeric identifier

#### Scenario: Non-public shop is unavailable

- **WHEN** a buyer requests an unknown, malformed, inactive, suspended, or deleted shop slug
- **THEN** the system returns the same public not-found experience without exposing the shop's private status or owner

#### Scenario: Shop slug is stable across product changes

- **WHEN** products are added, removed, or made unavailable for a public shop
- **THEN** the shop's canonical storefront URL remains unchanged

### Requirement: Public shop profile and server-derived summaries

The system SHALL return a strict public profile containing the shop identifier, slug, name, location, joined timestamp, active product count, total sold count, rating average and rating count, follower count, public category facets, and a structured response-metadata placeholder. Rating and sales summaries MUST be derived only from currently displayable products, the rating average MUST be weighted by rating counts, empty aggregates MUST be zero-valued, and the response placeholder MUST use explicit null values instead of invented performance claims.

#### Scenario: Profile aggregates displayable products

- **WHEN** a public shop has displayable products with rating and sales aggregates
- **THEN** its profile returns deterministic active-product, rating, and sold summaries calculated from only those products

#### Scenario: Shop has no public products

- **WHEN** an active shop has no displayable products
- **THEN** its profile remains available with zero product, rating, and sales summaries and an empty category facet list

#### Scenario: Response performance is not implemented

- **WHEN** the public profile is returned before messaging-derived response metrics exist
- **THEN** response rate and response time are explicitly null and accompanied only by a neutral availability message

### Requirement: Public shop catalog scope and displayability

The system SHALL expose only products owned by the requested public shop that satisfy the same product, variant, inventory, shop, category, and media displayability rules as the global public catalog. Product-card pricing, promotions, images, ratings, sales, category identity, and product links MUST reuse the canonical public catalog presentation contract.

#### Scenario: Catalog excludes another shop's product

- **WHEN** a product matching the query belongs to a different shop
- **THEN** it never appears in the requested shop's catalog, facets, or total count

#### Scenario: Catalog excludes non-displayable product

- **WHEN** a shop product is draft, archived, deleted, in an inactive category, has no public variant, or has no valid inventory and price projection
- **THEN** it is omitted from the public shop catalog and all derived counts

#### Scenario: Product presentation remains canonical

- **WHEN** a shop catalog product is rendered
- **THEN** its card links to `/products/{productId}` and uses the same server-authoritative product summary as global catalog surfaces

### Requirement: Strict shop catalog query, pagination, and sorting

The system SHALL support shop-catalog keyword search, category-slug filtering, sort, page, and page-size inputs. It MUST reuse the existing catalog defaults and bounds of page 1, page size 12, and maximum page size 48; accept only `relevance`, `newest`, `best-selling`, `price-asc`, and `price-desc`; default to relevance when a keyword is present and newest otherwise; reject unknown, repeated, malformed, oversized, or out-of-range inputs; and apply stable product-identifier tie-breakers.

#### Scenario: Default catalog page

- **WHEN** a buyer requests a public shop catalog without query parameters
- **THEN** the system returns page 1 with at most 12 products in newest order and deterministic pagination metadata

#### Scenario: Keyword and category narrow the shop catalog

- **WHEN** a buyer provides a valid normalized keyword and category slug
- **THEN** only matching displayable products from that shop and category hierarchy are returned

#### Scenario: Sort ties are deterministic

- **WHEN** multiple shop products have the same primary sort value
- **THEN** their order is resolved with deterministic secondary timestamps and product identifiers so pages do not shuffle

#### Scenario: Page exceeds the result range

- **WHEN** a valid page number is greater than the calculated total pages
- **THEN** the system returns an empty item list with unchanged total and query metadata

#### Scenario: Catalog query is invalid

- **WHEN** a catalog query contains an unknown key, repeated value, unsupported sort, invalid category slug, keyword over 120 characters, non-positive page, or page size above 48
- **THEN** the system returns sanitized validation Problem Details and performs no fallback query

### Requirement: Shop category facets are scoped and deterministic

The system SHALL return each active category represented by at least one displayable product in the public shop, including slug, name, parent slug, and displayable product count. Facets MUST be ordered by configured category order and stable identifier, MUST exclude zero-count and foreign-shop categories, and MUST describe the unfiltered public shop catalog rather than only the current page.

#### Scenario: Category facets describe the shop

- **WHEN** a public shop has displayable products in multiple active categories
- **THEN** the storefront returns deterministic category facets with counts for that shop only

#### Scenario: Current filter does not erase navigation facets

- **WHEN** a buyer filters the shop catalog to one category or keyword
- **THEN** the response retains the shop's unfiltered public category facet set while product totals reflect the active query

### Requirement: Private authenticated shop following

The system SHALL allow an active authenticated buyer to follow an active public shop and to remove any relationship they own by canonical shop identifier even if that shop later becomes unavailable. Follow relationships MUST be private to the authenticated user, MUST not expose follower identities, and MUST reject attempts to follow the user's own shop or a non-public shop using sanitized domain errors.

#### Scenario: Buyer follows a public shop

- **WHEN** an authenticated buyer who does not own the shop follows an active public shop
- **THEN** the buyer-shop relationship is recorded with a server UTC timestamp and the response confirms followed state and the current public follower count

#### Scenario: Shop owner attempts self-follow

- **WHEN** an authenticated owner attempts to follow their own shop
- **THEN** the system rejects the request without creating a relationship or changing the count

#### Scenario: Buyer unfollows a shop that became unavailable

- **WHEN** an authenticated buyer removes their owned relationship after the followed shop becomes inactive or deleted
- **THEN** the relationship is removed idempotently without exposing the shop's private lifecycle state

#### Scenario: Guest attempts follow mutation

- **WHEN** a guest calls follow or unfollow
- **THEN** the API returns unauthorized and the storefront offers sign-in without queuing a mutation

#### Scenario: Following data remains private

- **WHEN** one buyer reads follow state or changes a relationship
- **THEN** no other buyer's relationship, identity, timestamp, or followed-shop collection is revealed

### Requirement: Idempotent and concurrency-safe follow state

The system SHALL enforce at most one relationship per buyer and shop. Repeated or concurrent follow requests MUST preserve the first follow timestamp and one relationship; repeated or concurrent unfollow requests MUST succeed with an unfollowed state; and public follower counts MUST equal persisted unique relationships without a drift-prone client-controlled counter.

#### Scenario: Repeated follow preserves first timestamp

- **WHEN** a buyer follows the same shop more than once
- **THEN** each successful response confirms followed state while the stored relationship count and original followed timestamp remain unchanged

#### Scenario: Concurrent follow does not overcount

- **WHEN** concurrent follow requests target the same buyer and shop
- **THEN** exactly one relationship exists and the returned follower count reflects one unique follower

#### Scenario: Repeated unfollow is harmless

- **WHEN** a buyer unfollows a shop they no longer follow
- **THEN** the request still returns a confirmed unfollowed state without decrementing another buyer's relationship

#### Scenario: Relationship cascades on hard deletion

- **WHEN** a followed user or shop is hard-deleted by an authorized maintenance path
- **THEN** its follow relationships are removed and future follower counts remain consistent

### Requirement: Bounded owner-scoped follow-state lookup

The system SHALL provide an authenticated follow-state lookup for up to 48 distinct canonical shop identifiers in request order. It MUST return `false` for canonical unknown or unavailable identifiers, reject duplicates and oversized batches, preserve request order, and scope every result to the authenticated buyer.

#### Scenario: Mixed batch preserves request order

- **WHEN** an authenticated buyer requests state for followed, unfollowed, unavailable, and unknown canonical shop identifiers
- **THEN** the system returns one boolean state per identifier in the same order and reveals no other buyer's state

#### Scenario: Batch is invalid

- **WHEN** the state request is empty, contains a duplicate or malformed identifier, or exceeds 48 identifiers
- **THEN** the system returns sanitized validation Problem Details without querying or returning relationship data

### Requirement: Product detail links to canonical storefront

The system SHALL make the shop identity on every public product-detail page a link to `/shops/{shopSlug}` while preserving existing product availability, related-product, favorite, and recently-viewed behavior.

#### Scenario: Buyer opens product shop

- **WHEN** a buyer activates the shop identity on a public product-detail page
- **THEN** navigation opens that product's canonical public shop storefront

#### Scenario: Existing product interactions remain healthy

- **WHEN** storefront navigation is added to product detail
- **THEN** gallery, variant selection, favorite state, recent-view recording, related products, and anonymous purchase intents continue to behave as before

### Requirement: Responsive and accessible storefront experience

The web application SHALL render the shop profile, follow control, category navigation, keyword search, sort controls, product grid, pagination, and loading, empty, unavailable, validation, and retry states at mobile, tablet, and desktop widths. Controls MUST be keyboard operable, touch targets MUST be at least 44 CSS pixels where practical, focus MUST remain visible, state changes MUST be announced accessibly, and the page MUST not overflow horizontally.

#### Scenario: Authenticated follow interaction is accessible

- **WHEN** a keyboard user follows or unfollows a shop
- **THEN** the control exposes pressed and pending state, prevents duplicate submission, retains focus, and announces success or rollback failure

#### Scenario: Guest follow handoff is safe

- **WHEN** a guest activates the follow control
- **THEN** sign-in receives only the internal storefront return path and no queued follow action, shop state, or behavioral value is placed in the URL or browser storage

#### Scenario: Empty filtered catalog remains actionable

- **WHEN** an active filter produces no shop products
- **THEN** the storefront keeps the public profile visible and offers a keyboard-accessible way to clear the query

#### Scenario: Storefront adapts across supported widths

- **WHEN** the storefront is rendered at supported mobile, tablet, and desktop viewports
- **THEN** profile, controls, facets, cards, and pagination remain readable, operable, and free of horizontal overflow

### Requirement: Public API safety, cache policy, and compatibility

All shop endpoints SHALL use `/api/v1`, strict response contracts, OpenAPI documentation, and sanitized Problem Details. Public profile and catalog reads MAY be anonymously cacheable only if they contain no personalized follow state and use an explicit cache policy; authenticated state and every mutation MUST use `Cache-Control: no-store`; browser mutations MUST enforce the existing trusted-origin policy; and the change MUST remain additive for existing users, shops, products, catalog routes, authentication, and public product contracts.

#### Scenario: Public response contains no personalization

- **WHEN** a guest and authenticated buyer request the same public shop profile or catalog query
- **THEN** the public representation is identical and contains no buyer-specific follow state or private owner data

#### Scenario: Authenticated response is non-cacheable

- **WHEN** follow state is read or a follow relationship is changed
- **THEN** the response is marked non-cacheable and includes no relationship collection in errors or telemetry

#### Scenario: Browser mutation has an untrusted origin

- **WHEN** a browser follow or unfollow request has a missing or untrusted mutation origin under the existing origin policy
- **THEN** the API rejects it without changing persisted relationships

#### Scenario: Existing data needs no backfill

- **WHEN** the additive persistence migration is deployed over existing users, shops, and products
- **THEN** all existing records remain valid and begin with zero new follow relationships unless deterministic development fixtures explicitly add them

## Purpose

Give authenticated buyers a private, deterministic account view of the shops they follow so those shops remain discoverable and every saved relationship can be managed safely.

## ADDED Requirements

### Requirement: Authenticated followed-shop list endpoint

The system SHALL expose `GET /api/v1/account/followed-shops` only to an active authenticated buyer, derive the owner from the bearer session, return `Cache-Control: no-store`, and document its success and sanitized failure shapes in OpenAPI.

#### Scenario: Authenticated buyer lists followed shops

- **WHEN** an active authenticated buyer requests the followed-shop endpoint
- **THEN** the system returns only relationships owned by that buyer and no follower identities or relationships belonging to another account

#### Scenario: Guest requests the private list

- **WHEN** a request has no valid authenticated session
- **THEN** the system returns the existing sanitized `401` authentication problem without querying or revealing a relationship collection

#### Scenario: Followed-shop persistence is unavailable

- **WHEN** the private list cannot be read from its authoritative data source
- **THEN** the system returns sanitized `503` Problem Details without shop relationship values, owner identifiers, SQL details, or database credentials

### Requirement: Strict page-based query and deterministic ordering

The endpoint MUST accept only optional scalar `page` and `pageSize` parameters, default them to `1` and `20`, cap `pageSize` at `48`, reject unknown, repeated, non-integer, non-positive, or out-of-bound values with sanitized `400` Problem Details, and return canonical `page`, `pageSize`, `totalItems`, and `totalPages` metadata. Relationships SHALL be ordered by `followedAt DESC` and then `shopId ASC`.

#### Scenario: Default page is requested

- **WHEN** the buyer omits both pagination parameters
- **THEN** the first page contains at most 20 relationships in deterministic newest-followed order and returns metadata calculated from all relationships currently owned by that buyer

#### Scenario: Valid page is beyond the final page

- **WHEN** the buyer requests a valid positive page number greater than `totalPages`
- **THEN** the system returns an empty item array with unchanged canonical totals instead of treating the request as an error

#### Scenario: Query contains repeated or unsupported values

- **WHEN** `page` or `pageSize` is repeated, malformed, outside its bounds, or accompanied by an unknown query parameter
- **THEN** the system rejects the complete request with `400` and identifies only safe invalid parameter names

#### Scenario: Equal follow timestamps cross a page boundary

- **WHEN** two owned relationships have the same `followedAt` timestamp
- **THEN** their `shopId ASC` tie-breaker produces stable ordering across repeated reads and adjacent pages

### Requirement: Available and unavailable followed-shop projections

Every returned item MUST contain the canonical `shopId` and server-owned `followedAt`. An active, non-deleted shop SHALL be returned as `available` with a canonical storefront link, public name, location, and current follower count. An inactive or soft-deleted shop SHALL remain in the private relationship page and totals as `unavailable`, expose only its identifier, retained display name, a null link, and follow timestamp, and omit location, follower count, lifecycle reason, owner data, and any other non-public state. A physically deleted shop SHALL be absent after its cascaded relationship deletion.

#### Scenario: Followed shop remains public

- **WHEN** an owned relationship points to an active, non-deleted shop
- **THEN** the item is available, links to `/shops/{shopSlug}`, and contains only the documented public summary and relationship timestamp

#### Scenario: Followed shop becomes inactive or soft-deleted

- **WHEN** an owned relationship points to a shop that is no longer publicly available
- **THEN** the item remains ordered and counted but is rendered unavailable with no public link, location, follower count, or lifecycle explanation

#### Scenario: Shop is physically deleted

- **WHEN** hard deletion cascades through an owned follow relationship
- **THEN** that relationship no longer appears in items or pagination totals

#### Scenario: Current public count changes

- **WHEN** other buyers follow or unfollow an available shop before the list read
- **THEN** the returned available summary uses the current persisted unique follower count rather than a client-maintained or denormalized value

### Requirement: Followed-shops account screen

The web application SHALL provide `/account/followed-shops` and expose it from authenticated account navigation. The page MUST wait for session restoration, provide a safe login handoff for guests, request data only through `authenticatedFetch`, and render protected loading, populated, empty, unavailable-item, validation, recoverable-error, and out-of-range states without storing the list or token in URLs, local storage, or session storage.

#### Scenario: Authenticated buyer opens the account destination

- **WHEN** session restoration confirms an authenticated buyer
- **THEN** the page loads the normalized page query and renders available and unavailable followed-shop cards with canonical pagination controls

#### Scenario: Guest opens the account destination

- **WHEN** session restoration resolves to guest on `/account/followed-shops`
- **THEN** the page offers sign-in with only a validated internal return path and does not request or expose followed-shop data

#### Scenario: Buyer follows no shops

- **WHEN** the endpoint returns zero relationships
- **THEN** the page presents an accessible empty state with a route back to public marketplace discovery

#### Scenario: Account list fails to load

- **WHEN** a transport, status, timeout, or contract error prevents the list from loading
- **THEN** the page keeps account navigation available and offers an explicit retry without exposing stale private data

### Requirement: Buyer can unfollow from the private list

Each followed-shop item SHALL provide an accessible unfollow action that reuses the existing idempotent `DELETE /api/v1/account/followed-shops/{shopId}` operation. The UI MUST prevent duplicate submissions, retain the item until success is confirmed, announce success or failure, and reconcile pagination so an emptied non-first page moves to the nearest valid preceding page.

#### Scenario: Buyer unfollows an available shop

- **WHEN** the buyer activates unfollow and the server confirms `isFollowing: false`
- **THEN** the relationship is removed from the private list, totals and pagination are refreshed, and the shop's public follower count is not maintained by client arithmetic

#### Scenario: Buyer removes an unavailable relationship

- **WHEN** the buyer unfollows an unavailable item
- **THEN** the same idempotent operation succeeds without requiring a public shop link or leaking its current follower count

#### Scenario: Unfollow fails

- **WHEN** the mutation fails or returns a malformed response
- **THEN** the item remains visible, the action becomes retryable, focus is retained, and an accessible rollback message is announced

#### Scenario: Final item on a later page is removed

- **WHEN** successful unfollow leaves the current page empty while earlier relationships still exist
- **THEN** the page navigates to the nearest valid preceding page and loads its canonical contents

### Requirement: Responsive, accessible, and compatible behavior

The screen SHALL remain keyboard operable, visibly focused, readable, and free of horizontal overflow at the supported mobile, tablet, and desktop widths. T15 follow/status/storefront behavior, public shop responses, authentication semantics, account profile/address screens, favorites, recently viewed, catalog, product detail, and automatic CI trigger state MUST remain compatible.

#### Scenario: Keyboard user manages a followed shop

- **WHEN** a keyboard user navigates cards, opens an available shop, changes page, or unfollows
- **THEN** every control has an accessible name, visible focus, practical touch target, pending state, and live result announcement

#### Scenario: Screen renders at supported widths

- **WHEN** `/account/followed-shops` renders at mobile, tablet, or desktop reference widths
- **THEN** cards, actions, unavailable states, and pagination remain usable without horizontal overflow

#### Scenario: Existing shop flow is exercised after delivery

- **WHEN** a buyer follows or unfollows from an individual storefront or reads a bounded status batch
- **THEN** the existing T15 response shapes, idempotency, privacy, and screen behavior remain unchanged

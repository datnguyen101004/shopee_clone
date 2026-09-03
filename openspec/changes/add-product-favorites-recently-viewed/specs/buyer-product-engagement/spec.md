## Purpose

Provide authenticated buyers with private, persistent ways to save products and revisit recently viewed product details across sessions without exposing behavioral data.

## ADDED Requirements

### Requirement: Authenticated private engagement boundary

The system MUST require a valid active authenticated session for every favorite, favorite-status, and recently viewed operation, SHALL derive the buyer from that session, and SHALL return only engagement data owned by that buyer.

#### Scenario: Guest requests engagement data

- **WHEN** a request without a valid authenticated session reads or mutates favorites or recently viewed history
- **THEN** the system returns the standard authentication failure without engagement data or mutation

#### Scenario: Buyer reads engagement data

- **WHEN** an authenticated buyer lists favorites, checks favorite status, or lists recently viewed products
- **THEN** the response contains only relationships owned by that buyer and is marked non-cacheable

### Requirement: Idempotent product favorites

The system SHALL allow an authenticated buyer to favorite a publicly displayable product and unfavorite any product previously saved by that buyer. Favorite and unfavorite operations MUST be idempotent and MUST NOT create duplicate buyer-product relationships.

#### Scenario: Buyer favorites an active product

- **WHEN** an authenticated buyer favorites a publicly displayable product that is not already saved
- **THEN** the system creates exactly one favorite relationship and returns the canonical favorite state and save timestamp

#### Scenario: Buyer repeats a favorite operation

- **WHEN** an authenticated buyer favorites the same already-saved product one or more times
- **THEN** every request succeeds with the same saved relationship and no duplicate row or reordered timestamp is created

#### Scenario: Buyer repeats an unfavorite operation

- **WHEN** an authenticated buyer unfavorites a product that is saved or already absent from their favorites
- **THEN** the operation succeeds idempotently and the product is absent from that buyer's favorites

#### Scenario: Buyer favorites a non-displayable unknown product

- **WHEN** an authenticated buyer tries to newly favorite an invalid, missing, deleted, draft, archived, or inactive-shop product
- **THEN** the system returns the same not-found response and creates no favorite relationship

### Requirement: Paginated favorite collection and availability policy

The system SHALL expose a private paginated favorites collection ordered by `favoritedAt` descending with product identifier as a deterministic tie-breaker. A soft-deleted or otherwise non-displayable product that was previously favorited SHALL remain removable in the collection as an unavailable item without a purchasable link; a hard-deleted relationship MAY disappear through data-retention policy.

#### Scenario: Buyer lists available favorites

- **WHEN** an authenticated buyer requests a valid favorites page
- **THEN** the system returns owned favorite items in deterministic newest-save order with current safe product-card data and pagination metadata

#### Scenario: Saved product becomes unavailable

- **WHEN** a previously favorited product becomes draft, archived, soft-deleted, or belongs to an inactive shop
- **THEN** the favorites page identifies it as unavailable, exposes no product purchase/detail action, and still allows the buyer to unfavorite it

#### Scenario: Favorite becomes available again

- **WHEN** a previously unavailable saved product becomes publicly displayable again
- **THEN** the next favorites read returns its current available product presentation without changing the original favorite timestamp

### Requirement: Batched favorite-state lookup

The system SHALL allow an authenticated buyer to request favorite membership for a bounded, deduplicated set of canonical product identifiers and SHALL return an explicit boolean state for every accepted identifier without exposing any other buyer's state.

#### Scenario: Storefront hydrates visible favorite controls

- **WHEN** an authenticated storefront requests favorite states for the distinct products currently visible on a supported page
- **THEN** the system returns one state per requested product using a bounded request and does not require one network request per card

#### Scenario: Favorite-state query is malformed or oversized

- **WHEN** the request contains an invalid identifier, duplicate that cannot be canonicalized, unknown query property, or more identifiers than the documented maximum
- **THEN** the complete request is rejected with validation Problem Details and no partial result

### Requirement: Deduplicated recently viewed recording

The system SHALL record a recently viewed entry only for an authenticated buyer after a publicly displayable product detail has loaded successfully. The relationship MUST be unique per buyer and product; a repeat view SHALL move that product to the newest position without creating a duplicate. The system SHALL retain at most the latest 100 entries per buyer.

#### Scenario: Authenticated buyer views an active product

- **WHEN** an authenticated buyer successfully loads a publicly displayable product detail
- **THEN** the client records the view through the authenticated operation and the product becomes the buyer's newest recently viewed item

#### Scenario: Buyer views the same product repeatedly

- **WHEN** concurrent or sequential valid view records target the same buyer and product
- **THEN** exactly one relationship remains with the latest committed view time and appears once at the newest correct position

#### Scenario: History exceeds the retention bound

- **WHEN** a new distinct view would leave a buyer with more than 100 recently viewed relationships
- **THEN** the record operation atomically retains the newest 100 and removes the deterministic oldest excess entries

#### Scenario: Guest views a product

- **WHEN** a guest successfully views a public product detail
- **THEN** no recently viewed API request is made and no product history is written to browser persistence

### Requirement: Paginated recently viewed collection

The system SHALL expose a private recently viewed collection ordered by `lastViewedAt` descending with product identifier as a deterministic tie-breaker. The collection SHALL include only products that remain publicly displayable at read time and SHALL calculate pagination metadata from that displayable set.

#### Scenario: Buyer lists recent products

- **WHEN** an authenticated buyer requests a valid recently viewed page
- **THEN** the system returns each displayable product at most once in deterministic latest-view order with its canonical last-viewed timestamp

#### Scenario: Recently viewed product becomes unavailable

- **WHEN** a history row references a product that is no longer publicly displayable
- **THEN** that product is omitted from the collection and from its public pagination totals without leaking its current private state

### Requirement: Strict deterministic engagement pagination

Favorites and recently viewed list operations MUST use strict `page` and `pageSize` query validation, SHALL default to page 1 and 20 items, SHALL cap page size at 48, and SHALL return canonical total-item and total-page metadata. Unknown, repeated, non-integer, negative, zero, or oversized pagination values MUST be rejected.

#### Scenario: Buyer requests an out-of-range valid page

- **WHEN** an authenticated buyer requests a syntactically valid page beyond the final page
- **THEN** the system returns an empty item list with unchanged canonical pagination totals

#### Scenario: Buyer submits invalid pagination

- **WHEN** a pagination query is malformed, ambiguous, or outside documented bounds
- **THEN** the system returns validation Problem Details and performs no mutation

### Requirement: Responsive favorite and history experience

The web application SHALL provide `/account/favorites` and `/account/recently-viewed` views, account navigation, and accessible favorite controls on supported catalog cards and product detail. It SHALL represent session restoration, guest, loading, empty, pagination, unavailable, pending, success, and recoverable failure states without blocking normal product browsing when view recording fails.

#### Scenario: Authenticated buyer toggles a favorite

- **WHEN** a buyer activates a favorite control on a supported product surface
- **THEN** the control exposes its pressed and pending state, prevents duplicate submission, reflects the confirmed server result, and rolls back with an accessible error when the mutation fails

#### Scenario: Guest activates a favorite control

- **WHEN** a guest activates a favorite control
- **THEN** the application presents a sign-in action with a safe internal return path and does not claim that the product was saved

#### Scenario: Buyer opens a collection screen

- **WHEN** an authenticated buyer opens favorites or recently viewed history on a mobile, tablet, or desktop viewport
- **THEN** the screen loads the correct private page, exposes useful empty/failure/retry states, and provides accessible product and pagination actions without horizontal overflow

### Requirement: Privacy-safe engagement handling

The system MUST treat the mapping between a buyer and products as private behavioral data. Responses SHALL be non-cacheable; logs, metrics, errors, URLs, browser storage, and browser-readable cookies MUST NOT contain complete favorite/history collections or persisted buyer-product mappings. The browser SHALL keep loaded engagement state only in memory and clear it with the authenticated session lifecycle.

#### Scenario: Engagement request fails

- **WHEN** validation, authentication, database, or service failure prevents an engagement operation
- **THEN** public errors and telemetry contain only stable problem metadata, coarse action/outcome, and opaque identifiers where safe without a complete behavioral payload

#### Scenario: Account page is reloaded or user logs out

- **WHEN** an engagement screen reloads or the user ends the session
- **THEN** the application restores or clears state through the existing session coordinator and writes no engagement collection to local storage, session storage, URL parameters, or readable cookies

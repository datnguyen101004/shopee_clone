## Purpose

Defines the authenticated, server-authoritative multi-shop cart that lets signed-in buyers build durable purchase intent without reserving inventory or creating an order.

## ADDED Requirements

### Requirement: Require authentication for every cart operation

Every `/api/v1/cart` route SHALL require a valid authenticated session and SHALL resolve ownership only from that session. The system SHALL ignore client-supplied owner identifiers, SHALL maintain at most one active cart per user, and SHALL never create or resolve a guest cart, guest credential, guest cookie, or guest-to-user merge. Cart reads and responses SHALL be private and `no-store`.

#### Scenario: Authenticated buyer accesses the cart

- **WHEN** a buyer presents a valid access session to a cart endpoint
- **THEN** the system resolves only that buyer's active cart and never accepts a user or owner ID from the request body, path, or query

#### Scenario: Anonymous caller accesses the cart

- **WHEN** a caller without a valid access session reads a cart endpoint or sends a mutation that has passed the shared origin and media-type boundary
- **THEN** the API returns sanitized `401` Problem Details and creates or changes no cart state

#### Scenario: Reject an unsafe anonymous mutation before authentication

- **WHEN** an anonymous cart mutation has a missing, malformed, or untrusted browser Origin
- **THEN** the shared browser-mutation guard returns its sanitized `403` denial before authentication or cart domain logic and creates or changes no cart state

#### Scenario: Buyer addresses another cart's line

- **WHEN** an authenticated buyer submits a line identifier that is absent or belongs to another user
- **THEN** the system returns the same sanitized not-found response and exposes no ownership distinction

### Requirement: Present a canonical multi-shop cart projection

The system SHALL return a versioned cart grouped by canonical shop identity and ordered by shop creation identity and line creation time with stable ID tie-breakers. Each line SHALL include the current safe product, variant, media, shop, unit price, stock, quantity, selection, subtotal, and issue projection needed by the buyer. The projection SHALL include distinct line count, selected valid line count, selected valid quantity, and selected merchandise subtotal in integer minor units, but SHALL NOT invent shipping, voucher, tax, reservation, or checkout totals.

#### Scenario: Read a populated multi-shop cart

- **WHEN** the current authenticated cart contains lines from multiple shops
- **THEN** the response groups each line under its authoritative shop, returns deterministic order and one cart version, and calculates only the documented merchandise summary

#### Scenario: Read an empty cart

- **WHEN** the authenticated buyer has no active cart lines
- **THEN** the response returns an empty group list and zero canonical counts and subtotal

#### Scenario: Keep unavailable lines visible

- **WHEN** a persisted line's shop, product, or variant is no longer purchasable
- **THEN** the response retains a privacy-safe line with an explicit unavailable issue so the buyer can remove it, while excluding it from effective selection and totals

### Requirement: Add a purchasable variant predictably

The system SHALL accept only a canonical variant identifier and positive whole-number quantity, derive product/shop/price/stock from current persistence, and create or merge the corresponding line in the authenticated cart. A duplicate variant addition SHALL sum quantities under a locked transaction and cap the result to the minimum of current stock, the documented per-line maximum of 99, and any active purchase limit. Newly created lines SHALL be selected by default. Every cap or current-data adjustment SHALL be returned explicitly rather than hidden.

#### Scenario: Add a new variant

- **WHEN** the buyer's cart does not contain the requested active in-stock variant and the requested quantity is allowed
- **THEN** one selected line is created with server-derived shop, current unit price, quantity, and snapshot metadata

#### Scenario: Add a duplicate variant

- **WHEN** the cart already contains the requested variant
- **THEN** the system increments that line rather than creating a duplicate and preserves the line's current selection state

#### Scenario: Cap a duplicate addition

- **WHEN** the summed quantity exceeds stock, 99, or an active purchase limit
- **THEN** the system stores the highest currently purchasable quantity and returns an adjustment describing the requested and accepted quantities

#### Scenario: Reject an unavailable addition

- **WHEN** the requested variant, product, category, or shop is inactive, deleted, mismatched, or has no sellable stock
- **THEN** the mutation returns sanitized cart Problem Details and does not create or modify a line

#### Scenario: Race duplicate additions

- **WHEN** concurrent authenticated requests add the same variant to one cart
- **THEN** exactly one line remains and its quantity reflects every accepted increment without exceeding the current purchasable limit

### Requirement: Update and remove owned cart lines safely

The system SHALL update quantity or idempotently remove a line only within the authenticated user's cart. Quantity updates SHALL require a positive whole number no greater than 99 and SHALL revalidate current purchase eligibility and stock. Mutations SHALL return the complete authoritative cart projection and SHALL use the submitted expected cart version to reject stale changes rather than silently overwrite a newer update.

#### Scenario: Update a valid quantity

- **WHEN** the buyer changes an owned line to a currently purchasable quantity using the current cart version
- **THEN** the system stores the quantity, increments the cart version, and returns recalculated authoritative line and cart totals

#### Scenario: Submit a stale update

- **WHEN** a mutation presents a cart version older than the persisted current version
- **THEN** the system rejects it with conflict Problem Details containing no private data and requires the client to refetch before retrying

#### Scenario: Remove an owned line repeatedly

- **WHEN** the buyer removes an owned line and repeats the same removal
- **THEN** both requests succeed idempotently and the returned cart contains no such line

### Requirement: Support line, shop, and whole-cart selection

The system SHALL let the buyer set selection for one line, every eligible line under one shop, or every eligible line in the cart. Selection mutations SHALL require the current cart version, SHALL never select an unavailable or invalid line effectively, and SHALL recalculate totals from selected valid lines only. A new eligible line SHALL default to selected.

#### Scenario: Select one line

- **WHEN** the buyer changes one eligible line's selection with the current version
- **THEN** only that line's stored selection changes and the returned counts and subtotal reflect the new effective selection

#### Scenario: Select a shop group

- **WHEN** the buyer selects or deselects a shop group
- **THEN** every eligible line currently belonging to that shop receives the requested state while ineligible lines remain effectively unselected

#### Scenario: Select all

- **WHEN** the buyer selects or deselects the whole cart
- **THEN** every eligible line receives the requested state and totals exclude all invalid or unavailable lines

### Requirement: Revalidate current commerce facts and expose reconciliation

Every cart mutation SHALL revalidate shop, category, product, variant, current unit price, stock, per-line maximum, and purchase limit before committing. Cart reads SHALL derive the same current presentation without changing persistence. The system SHALL expose typed issues for unavailable content, changed price, insufficient stock, and adjusted quantity; current server price SHALL be used for displayed subtotal, but no cart price SHALL be promised as final checkout pricing.

#### Scenario: Price changes after addition

- **WHEN** the current variant price differs from the line's last mutation snapshot
- **THEN** the cart shows both the prior and current unit price, marks the line as changed, and calculates the merchandise subtotal from the current server price

#### Scenario: Stock falls below the stored quantity

- **WHEN** current stock is positive but below a line's stored quantity
- **THEN** the line remains visible with an insufficient-stock issue, becomes effectively unselected, and contributes nothing to selected totals until corrected

#### Scenario: Persistence or aggregate validation fails

- **WHEN** current commerce facts cannot be read or safe integer totals cannot be calculated
- **THEN** the API returns sanitized unavailable Problem Details and commits no partial cart mutation

### Requirement: Coordinate cart state only after authentication

The storefront SHALL wait for auth restoration before accessing cart APIs. An authenticated session SHALL load the account cart into a single in-memory provider. An anonymous session SHALL make no cart API call, expose zero header count, and show a login-required state. The provider SHALL never store cart contents in localStorage or sessionStorage.

#### Scenario: Restore an authenticated session

- **WHEN** application startup restores a valid email or Google session
- **THEN** the storefront fetches that user's authoritative cart and updates the header and cart screen

#### Scenario: Restore an anonymous session

- **WHEN** application startup confirms that no user is authenticated
- **THEN** the storefront does not call a cart endpoint, reports zero cart count, and offers the existing login flow

#### Scenario: Sign out with a cart loaded

- **WHEN** the authenticated buyer signs out
- **THEN** the provider immediately clears private cart data from memory and returns to the anonymous login-required state

### Requirement: Deliver a responsive authenticated cart experience

The storefront SHALL replace the placeholder `/cart` route with authentication-required, loading, populated, empty, recoverable-error, stale-version, and reconciliation states. It SHALL group lines by shop, provide line/shop/all selection, quantity, removal, current issue, and subtotal controls with accessible labels, pending protection, live announcements, visible focus, practical touch targets, and no horizontal overflow at supported widths.

#### Scenario: Anonymous buyer opens the cart

- **WHEN** a buyer without a session opens `/cart`
- **THEN** the page explains that login is required and provides a login handoff returning safely to `/cart`

#### Scenario: Manage a populated cart

- **WHEN** an authenticated buyer opens a cart containing valid lines from multiple shops
- **THEN** the page renders grouped controls, current prices and stock, selected merchandise summary, and actions whose confirmed responses update the header and page

#### Scenario: Mutation fails

- **WHEN** a cart mutation fails or conflicts
- **THEN** the page keeps the last confirmed cart, announces a retryable error, refetches on conflict, and does not apply unconfirmed total arithmetic

#### Scenario: Use the cart by keyboard or narrow viewport

- **WHEN** the buyer manages the cart at 360, 768, or 1440 pixel reference widths or with keyboard-only input
- **THEN** controls remain operable in logical order with visible focus, accessible announcements, and no document-level horizontal overflow

### Requirement: Connect product detail and header to authenticated cart state

For a purchasable product selection, the product-detail page SHALL add directly to the server-backed cart only for an authenticated buyer. An anonymous add attempt SHALL use the existing login handoff with a safe return to the product route and SHALL create no cart state. The storefront header SHALL display the authoritative distinct active-line count only while authenticated and SHALL refresh after every confirmed cart mutation. Buy-now SHALL remain a safe authentication/checkout handoff and SHALL NOT create an order in T16.

#### Scenario: Anonymous buyer requests add-to-cart

- **WHEN** an anonymous buyer activates add-to-cart for a selected variant and quantity
- **THEN** the storefront navigates to login with a safe product return path and the API receives no cart mutation

#### Scenario: Authenticated buyer adds from product detail

- **WHEN** an authenticated buyer activates add-to-cart
- **THEN** the item is stored in that buyer's cart and the product page reports only the server-confirmed result

#### Scenario: Add request is pending or fails

- **WHEN** add-to-cart is already pending or returns a failure
- **THEN** duplicate submission is prevented, the previous header/cart state remains, and an accessible retry message is shown

### Requirement: Bound authenticated cart capacity

The system SHALL limit a cart to at most 100 active distinct lines and each line to at most 99 units before lower stock or purchase limits. It SHALL keep authenticated cart data until removed, consumed by later checkout work, or deleted under an explicit retention policy.

#### Scenario: Exceed line capacity

- **WHEN** an add would create the 101st active distinct line
- **THEN** the system rejects the addition with typed capacity Problem Details and leaves the cart unchanged

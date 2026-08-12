## Purpose

Provides a consistent, responsive buyer navigation surface that exposes storefront search, categories, anonymous account access, and cart access before their full domain features are implemented.

## ADDED Requirements

### Requirement: Buyer pages share one persistent marketplace header

The system SHALL render the same marketplace brand, search entry, account entry, cart entry, and category navigation on every buyer-facing public route while excluding operational and contributor-only routes.

#### Scenario: Navigate between buyer routes

- **WHEN** a visitor moves between the homepage and a buyer placeholder route
- **THEN** the same labelled header and navigation landmarks remain available in a consistent order

#### Scenario: Open an operational route

- **WHEN** a visitor opens the health or design-system route
- **THEN** the buyer marketplace header is not added to that route

### Requirement: Search submission routes to the catalogue query

The search form SHALL use the `q` query parameter and route a trimmed non-empty query to `/search` using a URL-safe encoding. Empty or whitespace-only input MUST NOT initiate a search navigation and SHALL expose actionable validation without clearing the field.

#### Scenario: Submit a product query

- **WHEN** a visitor submits `  tai nghe bluetooth  ` from the global search entry
- **THEN** the browser navigates to `/search?q=tai+nghe+bluetooth` and the destination communicates the submitted query

#### Scenario: Submit an empty query

- **WHEN** a visitor submits only whitespace from the global search entry
- **THEN** the visitor remains on the current route and the search control communicates that a keyword is required

#### Scenario: Submit without client-side JavaScript

- **WHEN** client-side JavaScript is unavailable and a visitor submits a non-empty search query
- **THEN** the native form navigation still reaches `/search` with the `q` query parameter

### Requirement: Anonymous account and cart states are explicit

The header SHALL expose an account entry that clearly identifies the visitor as not signed in and a cart entry that clearly communicates an empty zero-item state. These entries SHALL reserve stable `/login` and `/cart` destinations without implementing authentication or persisted cart behavior.

#### Scenario: Anonymous visitor inspects account and cart actions

- **WHEN** no authenticated-session or cart data is supplied
- **THEN** visible copy and accessible names communicate `Đăng nhập` and `Giỏ hàng, 0 sản phẩm`

#### Scenario: Open a reserved destination

- **WHEN** the visitor activates the account or cart entry
- **THEN** the corresponding buyer placeholder route opens inside the same marketplace shell

### Requirement: Category navigation adapts to viewport and input method

The category links SHALL be directly visible at tablet and desktop widths and SHALL use a labelled disclosure at compact mobile widths. The disclosure MUST support Enter, Space, Escape, accurate expanded state, and trigger focus restoration.

#### Scenario: Browse categories on desktop

- **WHEN** the viewport is at least the shared tablet breakpoint
- **THEN** category links are visible without requiring a disclosure action

#### Scenario: Open and close mobile categories by keyboard

- **WHEN** a keyboard user activates the compact category trigger and then presses Escape
- **THEN** category links open, close again, and focus returns to the trigger

### Requirement: Header interaction remains accessible and responsive

The header SHALL use semantic banner, search, and navigation landmarks; preserve visible focus; keep primary mobile targets at least 44 CSS pixels; and avoid document-level horizontal overflow at the 360×800, 768×1024, and 1440×900 reference viewports.

#### Scenario: Traverse the header with a keyboard

- **WHEN** a visitor tabs through the header
- **THEN** each brand, search, account, cart, disclosure, and category action receives focus in a logical sequence with a visible focus indicator

#### Scenario: Render at a reference viewport

- **WHEN** a buyer route renders at any supported reference viewport
- **THEN** essential header actions remain visible or available through the mobile disclosure and the document does not overflow horizontally

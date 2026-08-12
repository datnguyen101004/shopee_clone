## Purpose

Provides buyers with a stable, paginated catalogue of displayable marketplace products and consistent Shopee-style card metadata across normal, empty, and unavailable-data conditions.

## ADDED Requirements

### Requirement: Public catalogue API paginates displayable products server-side

The system SHALL expose an anonymous public catalogue endpoint whose `page` and `pageSize` inputs are positive bounded integers. Each successful response SHALL include the normalized query, current page, page size, total item count, total page count, and products selected after server-side filtering and pagination.

#### Scenario: Request the first catalogue page

- **WHEN** a buyer requests the catalogue without explicit pagination values
- **THEN** the endpoint applies documented defaults and returns the first deterministically ordered page with complete pagination metadata

#### Scenario: Request a later page

- **WHEN** a buyer requests a valid page within the available range
- **THEN** the endpoint returns only that page's products and reports the unchanged total item and page counts

#### Scenario: Request pagination outside accepted bounds

- **WHEN** `page` or `pageSize` is missing a numeric integer form, is non-positive, or exceeds the documented maximum page size
- **THEN** the endpoint returns a sanitized `application/problem+json` validation response and does not execute an unbounded catalogue query

#### Scenario: Request a page after the final page

- **WHEN** a valid positive page number exceeds the available total pages
- **THEN** the endpoint returns success with an empty product list and accurate pagination metadata

### Requirement: Catalogue supports category browsing without advanced ranking

The endpoint SHALL accept an optional category slug and include products belonging to that active, non-deleted category or its active descendants. Results SHALL use a stable newest-first order with an opaque identifier as the tie-breaker; advanced relevance ranking and free-text search are not part of this capability.

#### Scenario: Browse a parent category

- **WHEN** a buyer supplies the slug of an active parent category
- **THEN** the result can contain displayable products from that category and its active descendants

#### Scenario: Browse a leaf category

- **WHEN** a buyer supplies the slug of an active leaf category
- **THEN** the result contains only displayable products assigned to that category

#### Scenario: Browse an unknown or unavailable category

- **WHEN** the category slug does not identify an active, non-deleted category
- **THEN** the endpoint returns a valid empty catalogue page rather than falling back to all products

### Requirement: Catalogue cards expose consistent marketplace metadata

Every returned product card MUST contain a stable product destination, accessible primary media or fallback, product and shop names, shop location, integer-minor-unit price, valid optional compare-at price, computed optional discount percentage, bounded rating summary, non-negative sold count, and category metadata.

#### Scenario: Resolve an eligible catalogue product

- **WHEN** an active product belongs to an active shop and has at least one active variant with positive available inventory
- **THEN** the API selects the lowest-priced eligible variant deterministically and returns its valid price and promotion metadata with the product card

#### Scenario: Compute a discount badge

- **WHEN** the representative variant has a compare-at price greater than its current price
- **THEN** the card includes that compare-at price and a whole-number discount percentage derived by the server

#### Scenario: Product lacks valid promotion metadata

- **WHEN** compare-at price is absent or is not greater than the current price
- **THEN** the card omits both the compare-at price and discount percentage

#### Scenario: Product is not displayable

- **WHEN** a product or shop is inactive/deleted, or no eligible in-stock variant exists
- **THEN** the product is excluded before total counts and pagination are calculated

### Requirement: Storefront catalogue renders API data and preserves active query parameters

The `/search` buyer route SHALL render the public catalogue response inside the shared storefront shell. Pagination destinations MUST preserve supported active parameters such as `category` and `q`, while replacing only the `page` value; the route MUST NOT fabricate fallback products when the API is empty or unavailable.

#### Scenario: Render a populated catalogue

- **WHEN** the endpoint returns one or more products
- **THEN** the storefront renders consistent product cards in response order with visible pricing, promotion, rating, sold count, location, and working product links

#### Scenario: Navigate catalogue pages

- **WHEN** a buyer activates a previous, next, or numbered page control
- **THEN** navigation reaches the selected page while preserving supported active query parameters and excluding unsupported parameters

#### Scenario: Pagination has only one page

- **WHEN** the response reports one or zero total pages
- **THEN** the storefront omits unnecessary pagination controls

### Requirement: Catalogue loading, empty, and failure states remain actionable

The storefront SHALL provide a labelled loading composition, a context-aware empty state, and an explicit recoverable failure state without removing the global storefront navigation.

#### Scenario: Catalogue request is pending

- **WHEN** navigation reaches `/search` while its server data is loading
- **THEN** the route displays labelled non-interactive grid skeletons without announcing fabricated product content

#### Scenario: Catalogue response is empty

- **WHEN** the endpoint returns a valid page with no products
- **THEN** the storefront explains that the selected catalogue context has no products and offers a link back to the unfiltered catalogue or homepage

#### Scenario: Catalogue request fails

- **WHEN** the API times out, is unreachable, returns an error, or violates the shared contract
- **THEN** the storefront displays a retry action while keeping the header, search form, and navigation operable

#### Scenario: Catalogue data source fails

- **WHEN** the backend cannot read catalogue records
- **THEN** the endpoint returns sanitized `application/problem+json` without database, stack, or credential details

### Requirement: Catalogue grid is responsive and accessible

The catalogue SHALL preserve semantic heading order, meaningful media alternatives, visible focus, at least 44 CSS pixel pagination and primary card targets, and no document-level horizontal overflow at 360×800, 768×1024, and 1440×900.

#### Scenario: Browse catalogue with a keyboard

- **WHEN** a keyboard user traverses product cards and pagination
- **THEN** each interactive control receives focus in visual order with an informative accessible name and visible focus indicator

#### Scenario: Render reference viewports

- **WHEN** the catalogue renders at any reference viewport
- **THEN** product metadata and pagination remain readable and operable without document-level horizontal overflow

#### Scenario: Inspect automated accessibility rules

- **WHEN** automated accessibility analysis runs against populated, empty, and failure catalogue states
- **THEN** no serious or critical violation is reported

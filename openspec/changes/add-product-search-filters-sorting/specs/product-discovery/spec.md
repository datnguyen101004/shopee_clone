## Purpose

Provides buyers with deterministic, shareable product discovery using keyword search, combinable marketplace filters, useful sort modes, and accessible URL-backed controls over the displayable catalogue.

## ADDED Requirements

### Requirement: Public catalogue accepts a normalized discovery query

The catalogue endpoint SHALL accept optional `q`, `category`, `minPrice`, `maxPrice`, `rating`, `location`, `availability`, `promotion`, and `sort` parameters in addition to bounded pagination. It MUST return the complete normalized discovery state with each successful response and MUST NOT interpret unsupported parameters as filters.

#### Scenario: Search with normalized Vietnamese text

- **WHEN** a buyer supplies a keyword containing mixed case, repeated whitespace, or Vietnamese diacritics
- **THEN** the system normalizes whitespace and performs case-insensitive, diacritic-insensitive matching while retaining safe human-readable query context in the response

#### Scenario: Submit an empty optional keyword

- **WHEN** the submitted keyword contains only whitespace
- **THEN** the system treats the keyword as absent and applies the remaining filters and sort mode

#### Scenario: Submit malformed discovery values

- **WHEN** a discovery value is repeated, exceeds its documented length, uses an unsupported enum, is not an accepted integer form, or provides a minimum price above the maximum
- **THEN** the endpoint returns sanitized `application/problem+json` with field-level invalid-parameter information and performs no unbounded query

### Requirement: Keyword search produces deterministic relevant matches

When `q` is present, the system SHALL search normalized product name, product description, shop name, and category name. A result MUST match at least one normalized query token, relevance ordering MUST favor stronger product-name matches over contextual matches, and ties MUST use stable newest-first and opaque-identifier ordering.

#### Scenario: Match a product-name prefix

- **WHEN** the keyword is an exact product name or name prefix
- **THEN** matching products appear ahead of products that match only description, shop, or category text

#### Scenario: Match without Vietnamese diacritics

- **WHEN** a buyer searches an unaccented form of text stored with Vietnamese diacritics
- **THEN** the corresponding normalized product remains eligible for the result set

#### Scenario: Search has no matches

- **WHEN** no displayable product matches any normalized query token
- **THEN** the endpoint returns a valid empty page with zero totals and preserves the normalized discovery context

### Requirement: Discovery filters combine before totals and pagination

The system SHALL apply all provided filters with AND semantics to displayable products before calculating totals or slicing a page. Category SHALL include active descendants, price bounds SHALL evaluate the server-selected representative price in integer minor units, rating SHALL be a whole-star minimum from 1 through 5, location SHALL match a published shop-location facet, availability SHALL support `in-stock`, and promotion SHALL support `discounted`.

#### Scenario: Combine category, price, rating, location, stock, and promotion

- **WHEN** a buyer supplies valid values for every filter
- **THEN** every returned product satisfies every filter and pagination metadata describes only the combined result set

#### Scenario: Filter by a parent category

- **WHEN** a buyer selects an active parent category with active descendants
- **THEN** matching products from that category and its active descendants remain eligible

#### Scenario: Filter by representative price

- **WHEN** a product has multiple variants and price bounds are active
- **THEN** the bounds apply to the same lowest-priced eligible in-stock variant shown on its product card

#### Scenario: Request discounted products

- **WHEN** `promotion=discounted` is active
- **THEN** every result has a valid compare-at price greater than current price and a server-computed positive discount percentage

#### Scenario: Request an unknown valid category or location

- **WHEN** a syntactically valid category slug or location does not exist in the available facets
- **THEN** the endpoint returns a valid empty result rather than falling back to the unfiltered catalogue

### Requirement: Discovery sorting is explicit and stable

The system SHALL support `relevance`, `newest`, `best-selling`, `price-asc`, and `price-desc`. Relevance SHALL be the default when a keyword is present, newest SHALL be the default otherwise, and every mode MUST use deterministic tie-breakers so unchanged data does not drift across pages.

#### Scenario: Sort matching products by relevance

- **WHEN** a keyword is present and no explicit sort is supplied
- **THEN** products use deterministic relevance score followed by newest-first and identifier tie-breakers

#### Scenario: Sort without a keyword by relevance

- **WHEN** `sort=relevance` is explicitly requested without a keyword
- **THEN** the system uses the documented newest-first fallback rather than fabricating relevance

#### Scenario: Sort by best-selling

- **WHEN** `sort=best-selling` is active
- **THEN** products order by non-negative sold summary descending followed by stable newest-first and identifier tie-breakers

#### Scenario: Sort by price

- **WHEN** price ascending or descending is active
- **THEN** products order by representative card price in the requested direction with stable newest-first and identifier tie-breakers

### Requirement: Catalogue responses publish safe discovery facets

Every successful catalogue response SHALL include active category choices, normalized shop-location choices, and available representative-price bounds derived from displayable candidates before the current discovery filters are applied. Facets MUST contain no inactive, deleted, unavailable-only, or unsafe values.

#### Scenario: Render filter choices from API facets

- **WHEN** the storefront receives a successful catalogue response
- **THEN** it can render category, location, and price controls without hardcoded marketplace records

#### Scenario: Current result page is empty

- **WHEN** active discovery criteria produce no items
- **THEN** the response still contains the safe unfiltered facet choices required to change or clear those criteria

### Requirement: Storefront discovery state is URL-backed and accessible

The `/search` route SHALL render GET-backed controls for every supported discovery parameter inside the shared storefront shell. Applying or clearing criteria MUST reset `page` to 1, pagination MUST preserve all active supported criteria, unsupported parameters MUST be removed from generated destinations, and refresh or navigation to a copied URL MUST reproduce the same control state and result ordering.

#### Scenario: Apply combined controls

- **WHEN** a buyer enters a keyword, selects filters and sort, and submits the discovery form
- **THEN** navigation reaches an allowlisted `/search` URL at page 1 with controls and results reflecting the normalized response state

#### Scenario: Navigate a filtered result page

- **WHEN** a buyer activates a numbered, previous, or next page link
- **THEN** every active keyword, filter, sort, and explicit page-size value is preserved while only `page` changes

#### Scenario: Clear active discovery criteria

- **WHEN** a buyer activates the clear action
- **THEN** navigation reaches the unfiltered catalogue without stale filter, sort, or page values

#### Scenario: Use discovery controls with keyboard and assistive technology

- **WHEN** a buyer traverses and submits controls without a pointer at a reference viewport
- **THEN** fieldsets, labels, selected values, result summary, focus order, 44 CSS pixel targets, and status/error messages remain perceivable and operable without horizontal page overflow

### Requirement: Discovery states remain honest and recoverable

The storefront SHALL distinguish populated, no-match, invalid-query, and unavailable-data outcomes without fabricating products or removing global navigation. Empty results MUST summarize active context and offer clear/change actions; API failure MUST preserve a retry URL containing only supported state.

#### Scenario: Combined criteria have no matches

- **WHEN** the API returns a valid empty discovery response
- **THEN** the storefront explains that active criteria produced no results and offers actions to change filters, clear all, or return home

#### Scenario: Catalogue source is unavailable

- **WHEN** discovery data cannot be loaded or violates the shared response contract
- **THEN** the storefront keeps search and navigation operable and displays an explicit retry action without exposing internal details

## Purpose

Defines a rebuildable and measurable product-search capability that improves Vietnamese catalogue relevance while preserving existing filters, explicit sorts, commerce eligibility, and service continuity.

## ADDED Requirements

### Requirement: Rebuildable product search projection
The system SHALL maintain a search projection derived from the PostgreSQL catalogue for products, categories, shops, prices, promotions, ratings, sales summaries, and inventory state. PostgreSQL SHALL remain authoritative, and the search projection SHALL be safe to discard and rebuild without losing business data.

#### Scenario: Full projection rebuild
- **WHEN** an operator starts a full reindex against a valid catalogue
- **THEN** the system builds a complete replacement projection and exposes it for search only after the replacement is ready

#### Scenario: Incremental catalogue change
- **WHEN** a searchable or eligibility-affecting catalogue value changes
- **THEN** the corresponding product documents are updated or removed idempotently within the configured freshness objective

#### Scenario: Non-displayable product
- **WHEN** a product, its shop, or its category becomes non-displayable or it has no sellable inventory
- **THEN** that product SHALL NOT be returned by the search projection

### Requirement: Vietnamese-friendly keyword relevance
For `sort=relevance`, the system SHALL rank matching products using normalized Vietnamese-friendly keyword relevance with exact product-name matches ahead of weaker name, category, shop, attribute, and description matches, while allowing bounded static quality signals that cannot override catalogue eligibility.

#### Scenario: Exact product name
- **WHEN** a buyer searches for the exact name of a displayable product
- **THEN** that product is ranked ahead of products that only partially match the same query, subject to explicit filters

#### Scenario: Diacritic-insensitive query
- **WHEN** a buyer submits an otherwise equivalent Vietnamese query with or without diacritics
- **THEN** the system returns materially equivalent eligible candidates and applies the same ordering policy

#### Scenario: Static quality boost
- **WHEN** multiple candidates have comparable textual relevance
- **THEN** bounded popularity, rating-confidence, promotion, and freshness signals MAY determine their relative order without elevating an unrelated product above a strong textual match

### Requirement: Existing filters and explicit sorts remain authoritative
The system SHALL preserve the existing category, price, minimum-rating, shop-location, availability, and promotion filters. Explicit `price-asc`, `price-desc`, `best-selling`, and `newest` sorts SHALL remain the primary ordering rule, and all ties SHALL use deterministic secondary ordering.

#### Scenario: Price ascending
- **WHEN** a buyer selects `price-asc`
- **THEN** results are ordered by effective displayed price ascending and no secondary relevance or personalization signal places a higher-priced product before a lower-priced product

#### Scenario: Equal primary sort values
- **WHEN** two eligible products have the same primary explicit-sort value
- **THEN** the system MAY use text relevance, personalization, quality, freshness, and stable product identity in that order to break the tie

#### Scenario: Filter precedes ranking
- **WHEN** a product does not satisfy any active catalogue filter
- **THEN** that product is excluded before relevance or personalization scoring

### Requirement: Stable catalogue compatibility
The Elasticsearch-backed path SHALL preserve the catalogue endpoint's validated query semantics, response contract, facet semantics, and stable page ordering so existing storefront consumers do not require a UI redesign.

#### Scenario: Existing catalogue request
- **WHEN** an existing valid catalogue query is handled by the Elasticsearch-backed path
- **THEN** its response conforms to the current catalogue contract and represents the normalized query, facets, pagination, and displayable cards

#### Scenario: Repeated stable request
- **WHEN** the index and authoritative catalogue have not changed and an identical non-personalized request is repeated
- **THEN** the system returns the same product order and pagination metadata

### Requirement: Layered search fallback
The system SHALL return catalogue results when personalization is unavailable and SHALL fall back to the existing PostgreSQL catalogue-search behavior when Elasticsearch is unavailable or exceeds its bounded timeout.

#### Scenario: Elasticsearch unavailable
- **WHEN** the search backend cannot complete an Elasticsearch request within its timeout or Elasticsearch is unhealthy
- **THEN** the request is served by the existing PostgreSQL search path with the same public response contract

#### Scenario: Fallback observability
- **WHEN** a search request uses a fallback path
- **THEN** the system records a privacy-safe fallback reason without exposing credentials, buyer features, or raw model data

### Requirement: Search quality and operational verification
The system SHALL provide repeatable local evaluation for relevance, exact-match behavior, unexpected zero results, sellability, explicit-sort correctness, index freshness, and latency.

#### Scenario: Baseline release evaluation
- **WHEN** the Elasticsearch baseline is evaluated against the versioned relevance dataset
- **THEN** it reports NDCG@10, MRR, exact-name top-one rate, irrelevant-result rate, unexpected zero-result rate, and per-query-group regressions against the existing search baseline

#### Scenario: Hard ranking invariant
- **WHEN** any evaluation observes a non-sellable top result or an explicit-sort violation
- **THEN** the evaluation fails regardless of aggregate relevance scores

## Purpose

Adds a bounded, explainable campaign signal to product search and personalized recommendations while preserving relevance, sellability, explicit sorting, diversity, and dependable fallbacks.

## ADDED Requirements

### Requirement: Only active truthful campaign products receive campaign score

A product SHALL receive a positive campaign ranking contribution only when its platform campaign is `ACTIVE`, seller participation is joined and locked, the submitted product remains accepted and sellable, the central price resolver confirms a positive current discount, and the shop/product are not suspended or deleted. The contribution MUST become zero immediately when any condition ceases to hold.

#### Scenario: Active discounted product is eligible

- **WHEN** a joined campaign product is active, sellable, in stock, and currently discounted
- **THEN** ranking inputs mark it campaign-eligible with a bounded positive contribution

#### Scenario: Campaign ends or product loses eligibility

- **WHEN** the end boundary arrives or the product becomes unavailable
- **THEN** subsequent search and recommendation evaluation applies no campaign contribution

### Requirement: Relevance search gives bounded priority within comparable relevance

For `sort=relevance`, the final score SHALL combine lexical relevance, baseline quality, eligible personalized score, and a configurable non-negative campaign contribution. The server-owned `FEATURED` Flash Sale profile SHALL contribute more than the `NORMAL` campaign profile for otherwise equivalent eligible products; both profiles MUST remain within the same global campaign cap. `STANDARD`, `CHEAPEST_DEALS`, and newly registered campaign types MUST use `NORMAL` by default. Admins and clients MUST NOT supply raw weights or override the type profile. Exact phrase, exact term, and other established lexical tiers MUST remain ordered ahead of lower-relevance tiers; within the same lexical tier and otherwise comparable candidates, a featured Flash Sale product SHALL rank ahead of a normal campaign product, which SHALL rank ahead of an equivalent non-campaign product. Filters MUST run before scoring and product identity MUST remain the final deterministic tie-breaker.

#### Scenario: Comparable products differ only by campaign eligibility

- **WHEN** two sellable products are in the same lexical tier with equal non-campaign score and one has an active valid campaign discount
- **THEN** the campaign product ranks first

#### Scenario: Unrelated campaign product competes with exact match

- **WHEN** a campaign product is less textually relevant than a non-campaign exact match
- **THEN** the exact-match hierarchy is preserved

#### Scenario: Explicit sort is selected

- **WHEN** the buyer selects price, best-selling, or newest sorting
- **THEN** campaign score does not change the primary explicit ordering and may only participate in deterministic ties permitted by that sort

#### Scenario: Flash Sale competes with a normal campaign

- **WHEN** otherwise equivalent eligible products belong to active `FLASH_SALE` and normal campaigns
- **THEN** the Flash Sale product receives the stronger contribution and ranks first within the same lexical tier while both remain under the global cap

#### Scenario: Admin selects a normal campaign type

- **WHEN** an admin creates a campaign using `STANDARD`, `CHEAPEST_DEALS`, or another default type
- **THEN** eligible products use the normal lower contribution and the admin cannot raise it through campaign input

### Requirement: Personalized recommendations include campaign feature without dominance

For eligible authenticated buyers, active campaign eligibility SHALL be a versioned product feature in personalized scoring and SHALL have a bounded non-negative contribution. Daily recommendations MUST retain sellability, no duplicates, current shop/category diversity caps, and deterministic fallback. Guests and cold-start buyers MAY receive the bounded baseline campaign contribution without creating a profile.

#### Scenario: Personalized candidates are otherwise comparable

- **WHEN** two candidates have comparable personalized relevance and one is an eligible active campaign product
- **THEN** the bounded campaign contribution raises that product's recommendation order

#### Scenario: Campaign concentration exceeds diversity cap

- **WHEN** boosted products from one shop or category exceed the configured daily-recommendation limit
- **THEN** post-ranking diversity removes the excess rather than relaxing the cap

### Requirement: Campaign ranking inputs remain fresh and server-owned

Campaign identity, campaign type, importance class, ranking profile version, policy version, active window, discount basis points, and eligibility required for ranking SHALL be projected from authoritative server data and bounded in the search document. Time-bound scoring MUST evaluate request time against stored boundaries, and campaign/type-policy/participation/product changes MUST trigger incremental reconciliation with full reindex as repair. Clients and admins MUST NOT submit raw campaign eligibility or boost values.

#### Scenario: Index still contains a recently ended campaign

- **WHEN** the document has stale campaign metadata but request time is at or after `endsAt`
- **THEN** scoring computes zero campaign contribution before PostgreSQL hydration

#### Scenario: Client attempts to request extra boost

- **WHEN** a search request contains an unknown campaign-score parameter
- **THEN** it is rejected or ignored according to strict query validation and cannot influence scoring

### Requirement: Ranking fallback and evaluation preserve campaign invariants

Personalization failure SHALL fall back to baseline search/recommendations with bounded campaign priority, and Elasticsearch failure SHALL retain existing PostgreSQL results while applying the equivalent campaign ordering only where comparable relevance can be established. Evaluation SHALL report campaign-product exposure, relevance metrics, explicit-sort violations, non-sellable results, shop/category concentration, and latency. Sellability, lexical-tier, and explicit-sort violations MUST block release regardless of campaign exposure.

#### Scenario: Personalized script fails

- **WHEN** personalized scoring cannot complete
- **THEN** baseline ranking still returns eligible results and applies the bounded active-campaign rule

#### Scenario: Campaign boost harms lexical relevance

- **WHEN** evaluation detects a lower lexical tier outranking a higher tier because of campaign contribution
- **THEN** the ranking configuration fails its release gate

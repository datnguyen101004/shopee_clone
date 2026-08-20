## Purpose

Define accurate, owner-scoped, timezone-deterministic seller performance analytics that remain bounded, private, and honest about unavailable data.

## ADDED Requirements

### Requirement: Seller metrics use explicit eligible order states
The system SHALL count an owned shop order in seller analytics only while its current state is `AWAITING_PICKUP`, `SHIPPING`, or `DELIVERED`. It SHALL exclude `PENDING_CONFIRMATION`, `CANCELLED`, `RETURN_REQUESTED`, `RETURNED`, and `REFUNDED`. Merchandise revenue SHALL equal the safe-integer sum of immutable order-line payable merchandise amounts, excluding shipping and any claim of fees, settlement, payout, or net earnings. Units sold SHALL equal the sum of qualifying order-line quantities.

#### Scenario: Accepted order contributes to metrics
- **WHEN** an owned order in `SHIPPING` was created inside the selected interval
- **THEN** it contributes one order, its line quantities, and its payable merchandise amount

#### Scenario: Pending or refunded order is excluded
- **WHEN** an owned order is pending confirmation or refunded
- **THEN** it contributes zero to eligible order, unit, and merchandise-revenue metrics

#### Scenario: Historical state changes
- **WHEN** an order previously included in a range later becomes returned or refunded
- **THEN** a new query for that range excludes it and clearly remains current-state analytics

### Requirement: Local calendar ranges are deterministic
The analytics API SHALL accept inclusive local `YYYY-MM-DD` dates, validate `from <= to`, cap ranges at 366 local days, and interpret them using the owned shop's validated IANA timezone. It MUST convert the range to `[local from start-of-day, local day-after-to start-of-day)` in UTC exactly once and return the canonical timezone and UTC boundaries. Daily, Monday-based weekly, and monthly buckets SHALL use local calendar labels and contain every bucket in the requested range, including zero-valued buckets.

#### Scenario: Vietnam local-day query
- **WHEN** a shop in `Asia/Ho_Chi_Minh` requests one local date
- **THEN** records are selected using the corresponding half-open UTC interval and the response identifies both boundaries

#### Scenario: Offset changes inside a range
- **WHEN** tests use a valid IANA timezone with a daylight-saving transition
- **THEN** local bucket boundaries remain correct without assuming every day is 24 hours

#### Scenario: Invalid or oversized range
- **WHEN** `from` is after `to`, a date is non-canonical, or the range exceeds 366 local days
- **THEN** the system returns stable validation Problem Details and runs no aggregate query

### Requirement: Analytics are strictly owner scoped
Every analytics request SHALL require an authenticated seller and resolve data through that user's active approved shop. The API MUST NOT accept a client-selected shop identifier. Orders, lines, products, and inventory from another shop MUST never affect totals, rows, cursors, errors, or timing-sensitive existence disclosures.

#### Scenario: Approved seller requests a dashboard
- **WHEN** an approved seller requests analytics
- **THEN** every query includes the resolved owned shop predicate

#### Scenario: Buyer or ineligible shop requests analytics
- **WHEN** a buyer, suspended seller, or seller without an approved active shop requests analytics
- **THEN** the system returns the project-standard safe authorization/eligibility error without private metrics

### Requirement: Dashboard response is bounded and complete
`GET /api/v1/seller/dashboard` SHALL return exact contracts containing the normalized range, timezone, database-derived generation time, eligible order count, merchandise revenue, units sold, bounded time-series buckets, at most 10 best-selling products, at most 10 current low-stock variants, the shared threshold of 10, and conversion availability. It SHALL use safe integers and `Cache-Control: private, no-store`.

#### Scenario: Shop has no qualifying data
- **WHEN** no eligible order or published inventory exists in the selected range
- **THEN** totals are zero, requested buckets remain present with zero values, lists are empty, and the response is not treated as an error

#### Scenario: Shop has a large order history
- **WHEN** many orders and lines qualify
- **THEN** aggregation occurs in bounded database queries without hydrating the complete result set in application memory

### Requirement: Best sellers remain historically explainable
Best-selling products SHALL group qualifying immutable order lines by product ID and rank them by units descending, merchandise revenue descending, then product ID ascending. Display name and image SHALL come from the most recent qualifying order-line snapshot. A current public navigation target MAY be returned only if the product remains available; deleted products SHALL still appear as historical rows without a broken product link.

#### Scenario: Product is renamed after purchase
- **WHEN** a qualifying product's current name differs from its committed order-line snapshot
- **THEN** the best-seller row uses the immutable snapshot representation

#### Scenario: Product is deleted after purchase
- **WHEN** a qualifying product has been deleted
- **THEN** its historical sales remain counted and the row omits an active navigation target

### Requirement: Low stock reuses inventory truth
Low-stock dashboard rows SHALL contain only currently published, non-deleted products owned by the shop and SHALL use `available = quantityOnHand - quantityReserved` plus the shared threshold of 10. Rows SHALL be ordered by available quantity ascending, then stable variant identity, and capped at 10. The dashboard MUST NOT recompute balances from orders.

#### Scenario: Published variant reaches threshold
- **WHEN** a published owned variant has 10 or fewer available units
- **THEN** it is eligible for the low-stock list with the current image and inventory values

#### Scenario: Draft variant has low quantity
- **WHEN** a draft or deleted variant is below the threshold
- **THEN** it does not appear on the seller dashboard

### Requirement: Conversion is never fabricated
Until trustworthy shop visit and attribution events exist, the dashboard SHALL return conversion status `NOT_AVAILABLE`, null rate and visit counts, and a stable explanatory label. It MUST NOT report `0%` because missing traffic data is not zero conversion.

#### Scenario: Seller opens dashboard before traffic tracking exists
- **WHEN** the dashboard is rendered
- **THEN** conversion is shown as unavailable rather than as a numeric performance result

### Requirement: Product analytics support stable pagination and future export
`GET /api/v1/seller/analytics/products` SHALL expose exact export-shaped product rows for the same range and eligibility rules using opaque keyset pagination, a maximum page size of 100, stable ranking, and a cursor bound to normalized filters and timezone. It SHALL return immutable snapshot display values and MUST NOT generate or buffer a CSV file in T26.

#### Scenario: Seller pages through tied products
- **WHEN** multiple products have equal units and revenue
- **THEN** the product-ID tie-breaker returns every product exactly once across pages

#### Scenario: Cursor is reused with changed filters
- **WHEN** a cursor from one range or granularity is submitted with different normalized filters
- **THEN** the system rejects it without returning mixed result pages

### Requirement: Live analytics queries satisfy measurable performance budgets
The system SHALL provide a reproducible PostgreSQL benchmark profile with 100,000 orders, up to 500,000 order lines, and 10,000 variants for one shop plus foreign-shop controls. After five warm-up requests, at least 100 measured requests at up to 20 concurrent requests SHALL produce recorded P50/P95 latency, database statement count, and query-plan evidence. On the documented reference profile, dashboard P95 SHALL be at most 750 ms for ranges up to 90 local days and at most 1,500 ms for the maximum 366 local days; product analytics with `limit=100` SHALL have P95 at most 750 ms.

#### Scenario: Large shop requests a 90-day dashboard
- **WHEN** the benchmark profile executes at least 100 warmed dashboard requests for 90 local days at up to 20 concurrent requests
- **THEN** measured P95 response time is at most 750 ms and totals remain identical to reconciliation queries

#### Scenario: Large shop requests the maximum date range
- **WHEN** the same profile requests a 366-local-day dashboard range
- **THEN** measured P95 response time is at most 1,500 ms and the response contains no more than 366 time buckets, 10 best sellers, and 10 low-stock rows

#### Scenario: Large product-performance page is requested
- **WHEN** the same profile requests product analytics with `limit=100`
- **THEN** measured P95 response time is at most 750 ms and stable pagination remains complete and duplicate-free

### Requirement: Analytics query cost is bounded and fails closed
Database statement count for each analytics endpoint SHALL remain constant as qualifying row volume grows and MUST NOT contain per-order, per-line, per-product, or per-variant lookup patterns. Query plans SHALL apply owned-shop, date, and status predicates through supporting indexes and MUST NOT scan marketplace-wide order or inventory data belonging to unrelated shops. Analytics statements SHALL use a two-second database timeout. A timeout, cancellation, or incomplete aggregate SHALL return stable private unavailable Problem Details and MUST NOT return a partial analytics payload or internal query information.

#### Scenario: Qualifying volume grows
- **WHEN** the benchmark increases qualifying orders and lines without changing the requested response shape
- **THEN** database statement count remains constant and query-plan evidence contains no N+1 lookup pattern

#### Scenario: Foreign-shop control data grows
- **WHEN** unrelated shops contain substantially more orders and inventory than the owned shop
- **THEN** the owned query remains correctly scoped and its plan does not depend on scanning the unrelated marketplace-wide rows

#### Scenario: Aggregate statement times out
- **WHEN** PostgreSQL cancels a live analytics statement after the two-second timeout
- **THEN** the API returns private unavailable Problem Details with no partial totals, rows, SQL text, plan data, or foreign-shop information

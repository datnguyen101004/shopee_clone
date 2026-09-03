## Purpose

Define safe seller-owned shop vouchers and scheduled product discounts whose lifecycle, pricing, and storefront behavior remain deterministic and race safe.

## ADDED Requirements

### Requirement: Sellers manage only owned merchandise vouchers
The system SHALL allow an authenticated approved seller to list, create, read, edit, pause, resume, and delete only `SHOP` vouchers belonging to the seller's resolved shop. Seller-created vouchers SHALL support fixed-amount or percentage merchandise benefits and MUST NOT create platform or free-shipping benefits. Unknown and foreign voucher identifiers SHALL use the same non-enumerating response. A voucher may be deleted only after it is paused and has no usage, redemption, or committed order snapshot.

#### Scenario: Seller creates a shop voucher
- **WHEN** an approved seller submits valid dates, benefit, limits, and owned product scope
- **THEN** one globally unique canonical shop voucher is created for the resolved shop

#### Scenario: Seller targets another shop's voucher
- **WHEN** a seller reads or mutates a foreign voucher identifier
- **THEN** no existence or voucher data is disclosed and no record changes

### Requirement: Voucher rules remain valid and truthful
Voucher commands SHALL reuse the existing canonical code, time-window, minimum-spend, fixed/percentage value, maximum-benefit, total-limit, per-user-limit, product-scope, quote, consumption, and redemption invariants. Product scopes MUST contain only non-deleted products owned by the same shop. No valid input may produce a negative payable merchandise amount or a discount larger than its eligible merchandise subtotal.

#### Scenario: Percentage voucher has a cap
- **WHEN** a seller creates a percentage voucher
- **THEN** its percentage and maximum benefit are validated before persistence and the existing evaluator caps the discount

#### Scenario: Product scope contains a foreign product
- **WHEN** any scoped product is not owned by the resolved shop
- **THEN** the command fails atomically without revealing which identifier was foreign

### Requirement: Voucher lifecycle is derived from authoritative state
Voucher state SHALL be derived as `SCHEDULED`, `ACTIVE`, `PAUSED`, `EXHAUSTED`, or `EXPIRED` from the enabled flag, database time, `[startsAt, endsAt)`, and usage limits. Activation and expiration MUST NOT require a cron job. Expired or exhausted vouchers cannot be resumed. A paused, unused voucher may be hard-deleted; vouchers with history remain available as immutable historical records.

#### Scenario: Start time arrives
- **WHEN** database time reaches an enabled voucher's inclusive start before its exclusive end
- **THEN** reads and pricing treat it as active without a background state mutation

#### Scenario: Voucher is paused while scheduled
- **WHEN** the seller pauses a future voucher
- **THEN** it remains unavailable until a valid resume action succeeds

### Requirement: Redeemed voucher economics are immutable
Before first redemption, a seller MAY edit valid benefit, schedule, limit, and scope fields. After `usedCount > 0`, code, benefit type/value, minimum spend, maximum benefit, and product scope SHALL be immutable. The seller MAY pause or delete an unused voucher and MAY change its future end time while never reducing limits below consumed counts. Historical consumption/redemption and committed order snapshots MUST remain unchanged.

#### Scenario: Seller edits unused voucher economics
- **WHEN** an unused future voucher receives a valid versioned update
- **THEN** the update commits and increments its version

#### Scenario: Seller edits a redeemed voucher percentage
- **WHEN** a voucher has at least one use and the seller changes its benefit value
- **THEN** the system returns a stable conflict and preserves voucher/redemption data

### Requirement: Product discounts are scheduled without changing base prices
The system SHALL store seller-owned scheduled discount campaigns separately from product variants. Each campaign SHALL have a normalized name, `[startsAt, endsAt)`, enabled/archive state, version, and one or more owned products with a discount from 100 through 9000 basis points. A product rate applies to every active variant while preserving each variant's `priceMinor` and valid `compareAtPriceMinor`.

#### Scenario: Future product discount is created
- **WHEN** a seller schedules valid owned products and rates
- **THEN** base variant records remain unchanged and the campaign derives as scheduled

#### Scenario: Discount would create an invalid price
- **WHEN** any active variant would resolve to a non-positive or unsafe-integer price
- **THEN** the campaign command fails atomically

### Requirement: Enabled campaigns cannot overlap for one product
Enabled, non-archived product campaigns SHALL NOT have intersecting half-open time windows for the same product. Create, update, and resume commands MUST lock affected product identifiers in stable order and recheck overlap inside the transaction. Concurrent conflicting commands SHALL allow at most one commit.

#### Scenario: Adjacent campaigns are scheduled
- **WHEN** one campaign ends exactly when another begins for the same product
- **THEN** both are valid because their half-open windows do not overlap

#### Scenario: Two overlapping campaigns race
- **WHEN** concurrent commands target the same product and intersecting windows
- **THEN** at most one commits and the other returns a stable conflict

### Requirement: Started campaigns have constrained edits
Before a campaign starts, a seller MAY edit its valid name, window, product set, and rates. After database time reaches `startsAt`, start time, product set, and rates SHALL be immutable; the seller MAY pause, archive, or shorten a future end time. An expired or archived campaign cannot resume. Historical order snapshots MUST never be rewritten.

#### Scenario: Seller changes a future campaign
- **WHEN** a campaign has not started and the update has no overlap or invalid price
- **THEN** the authoritative campaign is updated and version increments

#### Scenario: Seller changes products after start
- **WHEN** an active or paused-started campaign receives a changed product set
- **THEN** the system rejects the edit without partial changes

### Requirement: One central resolver determines effective product price
Catalog, homepage, product detail, cart quote, and checkout SHALL use one server-side resolver that evaluates database time, variant base/compare-at price, and at most one active scheduled product campaign. It SHALL calculate `discountAmount = floor(basePrice * basisPoints / 10000)` and positive `effectivePrice = basePrice - discountAmount`, return an honest comparison price, and expose campaign identity/evaluation time where appropriate. The client MUST NOT supply or select the effective campaign price.

#### Scenario: Campaign is active
- **WHEN** a product is read during its active half-open window
- **THEN** every active variant exposes the centrally resolved discounted price and honest comparison price

#### Scenario: Campaign expires between quote and checkout
- **WHEN** checkout re-evaluates after the campaign's exclusive end
- **THEN** it uses current authoritative pricing and refreshes or rejects stale quote expectations without rewriting earlier orders

### Requirement: Scheduled discounts compose with existing vouchers safely
Pricing SHALL apply at most one scheduled product discount before the existing shop-voucher, platform-voucher, and shipping-benefit stages. Voucher eligibility and minimum spend SHALL use the discounted merchandise subtotal defined by the shared pricing pipeline. Total discount MUST remain bounded by eligible amounts and every stage SHALL use integer minor units.

#### Scenario: Active product campaign and shop voucher both apply
- **WHEN** a cart satisfies both rules
- **THEN** product discount resolves first and the shop voucher evaluates the resulting eligible merchandise subtotal

#### Scenario: No active campaign exists
- **WHEN** product pricing is evaluated outside every enabled window
- **THEN** existing catalog, voucher, quote, and checkout behavior remains unchanged

### Requirement: Promotion mutations are versioned and idempotent
Promotion creates and actions SHALL require canonical UUID idempotency keys; equivalent retries SHALL replay the original result and changed-input key reuse SHALL conflict. Updates and actions SHALL require the current ETag/version. Mutations SHALL use database time, the project Origin guard, normalized bounded input, and all-or-nothing transactions.

#### Scenario: Create response is lost
- **WHEN** a seller retries an equivalent create with the same key
- **THEN** the original voucher or campaign is returned without a duplicate

#### Scenario: Two editors update one promotion
- **WHEN** both submit the same current version
- **THEN** at most one commits and the other receives a stale conflict

### Requirement: Seller promotion APIs and screens expose bounded authoritative state
Voucher and campaign list endpoints SHALL use filter-bound opaque keyset cursors, cap page size at 50, return exact derived states, and set private no-store caching. Seller Center SHALL provide promotion tabs, paginated lists, preloaded create/edit forms, field-level validation, custom voucher pause/resume/delete and campaign pause/resume/archive confirmations, and loading, empty, stale, unauthorized, and unavailable states at supported responsive widths.

#### Scenario: Seller edits an existing campaign
- **WHEN** the seller opens its editor
- **THEN** authoritative values and ETag are preloaded rather than requiring re-entry

#### Scenario: Promotion list is empty
- **WHEN** the shop has no voucher or campaign
- **THEN** the UI shows a useful empty state and creation action rather than an error

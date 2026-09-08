## Purpose

Define seller-owned SKU Flash Sale enrollment, protected inventory backing, and quota transitions that remain consistent throughout a campaign.

## ADDED Requirements

### Requirement: SKU enrollment and fixed sale price
The system SHALL allow an eligible seller to register owned sellable variants in a Flash Sale campaign with a positive integer quota and a positive fixed sale price below the reference price and satisfying campaign discount policy. The reference and sale prices SHALL be snapshotted; prices SHALL remain fixed after enrollment closes. Non-Flash-Sale campaign behavior SHALL remain compatible.

#### Scenario: Register selected variants
- **WHEN** an eligible seller registers two valid variants and leaves a third unregistered
- **THEN** the selected variants receive distinct quota records and the third retains ordinary purchasing and pricing

#### Scenario: Invalid or foreign registration
- **WHEN** a registration contains another shop's variant, duplicate variants, invalid price, or insufficient available stock
- **THEN** the command is rejected without partial registrations

### Requirement: Protect physical backing
Available physical inventory SHALL be greater than or equal to remaining committed Flash Sale quota. Before opening, ordinary sales, pending reservations, and inventory adjustments SHALL respect that backing. Allocation SHALL NOT create physical inventory or subtract it twice. At registration and replenishment, unavailable or reserved inventory SHALL NOT be counted as allocatable stock.

#### Scenario: Exact inventory equality
- **WHEN** a variant has ten available units and the seller registers ten units
- **THEN** enrollment succeeds and later ordinary reservations or inventory reductions cannot consume the protected ten units

#### Scenario: Replenish after prior sales
- **WHEN** previous sale orders have consumed inventory and the seller adds a new quota at sold-out
- **THEN** the added quota is bounded by current available inventory, not the original warehouse amount or cumulative historic allocation

### Requirement: Quota modification lifecycle
Before campaign start, an enrolled seller SHALL be allowed to increase or decrease quota within physical backing, including after enrollment closes; this SHALL NOT reopen new enrollment or price editing. During the active campaign, positive remaining quota SHALL prohibit seller increases and decreases. At zero remaining quota, a seller SHALL be allowed to add a positive quantity or end that SKU's participation. Replenishment SHALL preserve campaign identity, prices, and buyer purchase claims.

#### Scenario: Active positive quota is locked
- **WHEN** a seller attempts to change quota while the running SKU has one remaining unit
- **THEN** the change is rejected and the existing quota remains unchanged

#### Scenario: Replenish sold-out SKU
- **WHEN** a seller adds five backed units to an ongoing SKU with zero quota
- **THEN** that SKU becomes available again as Flash Sale at its previous price without resetting buyer limits

#### Scenario: Cancellation races with replenishment
- **WHEN** an order cancellation restores quota before a seller's zero-quota replenishment executes
- **THEN** the seller command fails its current-state/version check rather than increasing a positive quota

### Requirement: Sold-out differs from ended
Zero quota SHALL represent sold-out participation, not termination. Seller termination SHALL apply to the selected SKU only and SHALL be permitted at zero quota during the campaign. Terminated participation SHALL be irreversible within the same campaign. Campaign expiry or administrative cancellation SHALL end eligibility independently of seller actions. Server time SHALL determine the active interval, including startsAt and excluding endsAt.

#### Scenario: Seller leaves SKU sold out
- **WHEN** quota is zero but neither seller nor campaign has ended participation
- **THEN** the SKU remains unavailable for purchase and cannot be bought at ordinary price

#### Scenario: Seller ends one variant
- **WHEN** a seller ends a sold-out SKU and another enrolled SKU remains active
- **THEN** only the ended SKU resumes ordinary pricing/availability and it cannot be replenished in that campaign

#### Scenario: Campaign reaches end time
- **WHEN** server time reaches endsAt even without a seller click
- **THEN** sale eligibility stops and ordinary pricing/availability resumes, subject to ordinary sellability

### Requirement: Owned and replay-safe seller commands
Enrollment, quota edits, replenishment, and termination SHALL enforce seller ownership, expected version, and idempotency. An identical retry SHALL replay the original outcome; a reused command key with different input SHALL conflict. Concurrent termination and replenishment SHALL have at most one successful transition from the same version.

#### Scenario: Two requests at zero quota
- **WHEN** replenishment and termination concurrently target the same sold-out version
- **THEN** exactly one succeeds and the other receives a state/version conflict with no partial quota update

### Requirement: Legacy Flash Sale registration safety
Legacy product-percentage Flash Sale entries without explicit SKU quota SHALL NOT be automatically treated as quota-backed offers. Enabling this capability SHALL require explicit SKU registration before exposing live sale pricing. Other campaign types SHALL retain their established behavior and homepage CMS SHALL remain independent of campaign ownership.

#### Scenario: Legacy product has no SKU allocation
- **WHEN** the new Flash Sale capability is enabled for a legacy campaign
- **THEN** its percentage-only product entry does not produce a buyable Flash Sale offer until valid SKU registration exists

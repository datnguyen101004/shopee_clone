## Purpose

Present SKU-level Flash Sale availability, prices, buyer limits, and seller actions consistently across campaign pages, catalog, cart, and checkout.

## ADDED Requirements

### Requirement: Quota controls participating SKU availability
Within an ongoing Flash Sale participation, buyer availability SHALL derive from remaining quota and sellability rather than ordinary warehouse surplus. At zero quota the SKU SHALL show sold out, have no SKU-level Flash Sale badge, and prohibit both sale and ordinary-price purchasing until replenishment, valid cancellation reversal, or participation end. Buyer UI SHALL NOT show exact remaining quantities, sold-progress bars, or synthetic scarcity counts.

#### Scenario: Warehouse stock remains after quota sells out
- **WHEN** an enrolled SKU has zero quota and physical stock is still positive
- **THEN** it shows sold out without a sale badge or ordinary-price buy button

#### Scenario: Replenishment restores presentation
- **WHEN** the seller adds backed quota to an ongoing sold-out participation
- **THEN** the SKU regains its previous sale price and badge and becomes available without restoring previously consumed buyer claims

### Requirement: Product badge and representative price reflect eligible variants
A product SHALL show a Flash Sale badge only if at least one participating SKU is active, sellable, and has positive quota. Representative purchasable prices SHALL not be sourced from sold-out sale SKUs. Nonparticipating siblings SHALL retain ordinary prices and availability. Ended SKU participation SHALL resume ordinary pricing/availability without ending other variants.

#### Scenario: One variant sold out and another active
- **WHEN** a product has a sold-out sale SKU and another sale SKU with quota
- **THEN** the product retains its badge while the sold-out SKU remains individually unavailable

#### Scenario: Only ordinary siblings can be purchased
- **WHEN** all participating SKUs are sold out and a nonparticipating sibling is available
- **THEN** the product has no Flash Sale badge and its purchasable representative price comes from an ordinary available SKU

### Requirement: Shared pricing and discovery behavior
Homepage, campaign detail, catalog, product detail, cart, and checkout SHALL use consistent Flash Sale price/state rules. Cache or search-index entries SHALL not authorize an expired or unavailable offer. Existing bounded campaign ranking SHALL only use eligible active deals for Flash Sale contribution; explicit price sorting SHALL retain its meaning. Countdown SHALL be presentation only and refresh state at boundaries and on return to the page.

#### Scenario: Stale indexed sale is hydrated
- **WHEN** a search candidate still contains old Flash Sale metadata after its participation ended
- **THEN** the returned card does not advertise a purchasable stale sale price or badge

### Requirement: Checkout explains COD and persistent purchase limit
Buyer UI SHALL explain one sale unit per product per campaign, require authentication to order, constrain sale quantity to one, and enable only COD for a selected checkout containing sale lines. Ordinary-only checkouts SHALL retain existing payment choices. Server rejection SHALL preserve the cart and identify the affected lines without automatic ordinary-price substitution.

#### Scenario: Online method previously selected
- **WHEN** a buyer adds a sale line to a selection that previously used an online payment method
- **THEN** checkout explains the COD requirement and requires an explicit valid payment selection before placing the order

### Requirement: Voucher eligibility uses sale-adjusted prices
Eligible shop, platform, and shipping vouchers SHALL continue under their existing policies, with applicable merchandise thresholds calculated from post-Flash-Sale prices. Quote and confirmation SHALL agree on price and voucher calculations. A product sale discount SHALL not be applied a second time through the legacy scheduled-discount path.

#### Scenario: Sale changes voucher eligibility
- **WHEN** an item's ordinary price satisfies a merchandise threshold but its sale price does not
- **THEN** the voucher is not applied on the basis of the ordinary price and the buyer receives the corrected quote

### Requirement: Seller quota controls reflect current state
Seller UI SHALL expose SKU identity, sale price, available stock, allocated/remaining quota, and state using the existing Seller Workspace layout. It SHALL allow pre-start quota edits and show replenish/end actions only for ongoing zero-quota participation. Errors SHALL preserve entered data and explain version or stock conflicts. Actions SHALL not fabricate success before command confirmation.

#### Scenario: Seller opens sold-out actions
- **WHEN** an owned SKU is sold out within the campaign interval
- **THEN** Seller sees add-quantity and end-participation actions and replenishment keeps price read-only

#### Scenario: Responsive accessible edit
- **WHEN** a seller edits quota on a narrow screen or with a keyboard
- **THEN** fields, errors, and action buttons remain usable, focus is managed, and closing the dialog restores focus to its trigger

### Requirement: Bounded two-tier public read caching
Public Flash Sale reads SHALL use bounded per-instance in-memory L1, then shared Redis L2, then controlled PostgreSQL cache fills. Public snapshots SHALL be at most 2 seconds old from their original authoritative read, never extend across startsAt/endsAt, and SHALL NOT contain private claims or stock. Fills SHALL coalesce per key across instances with bounded wait and database concurrency. Full-page refresh and sale-card hydration SHALL reuse this path. Public cache fills SHALL NOT overwrite live quota-admission counters.

#### Scenario: Many instances miss the same public key
- **WHEN** simultaneous requests miss L1 and L2 for the same sale snapshot
- **THEN** a bounded fill owner reads PostgreSQL and other requests share its result or receive retry guidance without independently flooding the database

#### Scenario: Replenishment invalidation is missed by an instance
- **WHEN** a committed replenishment installs a newer L2 snapshot but one L1 misses its invalidation
- **THEN** original snapshot age still expires within 2 seconds, and an older concurrent fill cannot reinstall stale state over a newer version

#### Scenario: Countdown crosses a cached boundary
- **WHEN** server time reaches startsAt or endsAt while a cached snapshot exists
- **THEN** the response derives the new timed phase and never extends the preceding offer state beyond that boundary

### Requirement: Lightweight status and controlled three-phase polling
The system SHALL provide a public batched campaign status endpoint for 1–50 unique campaign SKU ids, exposing fresh serverTime, boundaries, lifecycle state/version, public price and generic canPurchase without exact quantities. FE SHALL use local countdowns, randomized 10–15-second foreground checks before opening, one 0–500-ms-jittered boundary refresh, and randomized 3–5-second checks during active or sold-out ongoing participation. Polling SHALL pause when hidden, deduplicate requests, allow one in-flight poll, back off on failure/Retry-After, and stop for ended participation. Backend reads SHALL be rate limited.

#### Scenario: Buyer waits before opening
- **WHEN** a visible page waits for startsAt
- **THEN** its local countdown advances without per-second network calls and its boundary refresh uses server state rather than granting a purchase locally

#### Scenario: Sold-out SKU becomes available again
- **WHEN** seller replenishment or cancellation restoration commits while a healthy visible page polls
- **THEN** the page restores sale presentation within the measured 8-second normal-operation target, without automatically submitting an order or restoring used buyer claims

#### Scenario: Hidden or ended page
- **WHEN** the tab is hidden or the participation ends
- **THEN** periodic sale requests stop, and returning to an ongoing page triggers a deduplicated jittered refresh

### Requirement: Waiting-room checkout experience
For carts containing Flash Sale lines only, FE SHALL display WAITING, ADMITTED, EXPIRED and CLOSED states using private Admission/Queue control-plane status responses, server-directed 5–10-second jittered queue polling, one in-flight request and hidden-tab pause. It SHALL preserve the cart, original unchanged-checkout idempotency key and live ticket across refresh. Traffic tokens SHALL use Secure HttpOnly SameSite cookies with origin/CSRF protection and SHALL NOT appear in URLs or localStorage. Queue status SHALL be no-store. Public product/status browsing SHALL remain separately rate limited and cached.

#### Scenario: Buyer receives access
- **WHEN** Lambda grants a waiting buyer access
- **THEN** FE permits continuation to checkout and explains that access does not hold stock, without submitting an order automatically

#### Scenario: Lease expires while buyer reviews
- **WHEN** the traffic lease expires before the buyer continues
- **THEN** FE preserves cart/input, offers rejoining the queue and resolves any prior uncertain order before allowing a new purchase attempt

#### Scenario: Campaign ends while waiting
- **WHEN** the sale ends while a buyer waits
- **THEN** FE explains the end and requires review of ordinary prices without placing an order or retaining a guaranteed sale offer

#### Scenario: Ordinary checkout during protection
- **WHEN** an ordinary-only buyer enters a protected checkout route
- **THEN** the same traffic gate applies while ordinary pricing and payment eligibility remain governed by existing business rules

#### Scenario: Pool has no available admission token
- **WHEN** the buyer joins while all 20 leases are occupied
- **THEN** the UI stays in waiting state without requesting checkout preview or automatically submitting an order, and does not promise an exact SQS Standard queue position

#### Scenario: Five-minute access and ordinary-only checkout
- **WHEN** the buyer receives admission or changes the selected cart to ordinary-only items
- **THEN** admitted access shows its original five-minute expiry, ordinary-only checkout bypasses waiting, and leaving sale checkout does not release the old lease early

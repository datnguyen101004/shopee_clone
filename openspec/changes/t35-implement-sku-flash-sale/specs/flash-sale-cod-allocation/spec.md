## Purpose

Ensure quota-limited COD purchases, physical stock, per-product buyer claims, and cancellation reversals agree under concurrency and retries.

## ADDED Requirements

### Requirement: COD-only successful order consumption
Flash Sale quota SHALL be consumed only by successful COD order creation, not by cart additions or previews. Confirmation SHALL atomically validate sale state/time, allocate quota, consume physical inventory, create orders, consume valid vouchers, and record buyer claims. Failed confirmation SHALL leave no durable quota consumption, order, voucher consumption, or purchase claim. COD order creation SHALL NOT be represented as payment received.

#### Scenario: Preview does not reserve a deal
- **WHEN** a buyer previews a cart containing a Flash Sale SKU multiple times
- **THEN** no quota or buyer purchase right is consumed

#### Scenario: Voucher failure aborts checkout
- **WHEN** quota is provisionally admitted but the voucher fails final validation
- **THEN** the confirmation produces no purchase and all provisional quota is released exactly once

#### Scenario: Mixed cart uses COD
- **WHEN** a confirmation includes at least one Flash Sale line and ordinary lines
- **THEN** the entire selected checkout requires COD; online payment initiation is rejected before creating an intent or reserving stock

### Requirement: One unit of one sale SKU per product per buyer
The system SHALL allow at most one Flash Sale unit per authenticated buyer, product, and campaign across all participating sibling SKUs, orders, devices, and command keys. A successful COD purchase SHALL consume this right permanently for that campaign, including after cancellation or replenishment. Nonparticipating SKUs and ended participations sold at ordinary price SHALL follow ordinary purchase rules.

#### Scenario: Sibling SKU requests race
- **WHEN** one buyer concurrently confirms different sale variants of the same product
- **THEN** at most one sale unit succeeds across both requests

#### Scenario: More than one unit in a request
- **WHEN** a request contains two units of one sale variant or two sale variants of the same product
- **THEN** checkout rejects it without silently changing quantity or buying an extra unit at ordinary price

#### Scenario: Nonparticipating variant remains purchasable
- **WHEN** a buyer has consumed the product's sale claim and buys a variant not enrolled in Flash Sale
- **THEN** ordinary purchase rules apply without the Flash Sale claim blocking it

### Requirement: No oversell under concurrent allocation
Concurrent requests SHALL NOT exceed remaining sale quota or available variant inventory, and user limits SHALL be enforced atomically. Persistent state SHALL be authoritative even when an admission/cache snapshot is stale. Identical confirmed checkout retries SHALL return the same purchase without further quota or inventory deductions.

#### Scenario: Last available unit
- **WHEN** multiple buyers concurrently attempt the last quota unit
- **THEN** at most one purchase succeeds and quota and physical availability never become negative

#### Scenario: Timeout after successful creation
- **WHEN** a buyer retries an already committed purchase with the same key after losing its response
- **THEN** the existing purchase is returned without acquiring another sale claim or deduction

### Requirement: Cancellation restores according to original participation
An eligible order cancellation SHALL restore physical stock exactly once using the existing order lifecycle. If the original SKU participation has not ended and its campaign is still within its active interval, cancellation SHALL also restore quota, including when it is sold out. Otherwise cancellation SHALL restore ordinary stock only. Cancellation SHALL NOT clear the buyer's successful purchase claim. Restoration SHALL target the original campaign/participation, never a newer campaign on the same SKU.

#### Scenario: Sold-out participation receives canceled stock
- **WHEN** a valid COD order is canceled while its original participation is sold out but ongoing
- **THEN** stock and sale quota are restored, the SKU becomes buyable at sale price again, and the canceling buyer remains ineligible for another sale unit of that product

#### Scenario: Cancellation after seller termination
- **WHEN** a valid sale order is canceled after the seller ended its SKU participation
- **THEN** only ordinary stock is restored and sale presentation is not reactivated

#### Scenario: Cancellation after campaign expiry
- **WHEN** an old sale order is canceled after its campaign ended, including while another campaign is active
- **THEN** stock restoration does not create quota or change purchase claims in the newer campaign

#### Scenario: Cancellation competes with seller end
- **WHEN** cancellation and termination target the same sold-out participation concurrently
- **THEN** they follow one consistent order: termination first means ordinary restoration; cancellation first restores quota and invalidates zero-quota termination

#### Scenario: Repeated cancellation request
- **WHEN** the same successful cancellation is retried or delivered twice
- **THEN** stock and quota are restored once and the buyer claim stays consumed

### Requirement: Final sale eligibility and quote consistency
The final authoritative sale check SHALL use server time after acquiring the resources needed for confirmation. An expired, terminated, sold-out, changed-price, or changed-voucher quote SHALL produce a conflict or not-ready result requiring buyer review. The system SHALL NOT silently switch a selected sale line to ordinary pricing.

#### Scenario: Sale expires between preview and confirmation
- **WHEN** preview was produced before endsAt but final eligibility evaluation is at or after endsAt
- **THEN** sale confirmation fails without consumption and offers an updated quote for buyer review

### Requirement: Scoped admission failure behavior
Normal rejected or rolled-back commands SHALL release only their own provisional admission. A missing or uncertain admission service SHALL NOT grant an unverified sale purchase. Automatic Redis outage/cache-loss recovery and disaster reconciliation are outside this change's acceptance scope; this exclusion SHALL NOT relax durable no-oversell or idempotency requirements.

#### Scenario: Definitive transaction rollback
- **WHEN** a quota admission succeeded but its database transaction definitively rolls back
- **THEN** only that attempt's provisional admission is compensated and another successful request is unaffected

### Requirement: Admission and overload rejection precede allocation transactions
COD confirmation SHALL apply authentication, bounded rate limits and Redis atomic quota/claim/concurrency admission before opening the PostgreSQL allocation transaction. L1 is advisory only and SHALL NOT allocate quota or bypass Redis on positive hits. Ordinary quota, claim and overload rejection SHALL occur before allocation locks; bounded authentication/idempotency lookups remain allowed. PostgreSQL SHALL revalidate all accepted attempts and remain final authority. Saturation SHALL return 429 with Retry-After and SHALL NOT enqueue unlimited work.

#### Scenario: Shared checkout budget is full
- **WHEN** a new checkout reaches Redis with no concurrency slot available
- **THEN** it receives retry guidance without provisional quota mutation or a PostgreSQL allocation transaction

#### Scenario: Stale positive L1
- **WHEN** the API still caches an available offer after its quota has been allocated
- **THEN** Redis admission and final database checks prevent an additional successful sale beyond quota

#### Scenario: Provisional capacity is exhausted
- **WHEN** all admission units are held by in-flight attempts but durable remaining quota is positive
- **THEN** checkout reports busy/retry and does not authorize seller zero-quota actions

### Requirement: Token-safe admission and separate cache projections
Admission SHALL use attempt-scoped tokens, idempotent finalization and owned compensation. Database retries SHALL reuse their admission without a second decrement. Unknown commit outcomes SHALL be resolved durably before release, and token expiry alone SHALL NOT restore possibly committed quota. Public absolute snapshots SHALL be separate from admission counters. Ordered exactly-once outbox application SHALL add committed replenishment/reversal deltas and close ended admission without overwriting concurrent provisional admissions; public projections SHALL reject stale versions.

#### Scenario: Public fill races an admitted checkout
- **WHEN** a public cache refresh reads database quota while another checkout holds a provisional token
- **THEN** the fill updates public metadata only and does not restore the held admission unit

#### Scenario: Duplicate replenish event
- **WHEN** the same committed replenishment event is delivered more than once
- **THEN** its admission delta is applied once while newer public state remains intact

#### Scenario: Unknown commit with expired token deadline
- **WHEN** a checkout deadline expires before its commit result is known
- **THEN** no quota is released until the durable outcome is resolved, and confirmed retries replay their original order

### Requirement: Redis-backed opaque traffic admission for Flash Sale carts
When protection is enabled, the business backend SHALL require a live opaque random token for server-classified Flash Sale carts, including mixed carts. It SHALL validate the Redis lease, deadline, buyer/session and gate/scope before protected checkout. Ordinary-only carts SHALL bypass this gate. Preview SHALL validate admission without acquiring an order-confirmation slot. Production private-origin/gateway topology and JWT validation are outside this POC.

#### Scenario: Client conceals a sale line
- **WHEN** a client claims its selected cart is ordinary but server classification finds Flash Sale
- **THEN** the backend requires admission and does not trust the client flag

#### Scenario: Missing or invalid admission
- **WHEN** a protected request has no token, an expired token or a token belonging to another session
- **THEN** backend admission rejects it before protected order processing; unavailable Redis fails closed without process-local token/quota fallback

#### Scenario: Ordinary checkout and Flash Sale preview
- **WHEN** an ordinary-only cart checks out or an admitted Flash Sale cart requests preview
- **THEN** the ordinary cart needs no admission token and neither operation consumes a Flash Sale confirmation slot

### Requirement: LocalStack SQS Standard waiting control plane
The Admission/Queue control plane SHALL use SQS Standard and Lambda in LocalStack with Redis ticket/token/pool state. It SHALL tolerate duplicate and out-of-order delivery without claiming FIFO. Join SHALL use a dedicated Idempotency-Key and buyer/gate deduplication; confirmation SHALL use its separate order key. Polling SHALL read owned ticket state without granting capacity or invoking checkout/order/PostgreSQL. Only successful or terminal processing may acknowledge a message; tickets waiting for capacity SHALL remain pending with bounded retry/backoff.

#### Scenario: Empty token pool
- **WHEN** all 20 leases are active and another buyer joins
- **THEN** the buyer remains WAITING without a token until pool capacity is available

#### Scenario: Duplicate join and SQS delivery
- **WHEN** tabs retry the same join or SQS delivers a ticket repeatedly or out of order
- **THEN** one live buyer/gate ticket and at most one lease for that admission cycle exist, and repeated processing does not extend the token deadline

#### Scenario: Join publication fails
- **WHEN** SQS publication is not confirmed after ticket registration
- **THEN** same-key retry can complete that ticket's publication without a second ticket or a falsely successful abandoned join

### Requirement: Twenty five-minute admission leases
The Redis pool SHALL grant at most 20 active leases atomically, issuing a fresh random token stored with a 300-second TTL from grant. It SHALL release a lease exactly once only upon successful order creation or expiry. Failure, preview, tab closure or leaving checkout SHALL NOT release an admitted lease early. A waiting ticket may be canceled without granting it. Expiry accounting SHALL reclaim capacity without relying on token-key disappearance alone, and old delivery/release events SHALL NOT affect a newer admission cycle. Admission SHALL NOT reserve SKU stock.

#### Scenario: Success and expiry compete
- **WHEN** successful order creation and expiry both attempt to release the same lease
- **THEN** exactly one pool slot is returned and a waiting buyer may receive a fresh token

#### Scenario: Failure or closed tab
- **WHEN** preview completes, confirmation fails or the admitted buyer closes the page
- **THEN** the lease remains occupied until successful creation or its original five-minute expiry

#### Scenario: Seller replenishes stock
- **WHEN** a seller adds quota to a sold-out participation
- **THEN** pending tickets, token deadlines and the admission pool are not reset, and permanent buyer claims remain used

### Requirement: Five concurrent order confirmations
The backend SHALL atomically admit at most five executing Flash Sale order-confirmation requests before quota allocation. Preview SHALL NOT use these slots. Saturation SHALL return 429/Retry-After without consuming quota or revoking the buyer lease. Slots SHALL be released exactly once when execution finishes or termination is confirmed; client disconnect and lease expiry alone SHALL NOT release a still-running slot. Quota compensation SHALL remain separate and resolve uncertain commit outcomes before restoring quota.

#### Scenario: Sixth confirmation
- **WHEN** five distinct Flash Sale confirmations are executing and a sixth admitted buyer confirms
- **THEN** the sixth receives retry guidance, retains its unexpired lease and can retry using the same order key

#### Scenario: Traffic token expires during processing
- **WHEN** the five-minute lease expires while confirmation is still executing
- **THEN** the lease capacity may be reclaimed but its execution slot remains occupied until processing ends, and expiry alone does not restore SKU quota

#### Scenario: Lost successful response
- **WHEN** the order committed and its lease was released but the buyer did not receive the response
- **THEN** authenticated lookup using the original order key returns the existing result; replay neither creates another order nor releases capacity twice

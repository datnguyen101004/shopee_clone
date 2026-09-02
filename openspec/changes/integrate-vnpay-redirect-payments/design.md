## Context

See proposal.md for motivation. The current modular monolith already has COD and a MoMo sandbox implementation. Online checkout is exposed at POST /api/v1/checkout/online-payments, but its contract and OnlinePaymentService are MoMo-specific, PaymentsModule injects one PAYMENT_PROVIDER, and PaymentAttempt is a one-to-one Purchase relation. A Purchase can contain several ShopOrders, and server-authoritative pricing, inventory reservation, voucher consumption, seller gating, reconciliation, and late-success refund safeguards already exist.

VNPAY 2.1.0 is a hosted GET redirect protocol. The merchant constructs a signed payment URL; VNPAY independently redirects the browser to the configured Return URL and calls a public GET IPN URL. VNPAY expects the merchant IPN to verify checksum first, validate transaction and amount, update state, and return an HTTP 200 JSON acknowledgement. VNPAY may retry selected IPN failures up to ten times at five-minute intervals.

The supplied generic design assumes one order and a separate Payment table. This project settles a checkout through one internal multi-shop Purchase and its PaymentAttempt, while each ShopOrder remains the buyer-visible order unit (one shop with one or more products). The revised workflow makes payment gating explicit in the ShopOrder lifecycle by adding `PENDING_PAYMENT`; Purchase and PaymentAttempt remain authoritative only for checkout/payment aggregation.

## Goals / Non-Goals

**Goals:**

- Add VNPAY sandbox through the existing payment domain without duplicating checkout, inventory, voucher, order, or seller logic.
- Make provider selection explicit and isolate each provider behind a registry and common port.
- Give COD and VNPAY different explicit initial ShopOrder states and drive VNPAY order transitions from authoritative provider observations.
- Make IPN and verified QueryDR observations authoritative, idempotent, monotonic, and atomic with resource effects.
- Provide a Return URL experience that repeatedly reads backend state until IPN produces a
  terminal result, then redirects to the corresponding one-shop buyer order when there is one,
  or the buyer order list when the payment covers multiple shop orders.
- Present each ShopOrder as one buyer order identified by `orderReference`, with all products for
  that shop in the same order. Keep Purchase grouping internal to payment, inventory, and voucher
  settlement.
- Preserve COD and all existing MoMo behavior.

**Non-Goals:**

- VNPAY production onboarding, production traffic, accounting settlement, dispute operations, recurring/tokenized/installment payments, or multi-currency.
- Merchant-hosted card entry, a fake card form, or direct QR rendering from merchant-generated data.
- Buyer-initiated or automatic VNPAY refund API integration. Existing refund/manual-resolution states remain the safety boundary for late or duplicate success.
- Removing or merging ShopOrders in persistence, seller operations, carrier operations, returns, inventory, or fulfillment.
- Trusting Return URL fields as payment confirmation.

## Decisions

### 1. Extend the existing provider port with a provider registry

PaymentProviderName becomes a closed union of MOMO and VNPAY. PaymentsModule registers each enabled adapter in a PaymentProviderRegistry keyed by provider. OnlinePaymentService accepts the provider from the validated shared contract and resolves the matching adapter.

This is preferred to adding a parallel VnpayCheckoutService because creation, status normalization, observation application, reconciliation, redaction, ownership, and seller gates must stay identical across providers. A registry also preserves deterministic fake-provider contract tests. Provider-specific DTOs and signing remain inside each adapter.

### 2. Keep Purchase as the payment aggregate and ShopOrder as the buyer-visible order

One PaymentAttempt always references one Purchase and its amount equals Purchase.payableTotalMinor. A checkout may create several ShopOrders, but each ShopOrder is a separate buyer-visible order identified by its `orderReference`; it contains all selected lines for exactly one shop. `purchaseReference` is retained as payment/checkout correlation metadata and is not the buyer order route. Purchase.paymentStatus and PaymentAttempt.status remain the payment source of truth, while each ShopOrder keeps its own fulfillment status and gains `PENDING_PAYMENT` as an explicit seller gate.

COD ShopOrders start at `PENDING_CONFIRMATION`. VNPAY ShopOrders start at `PENDING_PAYMENT`; seller list, detail, and mutations exclude that state. A verified success transitions all ShopOrders in the Purchase to `PENDING_CONFIRMATION`. Verified cancellation, failure, or expiry transitions them to `CANCELLED`. The buyer sees the transition on each shop order, while seller eligibility remains readable from each canonical ShopOrder status.

### 3. Retain one-to-many PaymentAttempt storage but allow one VNPAY checkout attempt per Purchase

Purchase.paymentAttempt becomes Purchase.paymentAttempts. The unique constraint on payment_attempts.purchase_id is removed. A partial unique PostgreSQL index enforces at most one active attempt per Purchase for PENDING, UNKNOWN, and PENDING_RECONCILIATION states. Existing MoMo rows migrate unchanged.

Each attempt keeps an internal UUID publicReference and immutable provider correlation. VNPAY orderId stores a compact opaque alphanumeric vnp_TxnRef. The VNPAY policy creates one attempt with the Purchase and never adds another attempt after a terminal result. A buyer who wants to purchase again performs a new idempotent checkout, producing a new Purchase, ShopOrders, attempt, and provider reference.

Alternatives considered:

- Reopen a cancelled Purchase and add another attempt: rejected because it makes `CANCELLED` non-terminal, complicates inventory/voucher compensation, and makes buyer order history misleading.
- Reuse the cancelled attempt or transaction reference: rejected because replay, audit, duplicate IPN, and late-success handling become ambiguous.

### 4. Apply terminal payment and order cancellation in one transaction

Initial VNPAY checkout commits the Purchase, `PENDING_PAYMENT` ShopOrders, resource holds, and the PaymentAttempt in one serializable transaction. A verified `CANCELLED`, `FAILED`, or `EXPIRED` observation locks the attempt and Purchase, sets the terminal payment state, transitions every `PENDING_PAYMENT` ShopOrder to `CANCELLED`, advances order and fulfillment timelines, releases inventory and voucher holds, and restores eligible cart lines exactly once.

Unknown and reconciliation states keep the ShopOrders at `PENDING_PAYMENT` and retain holds. The Purchase payment deadline uses the same terminal cancellation transaction if no conclusive result arrives first. No terminal VNPAY Purchase is reopened or retried.

If two different attempts ever report success, a Purchase row lock and state precedence make the first valid success the only settlement. A later success is recorded and moved to refund/manual resolution without consuming resources or reopening fulfillment.

### 5. Generate the VNPAY URL deterministically after commit

The initial transaction persists the attempt before URL generation so IPN can always correlate to a durable row. URL generation is local cryptographic work, not a provider network call. The adapter builds VNPAY 2.1.0 parameters, formats provider timestamps in Asia/Ho_Chi_Minh at the boundary, sorts parameter names, applies the exact VNPAY encoding rules, and signs with HMAC-SHA512.

Project money remains integer VND minor units. The adapter serializes vnp_Amount as amountMinor multiplied by 100 and validates the reverse transformation with safe integer checks. VNPAY payments below 5,000 VND are rejected. The generated URL must match the exact configured HTTPS sandbox origin and payment path.

The full signed URL is returned only in the authenticated checkout response and is not logged. Idempotent checkout replay regenerates the same URL from immutable attempt fields and the stored provider create timestamp instead of creating a new attempt.

### 6. Use one shared observation finalizer for IPN and QueryDR

VnpayIpnController is a public GET endpoint at /api/v1/payment-providers/vnpay/ipn and does not use buyer AuthGuard, CSRF, or Origin checks. It applies strict query shape and length limits, extracts hash fields, verifies HMAC with timing-safe comparison before database lookup, and validates terminal code, vnp_TxnRef, vnp_Amount, response status, and transaction number.

Valid observations go through the existing PaymentObservationService after it is made provider-neutral. The transaction inserts or deduplicates PaymentEvent, locks the PaymentAttempt and Purchase, checks monotonic precedence, and performs exactly-once inventory, voucher, payment, order timeline, notification/outbox, and seller-gate effects.

The endpoint always uses the VNPAY JSON acknowledgement contract. Expected results include 00 for confirmed, 01 for transaction not found, 02 for already confirmed, 04 for invalid amount, 97 for invalid checksum, and 99 for an invalid or unhandled request. HTTP errors and application Problem Details are not returned to VNPAY for protocol-level outcomes.

### 7. Return URL resolves navigation but cannot confirm payment

The configured frontend Return URL is /payment/callback. The page reads only vnp_TxnRef for navigation and calls an authenticated owner-scoped resolver that returns internal paymentReference and Purchase reference. Other VNPAY query parameters are not converted into application state; after capturing the transaction reference they are removed from the visible URL with a same-document history/router replacement.

After resolving the transaction, the VNPAY callback performs bounded reads of
GET /api/v1/payments/:paymentReference. It starts with a short delay, backs off to a maximum
five-second delay, and stops on a terminal backend status or after the payment window. The
callback never trusts vnp_ResponseCode, vnp_TransactionStatus, or vnp_SecureHash from the
browser. Once a terminal status is returned, it uses the backend navigation target: a single-shop
Purchase redirects to `/account/orders/:orderReference`, while a multi-shop Purchase redirects to
`/account/orders`. A
manual “Kiểm tra lại” action remains available when polling is stopped or an API read fails.

After the IPN transaction commits, the callback's next bounded status read observes the new
backend state. Any future outbox/event delivery remains optional; correctness never depends on
the browser receiving an event.

### 8. Reuse QueryDR only for backend recovery

The existing reconciliation worker becomes provider-neutral. VNPAY candidates enter QueryDR only after a grace period, when URL creation is uncertain, or when an attempt remains active without a conclusive IPN. QueryDR uses stable request identity, VNPAY's transaction API, its required HMAC-SHA512 request/response rules, bounded concurrency, lease locking, and exponential backoff with jitter.

A verified QueryDR result enters the same observation finalizer as IPN. Timeout, malformed response, signature mismatch, correlation mismatch, and response code 94 remain uncertain and never become success or failure by inference.

This is transaction-status recovery, not settlement accounting. Frontend polling is limited to
the active VNPAY callback page and is bounded; it does not run on order-list or order-detail
pages.

### 9. Keep late-success handling safe without adding VNPAY refund scope

Before a terminal cancellation transaction, a verified VNPAY success can settle an eligible Purchase and move its ShopOrders to `PENDING_CONFIRMATION`. After cancellation has released resources, a late success must not restore inventory, vouchers, ShopOrders, or seller fulfillment. The event is retained and the payment enters REFUND_PENDING or an equivalent existing support state, with an operational alert and buyer-safe support message.

Automatic VNPAY refund calls are deliberately excluded. This trade-off keeps the sandbox proposal within the supplied non-goal while preventing silent double collection or invalid fulfillment. Production enablement must add and verify a VNPAY refund runbook or adapter before go-live.

### 10. Validate configuration without exposing credentials

Configuration adds an enable flag, environment, terminal code, hash secret, payment URL, Return URL, IPN URL, transaction API URL, TTL, HTTP timeout, server IP fallback, and trusted proxy policy. Credentials are required only when VNPAY creation is enabled. The sandbox payment and API hosts are exact allowlists; local frontend Return URL is allowed in development, while IPN must be public HTTPS.

Request IP is derived only from the socket or explicitly trusted proxy hops. Logs, errors, tests, OpenAPI examples, metrics, and traces redact the secret, secure hash, full signed URL, raw query, bank transaction identifiers, and personal data.

### 11. Use additive migration and feature-flagged rollout

The migration adds VNPAY enum values and `PENDING_PAYMENT` to ShopOrder status, removes the one-to-one Purchase constraint, retains immutable attempt correlation fields, and creates the partial active-attempt index. COD and MoMo rows retain their existing status semantics.

An additive data migration derives existing VNPAY ShopOrder and payment-attempt state from authoritative payment state: `PENDING`, `UNKNOWN`, and `PENDING_RECONCILIATION` become `PENDING_PAYMENT`; `PAID` becomes `PENDING_CONFIRMATION` when still payment-gated; and `CANCELLED`, `FAILED`, or `EXPIRED` becomes `CANCELLED`. A companion repair command validates timeline/version invariants and appends missing order transitions; runtime finalization and expiry workers perform inventory, voucher, seller-fulfillment, and cart compensation idempotently. The repair command refuses ambiguous rows instead of guessing.

Rollout order:

1. Back up the local database and apply the additive migration.
2. Deploy provider-neutral code with VNPAY disabled; run COD and MoMo regression suites.
3. Configure sandbox variables and public HTTPS IPN, run preflight, then enable VNPAY creation.
4. Run deterministic tests and opt-in sandbox UAT before accepting demo traffic.

Rollback disables new VNPAY creation first while leaving IPN, QueryDR, status reads, and manual-resolution handling active for existing attempts. Code and schema are removed only after no VNPAY backlog or retained rows remain; the database is never reset as a rollback mechanism.

### 12. Project each ShopOrder as one buyer order

Buyer order list queries are rooted at ShopOrder, enforce buyer ownership through its parent Purchase, and return one row per `orderReference`. Each result contains exactly one shop snapshot and every product line belonging to that shop. Buyer detail uses the canonical route `/account/orders/:orderReference` and returns that ShopOrder's payment metadata, status, delivery data, actions, and timeline. The parent `purchaseReference` is retained only to correlate payment state and checkout replay.

Status tabs filter the owned ShopOrder rows directly and paginate by `(createdAt, id)`. A shop order matches “Chờ thanh toán” when its status is `PENDING_PAYMENT`, “Chờ xác nhận” when its status is `PENDING_CONFIRMATION`, “Vận chuyển” when its status is `AWAITING_PICKUP` or `SHIPPING`, and the other tabs by their corresponding status. A multi-shop checkout therefore appears as one row per shop order; no row is duplicated and no page groups or splits a shop order.

The canonical URL parameter is a ShopOrder reference. Existing buyer links that contain an owned ShopOrder reference remain valid. Purchase references are accepted only by payment and checkout endpoints; unknown and cross-buyer references remain indistinguishable. Seller, carrier, review, return, notification, and fulfillment operations continue to use ShopOrder references.

This projection avoids a database migration because Purchase already owns the ShopOrders. It requires ShopOrder-rooted buyer list/detail contracts, ShopOrder cursor pagination, and frontend cards that render one shop with all of its lines. Keeping a Purchase-level response in the buyer history was rejected because it hides the actual order boundary and makes a multi-shop checkout look like one order.

### 13. Group buyer shipping navigation without merging domain state

The buyer order-history navigation uses one canonical `SHIPPING` filter labeled “Vận chuyển”. At the repository boundary, this buyer-only filter matches an owned ShopOrder with `status IN (AWAITING_PICKUP, SHIPPING)`. The visible tab set no longer contains a separate `AWAITING_PICKUP` entry, and an existing `filter=AWAITING_PICKUP` deep link is normalized to `filter=SHIPPING` so saved links do not strand the buyer on an invalid state.

The tab is only a buyer navigation alias; each order card, detail timeline, and accessibility label continues to render the actual fulfillment status: `AWAITING_PICKUP` is “Chờ lấy hàng” and `SHIPPING` is “Đang giao”. Seller, carrier, admin, notification, and transition logic continue to distinguish the two statuses. No Prisma enum or data migration is required for this tab change.

Reusing the existing buyer `SHIPPING` filter keeps the public buyer URL compact and avoids introducing a second logistics concept such as `IN_TRANSIT`. Because the filter value is now broader than the identically named domain status, the mapping must be centralized and covered by contract, repository pagination, query-normalization, and UI tests.

### 14. Back buyer payment tabs by child ShopOrder status

Buyer order history exposes a canonical `PENDING_PAYMENT` filter labeled “Chờ thanh toán”. It matches owned ShopOrders whose status is `PENDING_PAYMENT`; COD never enters this state. The `CANCELLED` filter labeled “Đã hủy” matches owned ShopOrders whose status is `CANCELLED` and no longer needs an OR predicate over payment status.

Both tabs are server-filtered through Purchase ownership, use ShopOrder cursor pagination, and return one complete shop order per row. Buyer detail exposes the parent payment result plus the ShopOrder's canonical status, so a failed VNPAY order is visibly cancelled while still explaining whether the provider result was cancelled, failed, or expired. Each timeline follows the exact state transitions `PENDING_PAYMENT → PENDING_CONFIRMATION` or `PENDING_PAYMENT → CANCELLED`.

## Risks / Trade-offs

- [Return URL can arrive before IPN] → Render an uncertain state, use bounded owner-scoped status polling, visibility refresh, and manual refresh; never infer failure.
- [A terminal attempt may later report success] → Lock the Purchase, preserve immutable attempts, apply first-success-wins, and route later success to refund/manual resolution.
- [No automatic VNPAY refund in scope] → Never reopen released orders, emit operational alerts, expose a support state, and block production enablement until refund operations exist.
- [One-to-many migration affects current MoMo code] → Keep MoMo behavior one-attempt by policy and run its full contract, integration, reconciliation, refund, and browser regression suites.
- [Public GET IPN can be abused] → Enforce strict lengths and parameter allowlists, timing-safe verification, rate controls that do not block legitimate retries, and redacted security metrics.
- [Proxy-derived buyer IP can be spoofed] → Trust only configured proxy hops and otherwise use the socket address or a safe fallback.
- [Polling can increase status-read traffic] → Poll only while the callback is open, use bounded
  backoff, stop immediately on a terminal status or the payment window, and keep the order pages
  read-only with no polling.
- [VNPAY encoding differences can invalidate signatures] → Maintain official fixtures and cross-check generated canonical strings against VNPAY demo implementations.
- [The buyer `SHIPPING` filter name also names a granular domain status] → Keep the aggregate mapping at the buyer order-history boundary, preserve granular response statuses, and cover inclusion, exclusion, pagination, and legacy-link normalization with tests.
- [Different shops can reach different fulfillment states] → Keep status on each ShopOrder, filter and paginate those rows independently, and let each buyer order card show only its shop's actual state.
- [Payment navigation covers multiple shop orders] → Return a single ShopOrder target only when the payment has one child; otherwise route to the buyer order list so no arbitrary shop order is selected.
- [COD could accidentally enter payment-gated state] → Set initial ShopOrder status from the server-owned payment method and cover mixed COD/VNPAY checkout with persistence tests.
- [A terminal provider result could update payment but not order/resources] → Finalize Purchase, ShopOrders, timelines, inventory, vouchers, cart restoration, and seller gates in one idempotent transaction.
- [Late success can arrive after immediate cancellation] → Never reopen `CANCELLED` ShopOrders or reacquire resources; route the payment to refund/manual resolution with operational evidence.

## Migration Plan

1. Capture schema and test baselines for COD, MoMo, inventory, voucher, seller fulfillment, order history, reconciliation, and refund.
2. Add and validate the provider-neutral contract and registry with VNPAY disabled.
3. Apply the additive PaymentAttempt and `PENDING_PAYMENT` ShopOrder migration, then migrate existing VNPAY rows from authoritative payment state and verify existing MoMo/COD rows and indexes are unchanged.
4. Add the VNPAY protocol adapter, IPN, QueryDR, atomic order/resource finalization, callback resolver, bounded callback polling, and UI behind the flag.
5. Replace Purchase-grouped buyer history with ShopOrder-rooted list/detail contracts, ShopOrder cursor pagination, one-shop cards/details, canonical ShopOrder URLs, and status filters; then run unit, adapter contract, PostgreSQL integration, Supertest, frontend interaction, Playwright, migration, and redaction tests.
6. Run sandbox preflight and controlled UAT through a public HTTPS tunnel.
7. For rollback, disable creation, drain or resolve active VNPAY attempts, then use an explicit compensating migration and data policy; do not delete unrelated orders or reset the database.

## 1. Baseline and shared contracts

- [x] 1.1 Record passing baselines for COD, MoMo checkout/IPN/status/reconciliation/refund, multi-shop Purchase totals, inventory, vouchers, buyer orders, and seller fulfillment.
- [x] 1.2 Extend shared payment method, provider, next-action, checkout request, callback-resolution, and ShopOrder status contracts with VNPAY `PENDING_PAYMENT` while preserving COD and MoMo payload behavior.
- [x] 1.3 Add strict parsers and DTO/OpenAPI definitions for provider selection, canonical `PENDING_PAYMENT` order state, terminal non-retryability, and VNPAY transaction-reference resolution.
- [x] 1.4 Define and test the provider-neutral payment/Purchase/ShopOrder precedence table, including `PENDING_PAYMENT → PENDING_CONFIRMATION`, terminal cancellation, duplicate observations, late success, and payment-window expiry.
- [x] 1.5 Define safe Problem Details for disabled provider, ineligible amount, active-attempt conflict, expired Purchase, already-paid Purchase, and owner-scoped not found.
- [x] 1.6 Keep buyer ShopOrder list/detail contracts rooted at one ShopOrder per card/detail, use canonical `orderReference` navigation, and paginate directly by ShopOrder cursor while retaining `purchaseReference` only as payment correlation.
- [x] 1.7 Update buyer filter contracts so a distinct Purchase matches child ShopOrder states, canonical `SHIPPING` represents `AWAITING_PICKUP` or `SHIPPING`, and `AWAITING_PICKUP` remains only a legacy URL alias.

## 2. Persistence and migration

- [x] 2.1 Extend Prisma payment method/provider enums with VNPAY, add ShopOrder `PENDING_PAYMENT`, and retain the Purchase.paymentAttempts relation.
- [x] 2.2 Add immutable provider create timestamp and correlation fields required to reproduce a VNPAY URL and replay checkout safely.
- [x] 2.3 Create an additive migration that removes the unique purchase_id constraint and adds a partial unique index for one active attempt per Purchase.
- [ ] 2.4 Verify the migration and VNPAY state backfill against a database containing existing COD, MoMo, and VNPAY purchases, attempts, timelines, refunds, reservations, voucher redemptions, and carts.
- [ ] 2.5 Add PostgreSQL integration tests for one VNPAY attempt per Purchase policy, active-attempt uniqueness, canonical order-state backfill, checkout idempotency, and concurrent create races.
- [ ] 2.6 Add a compensating rollback SQL design/test that refuses to drop VNPAY or `PENDING_PAYMENT` schema while VNPAY rows or backlog remain and never resets unrelated data.

## 3. Provider-neutral payment orchestration

- [x] 3.1 Expand PaymentProviderName and provider DTOs to support MOMO and VNPAY while keeping provider-specific fields outside the domain port.
- [x] 3.2 Implement PaymentProviderRegistry with duplicate-registration, disabled-provider, missing-provider, and deterministic fake-adapter tests.
- [x] 3.3 Refactor OnlinePaymentService, PaymentObservationService, reconciliation, metrics, and redaction to resolve behavior by provider rather than hard-coded MoMo branches.
- [x] 3.4 Keep MoMo at one attempt by current policy and run its adapter contract, IPN, QueryDR, refund, redaction, and status regression suites after the refactor.
- [ ] 3.5 Extend FakePaymentProvider and shared contract tests for VNPAY redirect, success-to-confirmation, cancel/failure-to-order-cancellation, expiry, unknown, duplicate, reordered, delayed, late success, and new checkout after cancellation.

## 4. VNPAY protocol and secure configuration

- [x] 4.1 Add disabled-by-default VNPAY sandbox configuration with exact payment/API host allowlists, local Return URL policy, public HTTPS IPN validation, TTL, timeout, server-IP fallback, and trusted-proxy policy.
- [x] 4.2 Implement VNPAY 2.1.0 parameter normalization, GMT+7 timestamp formatting, canonical sorting/encoding, HMAC-SHA512 signing, and timing-safe verification.
- [x] 4.3 Add official-compatible signing fixtures and negative tests for Unicode/order info encoding, space encoding, empty fields, duplicate keys, wrong ordering, malformed hash, and altered values.
- [x] 4.4 Implement opaque alphanumeric vnp_TxnRef generation per attempt and validate its uniqueness, length, and non-disclosure of Purchase or ShopOrder identifiers.
- [x] 4.5 Implement deterministic hosted payment URL generation with amount multiplied by 100, 5,000 VND minimum, buyer IP, locale, order type, create/expiry times, and configured Return URL.
- [x] 4.6 Ensure checkout idempotent replay regenerates the same signed URL from immutable attempt data without logging or persisting an exposed full URL.
- [x] 4.7 Implement VNPAY result-code mapping for success, buyer cancel, terminal failure, expiry, uncertain/unknown, and metrics for unmapped codes.
- [x] 4.8 Add redaction tests proving credentials, secure hashes, raw queries, signed URLs, bank identifiers, and personal data never reach logs, errors, traces, snapshots, or API responses.

## 5. Purchase creation, terminal cancellation, and hold lifecycle

- [x] 5.1 Generalize the online checkout transaction to accept an enabled provider while preserving server pricing, multi-shop totals, cart versioning, inventory reservation, voucher hold, Purchase idempotency, COD `PENDING_CONFIRMATION`, and VNPAY `PENDING_PAYMENT` creation.
- [x] 5.2 Create the VNPAY PaymentAttempt and `PENDING_PAYMENT` ShopOrders in the same serializable transaction as the Purchase, then generate the redirect only after commit.
- [x] 5.3 Remove same-Purchase VNPAY retry behavior and make terminal payment attempts reject retry while directing the buyer to a new checkout.
- [ ] 5.4 Add concurrency tests proving replayed or concurrent checkout creates at most one Purchase and initial attempt per idempotency key and never duplicates vnp_TxnRef values.
- [x] 5.5 Make verified VNPAY `CANCELLED`, `FAILED`, and `EXPIRED` results atomically cancel all `PENDING_PAYMENT` ShopOrders, release inventory/voucher holds, restore eligible cart lines, and make the Purchase non-retryable.
- [x] 5.6 Implement payment-window expiry through the same atomic cancellation path and prove all compensation effects happen exactly once.
- [ ] 5.7 Add crash and transaction tests for failure before commit, failure after commit but before redirect response, replay after response loss, terminal finalization, cart restoration, and expiry worker competition.

## 6. IPN, finalization, and QueryDR recovery

- [x] 6.1 Implement strict public GET /api/v1/payment-providers/vnpay/ipn parsing with bounded keys/lengths and no buyer authentication, CSRF, or Origin dependency.
- [x] 6.2 Verify checksum before database lookup, then validate terminal code, vnp_TxnRef, amount, response/transaction status, and provider transaction identity.
- [x] 6.3 Return VNPAY HTTP 200 JSON acknowledgements for confirmed, not found, already confirmed, invalid amount, invalid checksum, and invalid request outcomes.
- [x] 6.4 Route verified IPN observations through the shared atomic finalizer with PaymentEvent dedupe, Purchase/attempt locks, monotonic state guards, `PENDING_PAYMENT` order transitions, and exactly-once inventory/voucher/cart/order/notification effects.
- [ ] 6.5 Add Supertest cases for valid success-to-confirmation, cancel/failure-to-order-cancellation, resource release, unknown code remaining pending, bad signature, wrong terminal, wrong amount, unknown transaction, duplicate delivery, failure-after-paid, and concurrent duplicate IPNs.
- [x] 6.6 Implement signed VNPAY QueryDR request/response handling with stable request identity, correlation checks, timeout classification, and response-code 94 remaining uncertain.
- [x] 6.7 Extend the reconciliation worker with VNPAY grace period, leases, bounded concurrency, exponential backoff and jitter, while using the same finalizer as IPN.
- [ ] 6.8 Add race tests for IPN versus QueryDR, success versus terminal cancellation, duplicate terminal observations, and late success after resources were released.
- [x] 6.9 Route success after resource release or after another paid attempt to REFUND_PENDING/manual resolution, block seller fulfillment, and emit redacted operational evidence without invoking a VNPAY refund API.

## 7. Owner APIs and callback status delivery

- [x] 7.1 Generalize GET /api/v1/payments/:paymentReference to return provider, attempt state, Purchase reference, expiry, associated ShopOrder states, terminal non-retryability, and a safe shop-order/list navigation action for MOMO or VNPAY.
- [x] 7.2 Add authenticated GET /api/v1/payments/vnpay/resolve?vnp_TxnRef=... that returns only the owner's internal payment and Purchase references and uses indistinguishable not-found responses.
- [x] 7.3 Make the authenticated owner-scoped payment-status API the callback source of truth after IPN commit; no event channel is required for the VNPAY redirect flow.
- [ ] 7.4 Add tests for socket/session authentication, buyer isolation, status-read authorization, and no cross-buyer payment disclosure.
- [x] 7.5 Verify seller list, detail, confirm, prepare, ready-for-pickup, and handoff endpoints exclude `PENDING_PAYMENT`/`CANCELLED` VNPAY ShopOrders and accept them only after `PAID` moves them to `PENDING_CONFIRMATION`.
- [x] 7.6 Implement ShopOrder-rooted buyer order list/detail APIs that return one owned shop order with all of its products, payment metadata, granular status, and a contract-valid timeline.
- [x] 7.7 Map buyer filters to individual ShopOrder statuses, paginate by ShopOrder cursor, and add ownership, exclusion, and multi-shop separation tests.
- [x] 7.8 Keep owned ShopOrder detail references canonical at `/account/orders/:orderReference` and preserve indistinguishable not-found behavior for unknown or cross-buyer references.

## 8. Checkout, callback, and buyer UI

- [x] 8.1 Add accessible COD, MoMo, and VNPAY checkout options and the VNPAY hosted-payment explanation from the Vietnamese UI/UX specification.
- [x] 8.2 Submit VNPAY through the provider-neutral online checkout API, disable duplicate submit, store only safe navigation context, and redirect the same tab to the allowlisted VNPAY URL.
- [x] 8.3 Refactor the MoMo-specific payment page into a provider-neutral status screen without changing the existing MoMo journey.
- [x] 8.4 Add /payment/callback to resolve vnp_TxnRef through the backend and remove provider query data from the visible URL with a history/router replacement.
- [x] 8.5 Render loading, waiting-confirmation, paid, cancelled, failed, expired, support, unauthenticated, and owner-not-found states with the specified Vietnamese copy and accessible focus behavior.
- [x] 8.6 Poll the owner-scoped payment status API from the callback with bounded backoff, stop on an IPN-backed terminal result or payment-window limit, redirect to a single `/account/orders/:orderReference` or the buyer order list as appropriate, and keep a guarded “Kiểm tra lại” fallback.
- [x] 8.7 Replace same-order retry CTAs with a new-checkout action after terminal VNPAY cancellation/failure and never reuse a terminal Purchase or attempt URL.
- [ ] 8.8 Add responsive Testing Library coverage for keyboard selection, loading/error feedback, Return-before-IPN polling, IPN-before-Return, bounded polling stop, manual refresh, terminal new-checkout action, and reduced motion.
- [ ] 8.9 Add Playwright journeys for COD starting at confirmation, MoMo regression, VNPAY pending-to-confirmation success, buyer cancel/failure-to-order-cancellation, new checkout after cancellation, expiry, reload/new tab, unauthorized reference, one-card-per-shop multi-shop buyer display, and per-shop seller gating.
- [x] 8.10 Render one buyer order card and detail per ShopOrder, keep all products/actions/timelines for that shop together, and retain each shop's granular “Chờ lấy hàng” or “Đang giao” label.
- [ ] 8.11 Normalize legacy `filter=AWAITING_PICKUP` links to canonical `filter=SHIPPING` and add frontend/Playwright coverage for per-ShopOrder results, both included child statuses, excluded statuses, reload, direct navigation, empty state, and pagination.
- [ ] 8.12 Back the buyer “Chờ thanh toán” tab by ShopOrders having `PENDING_PAYMENT`, exclude COD, and cover ownership, direct navigation, empty state, and pagination.
- [ ] 8.13 Back the buyer “Đã hủy” tab by ShopOrders having `CANCELLED` while preserving granular payment labels, ownership, and pagination.
- [x] 8.14 Keep one-shop buyer detail contract-valid for transitions `PENDING_PAYMENT → PENDING_CONFIRMATION` and `PENDING_PAYMENT → CANCELLED`, preserve existing rows/timelines/resources, and add one-shop-detail regression coverage.

## 9. Sandbox tooling and operational documentation

- [x] 9.1 Add only non-secret VNPAY placeholders to .env.example and document manual .env setup without reading, printing, or committing credential values.
- [x] 9.2 Create an opt-in vnpay:sandbox:preflight command that validates configuration, exact hosts, public HTTPS IPN reachability, local Return URL, amount eligibility, and trusted proxy behavior without printing secrets.
- [x] 9.3 Document how to run web/API, expose the GET IPN endpoint through an HTTPS tunnel, configure the VNPAY merchant portal, and use hosted QR or test-card flows.
- [x] 9.4 Document safe observability for create, IPN, QueryDR, active-attempt conflicts, pending age, late success, and manual refund backlog.
- [ ] 9.5 Run sandbox UAT for happy path, Return-before-IPN, duplicate IPN, cancellation/failure with immediate order cancellation, new checkout after cancellation, missing-IPN QueryDR, and closed-browser behavior; retain only redacted evidence.

## 10. Verification and release gate

- [ ] 10.1 Run formatting, lint, typecheck, Prisma format/validate/status, unit tests, PostgreSQL integration tests, Supertest, frontend tests, and Playwright for affected journeys.
- [ ] 10.2 Run migration/backfill forward and rollback rehearsals on a backed-up local database containing VNPAY, MoMo, and COD data; prove status/timeline/resource invariants and refusal to remove active VNPAY or `PENDING_PAYMENT` rows.
- [ ] 10.3 Perform security review for canonical signing, timing-safe comparison, callback tampering, open redirect, SSRF, proxy IP trust, public IPN abuse, authorization, and secret redaction.
- [ ] 10.4 Confirm VNPAY disabled mode starts with no VNPAY credentials and leaves COD/MoMo behavior and CI network isolation unchanged.
- [ ] 10.5 Complete the sandbox demo release checklist and explicitly keep production enablement blocked until VNPAY refund/manual operations and merchant production onboarding are approved.

## 11. Restore one-shop buyer order boundaries

- [x] 11.1 Return buyer order history rows from owned ShopOrders so each row represents exactly one shop and can contain multiple product lines.
- [x] 11.2 Scope buyer order detail, cancellation, timeline, voucher, and review actions to one ShopOrder while retaining parent Purchase payment metadata.
- [x] 11.3 Update buyer contracts, cursor pagination, UI cards, and detail navigation to use `orderReference`; keep `purchaseReference` as payment correlation only.
- [x] 11.4 Return an order navigation target for one-shop payments and the order list for payments covering multiple shop orders.
- [x] 11.5 Add regression coverage proving a multi-shop checkout renders one buyer order per shop, keeps all products in that shop together, and preserves payment/status transitions.

## Context

See `proposal.md` for motivation and the six delta specs for observable behavior. T20 already treats each `ShopOrder` as the buyer-visible aggregate, persists immutable line/address/shop/shipping/voucher snapshots, versions status changes, and appends `OrderTimelineEvent` rows. Its state machine already contains `RETURN_REQUESTED`, `RETURNED`, and `REFUNDED`, but it has no return commands or reversal from a denied request. T25 adds seller shop scoping, fulfillment locks, and idempotent seller actions. T21 supplies a local image-storage pattern, while T27 supplies current-admin guards and transactional privileged audit.

The implementation must remain inside the TypeScript modular monolith, use PostgreSQL/Prisma as the durable authority, keep money in integer VND minor units, use private no-store REST responses, reject unknown write fields, and preserve existing purchase snapshots. T29 cannot depend on a real payment provider or return carrier because those are later roadmap items.

## Goals / Non-Goals

**Goals:**

- Keep the return aggregate, shop-order lifecycle, refund ledger, admin decision, and audit record transactionally consistent.
- Make partial quantities and net-paid refund allocation deterministic from committed checkout data.
- Make all buyer, seller, system, and admin commands idempotent, optimistic-versioned, and safe under races.
- Enforce return and action deadlines from server time even if a scheduled sweep is delayed.
- Keep evidence private to the buyer, owning shop, and admins through a replaceable storage boundary.
- Add buyer, seller, and admin surfaces without weakening their existing ownership and role boundaries.

**Non-Goals:**

- Real provider refund execution, wallet balances, bank details, chargebacks, COD cash settlement, or accounting compliance.
- Real return labels, carrier pickup, warehouse inspection, exchanges, replacement orders, or cross-shop return aggregation.
- More than one return request per shop order, post-decision appeals, buyer/seller chat, or automatic inventory restocking.
- Editing original order, address, pricing, shipping, voucher, catalog, or fulfillment snapshots.

## Decisions

### 1. Use one versioned ReturnRequest aggregate per ShopOrder

Create one `ReturnRequest` with unique `orderId`, immutable `buyerId` and `shopId`, reason/description, current status/version, policy version, eligibility and action deadlines, computed refund total, and timestamps. Add `ReturnRequestItem` rows keyed by return and order line, immutable per-line quantity and refund allocation; append-only `ReturnEvent` rows keyed by `(returnRequestId, version)`; optional one-to-one `ReturnShipment`; immutable `ReturnDecision`; owner-bound `ReturnEvidenceAsset`; and one `RefundLedgerEntry`.

One request per per-shop order matches the current public order unit, prevents cross-shop authorization and money coupling, and keeps partial-return allocation explainable. Multiple sequential requests were rejected for T29 because cumulative quantity, overlapping evidence, repeated shipping, and voucher rounding would require a materially larger case model.

### 2. Centralize the state machine and policy clock

Use a pure table-driven state machine:

```text
REQUESTED ------seller accept------> AWAITING_RETURN ----buyer ships----> IN_TRANSIT ----seller receives----> REFUNDED
    |                                      |                                |
    | seller rejects/escalates             | handoff deadline               | dispute/receipt deadline
    | or 48h deadline                      v                                v
    +-------------------------------> ESCALATED <------------------------ ESCALATED
    |                                      |
    | buyer cancels                        +-- admin approve return ------> AWAITING_RETURN
    v                                      +-- admin approve refund ------> REFUNDED
CANCELLED                                  +-- admin reject --------------> REJECTED

AWAITING_RETURN -- five-day deadline --> EXPIRED
```

Persist deadline instants when their source transition commits. Commands compare an injected UTC server clock after acquiring locks. A rerunnable bounded sweep processes overdue rows with `FOR UPDATE SKIP LOCKED`; the same transition service is used by foreground commands, so scheduler delay cannot make an expired action valid.

The default policy is seven days from the committed `DELIVERED` event for request creation, 48 hours for seller response, five days for buyer mock shipment, and seven days for receipt confirmation. Central versioned policy constants make later policy changes explicit without retroactively changing existing cases. Client timers are presentation only.

### 3. Couple return and order transitions through the existing lifecycle service

Creation locks `ShopOrder` and verifies ownership/status/delivery event, then calls the existing transaction-aware lifecycle service for `DELIVERED -> RETURN_REQUESTED`. Final cancellation, expiry, or rejection adds the controlled reversal `RETURN_REQUESTED -> DELIVERED`. Refund-only uses `RETURN_REQUESTED -> REFUNDED`; confirmed physical receipt records `RETURN_REQUESTED -> RETURNED -> REFUNDED` in the same transaction.

Each lifecycle hop increments the existing order version and appends its own immutable timeline event. Adding a separate mutable return flag to the order was rejected because list filters, buyer/seller timelines, reviews, and later payment/shipping integration already use the canonical order status.

### 4. Calculate refunds from persisted net-paid line amounts

For each selected line, compute `floor(payableMerchandiseMinor * requestedQuantity / purchasedQuantity)` using BigInt, with a full-quantity branch returning the exact line amount. Sum the allocations and persist both per-line and total values at request creation. Revalidate the stored equation before every terminal decision, but never recalculate from mutable product prices or current voucher rules.

T29 excludes shipping refund and does not restore voucher usage. This is deliberately narrower than prorating every order-level charge: order lines already persist merchandise discounts and voucher allocation, while shipping compensation would need carrier fault and payment-settlement semantics not present yet. The server never accepts an amount from a client.

### 5. Make command replay durable and define one lock order

Creation requires the current order ETag and stores `(buyerId, idempotencyKey, requestDigest)` on the new aggregate. Later actions require a return ETag and store key/digest/result identity on the corresponding `ReturnEvent`; unique constraints reject duplicates. Every transaction locks `ShopOrder` first and `ReturnRequest` second, then reads its items/shipment. It looks up a command key before current-state validation so a response-loss retry replays after state advancement.

Order-first locking matches existing lifecycle writers and avoids seller/admin/deadline deadlocks. Optimistic version checks produce a clear 409 for stale tabs, while row locks ensure only one of seller response, buyer action, admin decision, or deadline processing can win.

### 6. Persist one append-only mock refund entry with the terminal state

`RefundLedgerEntry` has a unique `returnRequestId`, `MOCK_CREDIT` kind, buyer/order/shop/currency/amount, JSON per-line allocation snapshot, actor, public reason, and timestamp. It has no production update/delete path. The entry, return terminal event, order transition(s), decision when present, and privileged audit when admin-authored commit in one transaction.

Reusing `Purchase.paymentStatus` was rejected because current COD orders do not model collection or a provider transaction, and mutating a parent purchase would incorrectly couple sibling shop orders. T32 can later consume or supersede the mock entry through an adapter/reconciliation layer without changing T29 history.

### 7. Use dedicated staged evidence metadata behind the existing storage pattern

Add a return-specific storage adapter and root/prefix, while reusing the proven local JPEG/PNG/WebP validation approach. `ReturnEvidenceAsset` stores uploader, opaque storage key, detected MIME, bytes, dimensions, `STAGED/ATTACHED`, expiry, sort order, and optional return relation. Creation locks and attaches one to five unexpired assets owned by the buyer. Cleanup removes only expired staged objects and metadata.

Media reads authorize the buyer, the order's current shop owner, or a current admin before serving attached bytes with safe headers. Storage keys, filesystem paths, and external URLs never enter JSON contracts. Reusing public review-media URLs was rejected because return evidence is dispute data, not public content.

### 8. Keep audience-specific contracts and routes

Add a `returns` backend module with separate controllers:

| Audience            | Endpoints                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buyer               | `POST /api/v1/account/return-evidence`, `POST /api/v1/account/orders/:orderReference/returns`, `GET /api/v1/account/returns`, `GET /api/v1/account/returns/:returnReference`, `POST /api/v1/account/returns/:returnReference/actions` |
| Seller              | `GET /api/v1/seller/returns`, `GET /api/v1/seller/returns/:returnReference`, `POST /api/v1/seller/returns/:returnReference/actions`                                                                                                   |
| Admin               | `GET /api/v1/admin/returns`, `GET /api/v1/admin/returns/:returnReference`, `POST /api/v1/admin/returns/:returnReference/decisions`                                                                                                    |
| Authorized evidence | `GET /api/v1/return-evidence/:evidenceId`                                                                                                                                                                                             |

List routes use `(updatedAt DESC, id DESC)` keyset cursors bound to normalized filters and fetch `limit + 1`. Repositories filter buyer/shop/admin scope in SQL before projectors run. Exact shared validators use distinct buyer, seller, and admin DTOs so internal notes and unnecessary personal data cannot leak through a generic serializer.

### 9. Correlate admin decisions with the existing privileged audit stream

Extend privileged target/action contracts with `RETURN_REQUEST` and the three return decisions. An admin decision row stores its public reason and encrypted-at-rest is not assumed; therefore its optional internal note is strictly bounded and returned only by admin detail. The existing audit helper receives only safe before/after state and amount summaries plus a decision correlation id. Evidence, descriptions, addresses, storage keys, and internal notes are excluded from audit summaries.

A separate general-purpose dispute audit table was rejected because `ReturnEvent` already records domain history and `PrivilegedAuditEvent` is the established operator-wide index. The correlation preserves both views without double-counting a mutation.

### 10. Integrate through server-declared capabilities in all three UIs

Buyer order detail receives a `returnCapability` projection and an existing return link. Add `/account/returns` and `/account/returns/[returnReference]`, including a line/evidence form. Seller Center adds `/seller/returns` and detail. Admin adds `/admin/returns` and detail/decision controls. Each detail uses the returned ETag and available-actions array rather than inferring legal actions from labels.

Forms retain one browser UUID for transport retries, disable duplicate submission, refresh canonical state after conflicts, and keep private descriptions/evidence out of URL state and persistent browser storage. UI countdowns display deadlines but never authorize commands.

### 11. Test invariant-heavy behavior below the browser layer first

Shared-contract tests cover exact keys, parsers, ETags, cursors, reasons, evidence limits, state/action projections, money and privacy guards. Pure tests exhaust the state matrix, boundary instants, quantity rules, and BigInt allocation. PostgreSQL tests cover constraints, migration, ownership, snapshot immutability, command replay, key conflict, row-lock races, deadline-worker races, transaction rollback, unique ledger, and audit correlation. Web tests cover each audience's states and action forms; Playwright covers an accepted-return path and a rejected/escalated admin-decision path at mobile, tablet, and desktop widths.

## Risks / Trade-offs

- **[One request per shop order can leave unrequested units]** -> Make the selection confirmation explicit and treat T29 as one bounded case; multiple cases require a later allocation model.
- **[COD has no real captured-payment record]** -> Label outcomes as `MOCK_CREDIT`, do not mutate parent payment status, and leave provider execution to T32.
- **[Return denial reverses order status to DELIVERED]** -> Preserve both histories with reason-coded events and allow only the return service to execute the reversal.
- **[Two order events are written for received-and-refunded goods]** -> Hold one order lock and commit both monotonically versioned events in the same transaction.
- **[Local evidence storage is not production durable]** -> Keep a narrow adapter, private route, cleanup command, and documented backup limitation for later object-storage replacement.
- **[Deadline sweep may run late or twice]** -> Recheck server time and state under lock, use idempotent system keys, and enforce deadlines in foreground commands too.
- **[Internal notes contain sensitive free text]** -> Bound length, restrict projection, omit from audit/logs, and document that operators must not place secrets or unnecessary personal data in notes.
- **[No automatic restock after return]** -> Keep inventory correct by requiring a later explicit inspected-return adjustment instead of assuming returned goods are sellable.

## Migration Plan

1. Add enums, return/evidence/item/event/shipment/decision/ledger tables, restrictive relations, check constraints, uniqueness, and queue/deadline indexes in one additive migration; add the controlled order reversal without rewriting existing events.
2. Regenerate Prisma artifacts and verify clean migrate/seed plus existing delivered-order fixtures. No return backfill is required because no prior return workflow exists.
3. Deploy framework-neutral contracts, domain policy/state machine, repository, evidence adapter, and transaction service before exposing routes.
4. Deploy buyer/seller/admin APIs and the deadline/cleanup commands, then enable the three UIs and focused browser coverage.
5. Exercise accepted-return, escalated decision, idempotent replay, rollback, deadline, and audit paths against the isolated PostgreSQL database before release.
6. Roll back routes, scheduled invocations, and UI first if needed. Keep additive tables and immutable history for a forward fix; deleting populated return or ledger records requires separate destructive-change approval.

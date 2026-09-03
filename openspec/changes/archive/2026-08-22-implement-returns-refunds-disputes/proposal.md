## Why

Orders can already reach `DELIVERED`, but buyers, sellers, and administrators have no traceable way to handle post-delivery problems without changing the original order snapshot or coordinating outside the platform. T29 adds a bounded return/refund lifecycle now that buyer order history (T20), verified order lines and review media foundations (T21), seller fulfillment (T25), and the audited admin console (T27) are available.

## What Changes

- Add server-authoritative return eligibility using a configurable reason policy and a default seven-day window measured from the committed delivery event.
- Let a buyer create one idempotent return request per shop order, select eligible order lines and quantities, describe the problem, attach validated evidence, and follow deadlines and status history.
- Add a seller return queue where the owning shop can accept a request, reject it with a reason, escalate it, and confirm receipt of a mock return shipment within allowed state transitions.
- Add an admin dispute workspace for escalated requests, role-appropriate evidence access, final approve/reject decisions, and bounded internal decision notes.
- Persist immutable return events, per-line requested quantities, mock return shipment data, and an append-only refund ledger; compute monetary outcomes from committed order and voucher-allocation snapshots.
- Update the existing order timeline and buyer/seller/admin screens without mutating original purchase, address, catalog, price, voucher, or shipping snapshots.
- Require optimistic versions and idempotency keys for every state-changing command, and serialize competing decisions so retries, duplicate clicks, and seller/admin races cannot create duplicate refunds or invalid states.
- Keep real payment-provider refunds and real carrier labels out of scope; T29 records a mock refund outcome and mock return-shipment lifecycle only.

## Capabilities

### New Capabilities

- `return-refund-lifecycle`: Return eligibility, aggregate state machine, deadlines, immutable events, partial-quantity invariants, mock return shipment, monetary allocation, and refund-ledger behavior.
- `buyer-return-requests`: Buyer request creation, evidence upload/attachment, owner-scoped list/detail, and return status presentation in order history.
- `seller-return-management`: Shop-scoped return queue, seller response and receipt commands, deadlines, and seller-safe projections.
- `admin-dispute-resolution`: Admin-only escalated dispute queue, evidence review, final decisions, and conflict-safe projections.

### Modified Capabilities

- `admin-console`: Add a role-gated returns/disputes workspace with queue filters, detail, decision actions, and explicit failure states.
- `admin-privileged-audit`: Record each effective admin dispute decision and monetary outcome in the existing immutable privileged audit stream.

## Impact

- **Tracking:** Implements GitHub issue #30 (T29). Dependencies T20, T21, T25, and T27 are closed.
- **Contracts:** Adds framework-neutral return/refund request, response, state, reason, cursor, version, idempotency, evidence, and Problem Details contracts under `packages/contracts`.
- **Backend:** Adds a NestJS returns module and buyer, seller, and admin controllers; integrates with order history, seller orders, lifecycle transitions, media validation, privileged audit, and the shared origin/auth guards.
- **Persistence:** Adds Prisma/PostgreSQL return aggregates, items, events, evidence assets, mock shipment records, and refund-ledger entries with restrictive relations, uniqueness, checks, and queue indexes.
- **Frontend:** Adds buyer return forms and history, seller return operations, and admin dispute resolution while preserving responsive account, Seller Center, and admin layouts.
- **Operations/tests:** Adds orphan-evidence cleanup, migration verification, contract/unit/PostgreSQL HTTP tests, role and race tests, and Playwright coverage for buyer-to-seller/admin critical journeys.

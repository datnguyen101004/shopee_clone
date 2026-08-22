# admin-dispute-resolution Specification

## Purpose
Provide administrators with a secure, auditable workflow for resolving only escalated return disputes and applying one final monetary or rejection outcome.
## Requirements
### Requirement: Dispute endpoints require current admin authorization

The API SHALL expose `GET /api/v1/admin/returns`, `GET /api/v1/admin/returns/:returnReference`, and `POST /api/v1/admin/returns/:returnReference/decisions` only to authenticated users whose current roles include `admin`. List and detail responses MUST be private/no-store, lists MUST use bounded filter-bound cursor pagination, and denied callers MUST receive sanitized errors with no dispute, evidence, buyer, shop, or amount data.

#### Scenario: Admin lists escalated disputes

- **WHEN** an authenticated admin filters for `ESCALATED` returns
- **THEN** stable summaries include only matching disputes and their deadline/context metadata

#### Scenario: Seller calls an admin decision endpoint

- **WHEN** an authenticated seller calls the admin decision route
- **THEN** the request is forbidden and no return, order, ledger, decision, or audit row changes

### Requirement: Admin decisions are final, explicit, and state-dependent

An admin decision SHALL require current return ETag, UUID idempotency key, one decision from `APPROVE_RETURN`, `APPROVE_REFUND`, or `REJECT`, a bounded public reason, and an optional bounded internal note. Decisions SHALL apply only to `ESCALATED`: `APPROVE_RETURN` SHALL be allowed only when no shipment exists and move to `AWAITING_RETURN`; `APPROVE_REFUND` SHALL create the terminal refund; and `REJECT` SHALL create the terminal rejection. The client MUST NOT supply refund amounts.

#### Scenario: Admin approves return shipping

- **WHEN** an escalated pre-shipment dispute is approved for return with the current version
- **THEN** it moves to `AWAITING_RETURN` with a new buyer shipment deadline

#### Scenario: Admin approves refund

- **WHEN** an admin approves a current escalated dispute for refund
- **THEN** the server-calculated ledger entry, terminal return state, order transition, decision, event, and audit record commit atomically

#### Scenario: Stale admin tab submits

- **WHEN** another actor has changed the return version before the decision arrives
- **THEN** the API returns a conflict with the current version and writes no partial decision

### Requirement: Admin detail separates public reasons from internal notes

Admin detail SHALL include full return context needed for adjudication: buyer and shop safe identifiers, committed order-line snapshots, requested quantities, buyer description, attached evidence, seller public response, deadlines, shipment, server-calculated amount, public timeline, and prior decisions. Internal decision notes MUST be visible only to admins and MUST never appear in buyer/seller responses, URLs, browser storage, or public audit summaries.

#### Scenario: Admin records an internal note

- **WHEN** an admin submits a valid decision with an internal note
- **THEN** authorized admin detail can display the note while buyer and seller detail omit it

### Requirement: Admin dispute UI presents conflict-safe decisions

The admin interface SHALL provide a returns/disputes queue, search by return or order reference, filters, detail, evidence inspection, server-computed monetary preview, confirmation, decision reason, optional internal note, and authoritative post-decision refresh. It MUST render loading, empty, forbidden, not-found, validation, stale-conflict, and unavailable-data states without optimistic claims of a completed refund.

#### Scenario: Admin confirms refund

- **WHEN** the admin reviews the amount and confirms `APPROVE_REFUND`
- **THEN** one decision request remains pending until the server returns the committed canonical result


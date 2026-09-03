## Purpose

Give each seller a shop-scoped queue for responding to return requests and confirming mock return receipt without exposing other shops or private admin information.

## ADDED Requirements

### Requirement: Seller return reads are shop-scoped and paginated

The API SHALL expose `GET /api/v1/seller/returns` and `GET /api/v1/seller/returns/:returnReference` only to authenticated sellers. Every query MUST resolve the seller's current shop and filter by that shop in persistence. The queue SHALL support bounded state, deadline, order-reference, date, limit, and filter-bound cursor parameters and SHALL return private/no-store seller-safe projections.

#### Scenario: Seller lists actionable returns

- **WHEN** a seller filters the queue for requests awaiting response
- **THEN** only returns for that seller's shop are returned in stable newest-first order

#### Scenario: Seller probes another shop's return

- **WHEN** a seller requests a return belonging to another shop
- **THEN** the API returns the same not-found response used for an unknown return

### Requirement: Sellers can respond only through declared actions

The API SHALL expose `POST /api/v1/seller/returns/:returnReference/actions` with current return ETag and UUID idempotency key. From `REQUESTED`, `ACCEPT_RETURN` SHALL move to `AWAITING_RETURN`, while `REJECT_AND_ESCALATE` or `ESCALATE` SHALL move to `ESCALATED` with a bounded public reason. From `IN_TRANSIT`, `CONFIRM_RECEIPT` SHALL complete the mock refund and `ESCALATE` SHALL request an admin decision. No seller action SHALL be accepted after its deadline or from a state where it is not declared by the server.

#### Scenario: Seller accepts an eligible return

- **WHEN** the owning seller submits `ACCEPT_RETURN` with the current version before the response deadline
- **THEN** the request moves to `AWAITING_RETURN` and the canonical detail declares the buyer's next action

#### Scenario: Seller rejects with evidence-based reason

- **WHEN** the seller submits `REJECT_AND_ESCALATE` with a valid bounded reason
- **THEN** the request moves to `ESCALATED` for admin review rather than becoming finally rejected

#### Scenario: Seller confirms receipt

- **WHEN** the seller confirms receipt for a current `IN_TRANSIT` request
- **THEN** the returned and refunded lifecycle, refund ledger, and updated detail commit exactly once

### Requirement: Seller projections respect evidence and note privacy

Seller detail SHALL include committed order-line snapshots, requested quantities, buyer description, attached evidence, public timeline, deadlines, mock shipment, amount preview, and actions currently allowed for the shop. It MUST NOT include admin internal notes, unrelated buyer profile data, storage keys, other shops, or privileged audit summaries.

#### Scenario: Seller opens return detail

- **WHEN** an authorized seller reads a return for their shop
- **THEN** the seller receives the evidence and order context necessary to respond but no admin internal note

### Requirement: Seller Center provides a usable return queue

Seller Center SHALL add a responsive `Trả hàng/Hoàn tiền` destination with filters, deadline indicators, queue cards, detail, evidence viewer, confirmation dialogs, and actions supplied by the API. Loading, empty, forbidden, stale-version, deadline-expired, and transient error states MUST be explicit, and destructive actions MUST require confirmation.

#### Scenario: Seller response loses a race

- **WHEN** an automatic deadline escalation commits before the seller confirms an action
- **THEN** the UI refreshes the authoritative escalated state and does not claim the seller action succeeded

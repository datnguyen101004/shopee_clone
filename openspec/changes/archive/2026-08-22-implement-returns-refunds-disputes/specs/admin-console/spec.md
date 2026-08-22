## ADDED Requirements

### Requirement: Admin console includes return dispute operations

The admin console SHALL add a `Trả hàng/Hoàn tiền` workspace containing a bounded paginated queue, state and deadline filters, return/order-reference search, detail, evidence inspection, server-calculated amount, immutable public history, and final decision controls. The workspace MUST use only admin APIs, preserve private no-store behavior, and show explicit loading, empty, forbidden, not-found, validation, stale-conflict, and recoverable unavailable states.

#### Scenario: Admin opens the dispute workspace

- **WHEN** an authenticated admin navigates to the return dispute destination
- **THEN** the role-gated queue loads without exposing its payload to buyer or seller routes

#### Scenario: Admin searches by order reference

- **WHEN** an admin enters a canonical shop-order or return reference
- **THEN** the server returns only matching safe summaries or an explicit empty state

### Requirement: Return decisions require confirmation and server authority

The admin console MUST require explicit confirmation, a valid public reason, and the current return version before submitting an approve-return, approve-refund, or reject decision. It SHALL display the read-only amount calculated by the server and MUST NOT allow operators to edit refund money or declare success before the authoritative response commits.

#### Scenario: Admin cancels confirmation

- **WHEN** the admin closes a return decision confirmation
- **THEN** no mutation request is sent and the dispute remains unchanged

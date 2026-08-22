## Purpose

Ingests lifecycle domain events, applies idempotency deduplication, routes to eligible recipient channels based on roles and preferences, and orchestrates asynchronous delivery attempts.

## ADDED Requirements

### Requirement: Idempotent event deduplication
The system SHALL accept notification triggers with deterministic deduplication keys derived from event kind, target reference, and version, ensuring duplicate triggers produce exactly one notification aggregate.

#### Scenario: Duplicate order status notification event
- **WHEN** multiple concurrent or repeated domain events are emitted with the same deduplication key
- **THEN** the system creates exactly one notification and suppresses duplicate recipient records.

### Requirement: Multi-channel delivery and role-based routing
The system SHALL route validated events into in-app notifications and background email delivery tasks according to recipient role (Buyer, Seller, Admin), template metadata, and user preferences.

#### Scenario: Route order delivery event to buyer and seller
- **WHEN** an order reaches `DELIVERED` status
- **THEN** the buyer receives an in-app and email delivery notification, while the seller shop owner receives a settlement notice.

#### Scenario: Route dispute escalation event to admin
- **WHEN** a return request escalates to `ESCALATED`
- **THEN** all active administrators receive a high-priority dispute notice with deep link to the dispute workspace.

### Requirement: Exponential retry on transient delivery failure
The system SHALL track delivery attempt status (`PENDING`, `DELIVERED`, `FAILED`) and retry failed email deliveries with bounded exponential backoff.

#### Scenario: Transient email delivery failure
- **WHEN** email transport encounters a network timeout on delivery
- **THEN** the attempt status is marked `FAILED` with retry counter incremented and next retry timestamp scheduled without affecting in-app notification availability.

## Purpose

Defines a provider-neutral and recoverable shipment-registration boundary so seller handoff can integrate with Demo Carrier without duplicate external shipments or dependence on a synchronous network response.

## ADDED Requirements

### Requirement: Seller handoff creates one durable carrier registration intent

When the owning seller successfully hands off a `READY_FOR_PICKUP` order, the existing versioned and idempotent command SHALL atomically move fulfillment to `HANDED_OFF`, move the shop order to `SHIPPING`, create exactly one local shipment with a stable public tracking code and `REGISTRATION_PENDING` state, append the initial marketplace events, and record one dispatch intent. No external carrier response SHALL be required for that transaction to commit.

#### Scenario: Eligible seller hands off once
- **WHEN** the owning approved seller confirms handoff with the current ETag and a new idempotency key
- **THEN** order, fulfillment, shipment, events, and one dispatch intent commit together and the response exposes the stable simulated tracking code

#### Scenario: Transaction persistence fails
- **WHEN** any local handoff effect cannot be committed
- **THEN** all handoff effects roll back and no dispatch attempt is made for a partial shipment

#### Scenario: Handoff response is lost
- **WHEN** the seller replays an equivalent committed handoff with the same key
- **THEN** the original result is returned without another shipment, tracking code, event, or dispatch intent

### Requirement: Carrier registration is idempotent across retries

Dispatch SHALL identify a shipment to the carrier with a stable shipment reference and idempotency identity. Equivalent retry after timeout, connection loss, process restart, or lost response MUST return or recover the same carrier shipment; reuse with conflicting immutable shipment facts MUST fail for investigation and MUST NOT create a second shipment.

#### Scenario: Carrier accepts but the response is lost
- **WHEN** registration succeeds remotely and the dispatcher retries because it did not receive the response
- **THEN** Demo Carrier returns the original shipment and the marketplace records one registered result

#### Scenario: Dispatcher restarts before acknowledgement
- **WHEN** an unacknowledged dispatch intent remains after process restart
- **THEN** it is retried without changing the tracking code or creating a duplicate carrier shipment

#### Scenario: Immutable facts conflict
- **WHEN** the same carrier idempotency identity is reused with another order, service, address snapshot, or parcel weight
- **THEN** registration is quarantined as a conflict and neither version overwrites the other

### Requirement: Dispatch retries are bounded and observable

Temporary carrier unavailability SHALL retain `REGISTRATION_PENDING`, retry with bounded exponential backoff and jitter, and expose only a safe pending state to buyer and seller. After the configured attempt limit, the shipment SHALL become `REGISTRATION_FAILED` with an operationally retryable failure record; it MUST NOT revert the already committed seller handoff or fabricate carrier acceptance.

#### Scenario: Demo Carrier is briefly unavailable
- **WHEN** initial registration attempts time out and a later bounded retry succeeds
- **THEN** the shipment advances once to `CREATED`, pending UI clears, and one normalized carrier-created event is retained

#### Scenario: Retry budget is exhausted
- **WHEN** all bounded automatic attempts fail
- **THEN** the shipment reports safe registration failure, the order remains `SHIPPING`, and an authorized operator can request another idempotent attempt

### Requirement: Carrier requests use immutable bounded shipment facts

Registration SHALL use only the committed order reference, stable shipment reference/tracking code, Demo Carrier service, parcel weight, estimated distance, and the minimum pickup/delivery location data required by the demo. It MUST NOT read mutable cart/catalog facts after handoff, and transport logs/errors MUST exclude names, phone numbers, full address lines, session credentials, and unrelated order content.

#### Scenario: Shop profile changes after checkout
- **WHEN** the shop edits its current pickup profile before or after dispatch
- **THEN** carrier registration and tracking continue to use the committed shipment snapshot

#### Scenario: Carrier returns malformed data
- **WHEN** a registration response has unknown fields, an invalid identity, impossible status, or mismatched shipment reference
- **THEN** it is rejected, private data is not logged, and the local shipment does not advance

### Requirement: Demo Carrier remains replaceable and never implies physical booking

The marketplace SHALL expose one versioned carrier contract for quoting, shipment registration, shipment retrieval, and normalized events. Demo Carrier SHALL satisfy that contract locally and label every result as simulated; no T33 action SHALL purchase a label, dispatch a driver, contact a recipient, or require credentials for a real carrier.

#### Scenario: Local demo environment has no public network
- **WHEN** the Demo Carrier service and marketplace local dependencies are available without internet access
- **THEN** quoting, registration, state simulation, and callback synchronization remain testable end to end

#### Scenario: A future provider is selected
- **WHEN** a later change supplies another carrier implementation of the same observable contract
- **THEN** checkout and order tracking can consume its normalized quote and shipment result without accepting carrier-specific state names as marketplace states

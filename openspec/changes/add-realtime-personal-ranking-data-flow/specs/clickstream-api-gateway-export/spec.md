## Purpose

Define the application-facing contract for collecting privacy-safe clickstream events and delivering them durably to AWS API Gateway without coupling buyer journeys to analytics availability.

## ADDED Requirements

### Requirement: Versioned clickstream event contract

The system SHALL accept only versioned clickstream events whose type is one of `search_submitted`, `product_impression`, `product_clicked`, `recommendation_impression`, `recommendation_clicked`, `favorite_changed`, `cart_changed`, or `order_completed`. Every accepted event MUST contain a client-generated UUID event ID, an ISO-8601 UTC occurrence timestamp, a supported schema version, a supported surface, and a first-party session identifier. Events MUST contain the product, placement, position, request/correlation, and ranking-version fields that are applicable to their event type.

#### Scenario: A supported event is accepted

- **WHEN** a first-party client submits a well-formed event using a supported schema version and event type
- **THEN** the service validates the event and returns an asynchronous acceptance response containing the event ID

#### Scenario: An unsupported schema version is rejected

- **WHEN** a client submits an event with an unsupported schema version
- **THEN** the service rejects the event with a validation response and does not enqueue it for export

#### Scenario: An event is missing type-specific context

- **WHEN** an event omits a field required for its event type, such as the clicked product ID for `product_clicked`
- **THEN** the service rejects the event with field-level validation details and does not enqueue it for export

### Requirement: Server-owned identity and privacy boundary

The system MUST derive an authenticated buyer identity from the server-side authentication context and MUST NOT trust a buyer identifier supplied in an event payload. Before export, the system SHALL replace authenticated buyer identifiers with a keyed pseudonymous identifier and SHALL represent unauthenticated traffic with a first-party pseudonymous session identifier. Exported events MUST NOT contain credentials, access tokens, email addresses, postal addresses, raw buyer profiles, model weights, detailed payment data, or other prohibited fields.

#### Scenario: An authenticated buyer submits an event

- **WHEN** an authenticated request submits a valid clickstream event
- **THEN** the stored export payload uses identity derived from the authenticated server context and not from the request body

#### Scenario: A payload attempts to spoof buyer identity

- **WHEN** a request includes a buyer ID or another server-owned identity field
- **THEN** the service rejects the prohibited field or removes it before persistence and never exports it as the buyer identity

#### Scenario: A guest submits an event

- **WHEN** an unauthenticated first-party session submits a valid event
- **THEN** the event is associated only with its pseudonymous session context and contains no authenticated buyer identifier

#### Scenario: A payload contains prohibited personal data

- **WHEN** a submitted event contains a credential, payment field, address, email, or another prohibited property
- **THEN** the service rejects the property or event before persistence and records no prohibited value in application logs

### Requirement: First-party collection does not block buyer journeys

The system SHALL expose clickstream collection only through a first-party application boundary, and browser clients MUST NOT receive AWS credentials or the API Gateway delivery secret. Collection and export failures MUST NOT change the result of search, recommendation, product, favorite, cart, checkout, or order operations.

#### Scenario: Analytics collection is unavailable during a buyer action

- **WHEN** clickstream collection or delivery is unavailable while a buyer searches, browses, favorites, adds to cart, or checks out
- **THEN** the buyer operation completes according to its own business rules without waiting for analytics recovery

#### Scenario: A browser emits an interaction event

- **WHEN** a browser records an impression or click
- **THEN** it submits the event to the first-party application endpoint without possessing an API Gateway credential

#### Scenario: A server-authoritative outcome occurs

- **WHEN** a favorite, cart, or completed-order state change commits successfully
- **THEN** its clickstream event reflects the committed server outcome and is not inferred solely from an optimistic browser action

### Requirement: Durable and idempotent event acceptance

The service MUST durably persist each accepted event before acknowledging it for asynchronous delivery. Event ID SHALL be the idempotency key, and repeating an otherwise identical accepted event ID MUST NOT create another export record. Acceptance ordering MUST NOT imply global delivery ordering.

#### Scenario: A new event is accepted

- **WHEN** validation succeeds for an event ID that has not been accepted previously
- **THEN** the service durably records one pending export and responds with HTTP 202

#### Scenario: A client retries an accepted event

- **WHEN** the same event ID and equivalent event content are submitted more than once
- **THEN** the service returns an idempotent success response and retains exactly one export record

#### Scenario: An event ID is reused with different content

- **WHEN** an accepted event ID is submitted again with materially different event content
- **THEN** the service rejects the conflict and does not modify the original export record

### Requirement: Batched delivery to AWS API Gateway

The exporter SHALL send pending events to the configured AWS API Gateway HTTPS endpoint in bounded batches with batch metadata, schema version, unique event IDs, and privacy-safe event payloads. A batch MUST be marked delivered only after a successful downstream acknowledgement. The downstream contract MUST require a success response to mean that the batch has crossed a durable acceptance boundary.

#### Scenario: API Gateway durably accepts a batch

- **WHEN** the configured endpoint returns a successful acknowledgement for a valid batch
- **THEN** the exporter marks only the acknowledged events as delivered and records delivery latency

#### Scenario: API Gateway partially rejects a batch

- **WHEN** the endpoint identifies accepted and rejected event IDs in its acknowledgement
- **THEN** the exporter marks accepted events delivered and applies the appropriate retry or terminal state to each rejected event

#### Scenario: The downstream success response is ambiguous

- **WHEN** the endpoint response does not satisfy the configured acknowledgement contract
- **THEN** the exporter retains the batch for safe retry and does not mark its events delivered

### Requirement: Bounded retry, leasing, and terminal handling

The exporter MUST lease records before dispatch so concurrent workers cannot intentionally send the same record at the same time. Network failures, timeouts, HTTP 408, HTTP 429, and server errors SHALL be retried with exponential backoff and jitter. Non-retryable contract or authentication failures SHALL enter a terminal state. Retry attempts and pending records MUST be bounded by configurable attempt and retention limits.

#### Scenario: A transient delivery failure occurs

- **WHEN** delivery fails because of a timeout, network error, HTTP 408, HTTP 429, or HTTP 5xx response
- **THEN** the exporter releases or renews the record for a later attempt using bounded exponential backoff with jitter

#### Scenario: A permanent delivery failure occurs

- **WHEN** API Gateway rejects a batch because of an invalid contract or invalid authentication
- **THEN** the exporter moves the affected records to a terminal failure state without retrying indefinitely

#### Scenario: A worker loses its lease

- **WHEN** an export worker does not complete before its lease expires
- **THEN** another worker may safely reclaim the record while downstream idempotency by event ID prevents duplicate analytical events

#### Scenario: An event exceeds retention or attempt limits

- **WHEN** a pending event reaches its configured retention age or maximum attempt count
- **THEN** the exporter marks it dropped or terminal, emits a metric, and excludes it from normal dispatch

### Requirement: Configurable capture and deterministic sampling

The system SHALL support independently configurable enablement and sampling by event type and surface. Sampling MUST be deterministic for a stable sampling key so retries and duplicate submissions reach the same decision. Server-authoritative outcome events MAY use a separate policy from high-volume impression events.

#### Scenario: Capture is disabled for a surface

- **WHEN** collection is disabled for an event surface
- **THEN** the service performs no export persistence for that event and returns a non-error response

#### Scenario: An impression is outside the sample

- **WHEN** deterministic sampling excludes a valid high-volume impression event
- **THEN** the service records no export item and returns a non-error response for the event ID

#### Scenario: A retry repeats a sampling decision

- **WHEN** the same stable event ID is evaluated more than once under the same sampling configuration
- **THEN** every evaluation produces the same include or exclude decision

### Requirement: Operational visibility and privacy-safe replay

The system MUST expose backlog count and age, accepted, delivered, retried, rejected, terminal, and dropped event metrics. Logs MUST identify batches and events without containing prohibited personal data or secrets. Operators SHALL be able to replay eligible terminal or pending records within configurable limits while preserving original event IDs.

#### Scenario: Delivery health is inspected

- **WHEN** an operator queries the clickstream health surface
- **THEN** the system reports exporter readiness and backlog signals without exposing event payloads or secrets

#### Scenario: An eligible event is replayed

- **WHEN** an authorized operator requests replay for an eligible bounded selection
- **THEN** the system schedules those records for another attempt with their original event IDs and records the replay action

#### Scenario: A replay request is too broad

- **WHEN** an operator requests more records or a wider age range than configured limits permit
- **THEN** the system rejects the replay request without changing record state

### Requirement: Explicit downstream ownership boundary

The application SHALL define the payload and acknowledgement contract through AWS API Gateway, but it MUST NOT claim that Glue jobs, S3 layout and retention, Athena tables and queries, or QuickSight dashboards are provisioned by this capability. Downstream components MUST preserve event IDs and schema versions so analytical ingestion can deduplicate and evolve the dataset.

#### Scenario: An event crosses the application boundary

- **WHEN** API Gateway durably acknowledges a batch
- **THEN** the application considers delivery complete while downstream processing remains owned and monitored by the analytics platform

#### Scenario: A downstream component receives a newer schema

- **WHEN** Glue or another downstream consumer receives an event schema version it does not support
- **THEN** the downstream contract can quarantine or reject the event by event ID without silently interpreting it as an older schema

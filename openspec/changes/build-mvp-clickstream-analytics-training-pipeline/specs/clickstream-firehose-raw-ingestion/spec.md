## Purpose

Định nghĩa happy path để batch clickstream đi từ API Gateway qua Lambda và Firehose vào vùng S3 Raw có schema, partition và dữ liệu an toàn cho analytics lẫn training.

## ADDED Requirements

### Requirement: Versioned clickstream batch ingestion

The system SHALL accept a versioned clickstream batch through the configured API Gateway route. Each event MUST include `eventId`, `schemaVersion`, `eventType`, `occurredAt`, `shopId`, `productId`, `surface`, and at least one of `buyerPseudonym` or `sessionPseudonym`; impression and click events MUST also preserve their applicable request, recommendation, placement, and position context.

#### Scenario: A valid batch enters the ingestion pipeline

- **WHEN** API Gateway receives a valid batch whose events use the supported schema version
- **THEN** the ingestion Lambda validates the batch and submits its events to the configured Firehose delivery stream

### Requirement: Durable raw clickstream objects

The system SHALL configure Firehose to write accepted clickstream events as newline-delimited compressed JSON objects in S3 Raw. Objects MUST be partitioned by UTC ingestion date and hour, and every stored event MUST preserve its original `eventId`, `eventType`, and `occurredAt`.

#### Scenario: Firehose delivers accepted records

- **WHEN** Firehose flushes an accepted buffer
- **THEN** S3 Raw contains a compressed JSON object under the matching UTC date and hour partition with every accepted event represented once in that delivery object

### Requirement: Privacy-minimized raw schema

The raw clickstream contract MUST use pseudonymous buyer or session identifiers and MUST NOT contain access tokens, credentials, email addresses, postal addresses, raw buyer profiles, payment details, or model weights.

#### Scenario: A valid event is stored in S3 Raw

- **WHEN** an accepted event is delivered to S3 Raw
- **THEN** its identity fields are pseudonymous and its stored payload contains only fields allowed by the versioned raw schema

### Requirement: Least-privilege ingestion access

The ingestion Lambda SHALL be permitted to write only to the designated Firehose stream, and Firehose SHALL be permitted to write only to the designated S3 Raw prefix and its own operational log destination.

#### Scenario: The ingestion path uses its configured resources

- **WHEN** a valid batch follows the happy path
- **THEN** each AWS component accesses only the named downstream resource and actions required for that delivery

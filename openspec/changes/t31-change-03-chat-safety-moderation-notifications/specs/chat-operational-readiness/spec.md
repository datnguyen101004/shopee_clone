## ADDED Requirements

### Requirement: Chat safety and notification release gates use real shared state
The chat release workflow SHALL verify conversation actions, shared rate enforcement, reports, restrictions, notification aggregation, attention suppression, read synchronization, moderation decisions, and audit effects against PostgreSQL and real multi-client Socket.IO. Dedicated database suites MUST fail if skipped, and mocked browser coverage MUST NOT satisfy this release gate.

#### Scenario: Shared rate limit is exercised across application instances
- **WHEN** the integration gate sends concurrent attempts through independently constructed API instances backed by the same PostgreSQL database
- **THEN** one shared allowance is enforced with deterministic accepted and rate-limited counts

#### Scenario: Block and send race is exercised
- **WHEN** a block mutation races a new message acceptance in the PostgreSQL gate
- **THEN** the committed order produces one valid serial outcome with no forbidden message, unread increment, notification, or outbox side effect after the effective block

#### Scenario: Notification aggregation is exercised with real realtime delivery
- **WHEN** real authenticated clients cover closed widget, wrong conversation, newest-region attention, mute, reconnect, and multi-tab cases
- **THEN** notification aggregates, chat unread totals, and notification unread totals converge without mocked Socket.IO transport

#### Scenario: Concurrent admin decisions are exercised
- **WHEN** two real database commands target the same chat case version
- **THEN** the gate proves one effective outcome, one restriction transition, one notice, and one privileged audit event

#### Scenario: Existing non-chat behavior is regressed
- **WHEN** the release gate runs the complete moderation and notification suites
- **THEN** existing product/shop moderation, audit, order/promotion/account notifications, and chat Change 1/2 journeys remain passing

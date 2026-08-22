## Purpose

Manages user channel delivery preferences per notification category and guarantees delivery for non-opt-outable safety and transactional alerts.

## ADDED Requirements

### Requirement: User channel preference management
The system SHALL allow users to view and configure their delivery channel preferences (`IN_APP`, `EMAIL`) for each notification category (`ORDERS`, `PROMOTIONS`, `ACCOUNT`, `SYSTEM`).

#### Scenario: Update channel preference for promotions
- **WHEN** user disables `EMAIL` channel for `PROMOTIONS` category
- **THEN** the system updates the user preference record, and subsequent promotional notifications are dispatched only to the in-app channel.

### Requirement: Mandatory transactional notices enforcement
The system SHALL strictly enforce that security, payment, refund, and dispute decision notifications cannot be disabled by user preferences.

#### Scenario: Critical order or dispute notice delivery
- **WHEN** an event marked as `MANDATORY` occurs (such as order confirmation, dispute escalation, or refund finalized)
- **THEN** the system dispatches notifications to all designated channels regardless of user preference settings.

## MODIFIED Requirements

### Requirement: Admin console is gated to current admin role

The system SHALL expose the admin console only to authenticated users whose current roles include `admin`. Guests SHALL be prompted to sign in. Authenticated buyers and sellers SHALL receive a forbidden state with no privileged list or dashboard payload. Every admin API used by the console MUST require current `admin` authorization and MUST return sanitized 401 or 403 Problem Details without leaking existence of other users, shops, settings, or seller review reports.

#### Scenario: Admin opens the console

- **WHEN** an authenticated admin visits `/admin`
- **THEN** the console shell, dashboard, and navigation render using admin-only APIs

#### Scenario: Buyer hits /admin directly

- **WHEN** an authenticated buyer opens `/admin` or calls an admin list endpoint
- **THEN** no privileged records are returned and the UI shows a forbidden state

#### Scenario: Admin opens the reported-review queue

- **WHEN** an authenticated admin opens the review moderation tab
- **THEN** it shows a private queue of reported reviews with safe review and report context

#### Scenario: Non-admin requests reported reviews

- **WHEN** a buyer or seller calls an admin review-report endpoint
- **THEN** the request is denied and no report metadata is returned

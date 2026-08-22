# admin-console Specification

## Purpose
Give authenticated admins a dedicated console with dashboard counts, navigation, searchable paginated lists, and safe operational states without exposing privileged data to other roles.
## Requirements
### Requirement: Admin console is gated to current admin role
The system SHALL expose the admin console only to authenticated users whose current roles include `admin`. Guests SHALL be prompted to sign in. Authenticated buyers and sellers SHALL receive a forbidden state with no privileged list or dashboard payload. Every admin API used by the console MUST require current `admin` authorization and MUST return sanitized 401 or 403 Problem Details without leaking existence of other users, shops, or settings.

#### Scenario: Admin opens the console
- **WHEN** an authenticated admin visits `/admin`
- **THEN** the console shell, dashboard, and navigation render using admin-only APIs

#### Scenario: Buyer hits /admin directly
- **WHEN** an authenticated buyer opens `/admin` or calls an admin list endpoint
- **THEN** no privileged records are returned and the UI shows a forbidden state

### Requirement: Dashboard shows bounded marketplace counts
The admin dashboard SHALL return current bounded counts for users, shops, pending shop approvals, categories, enabled homepage modules, and recent privileged-audit volume. Counts MUST be computed server-side from authoritative records. Responses MUST use private no-store caching and MUST omit credentials, tokens, and personal secrets.

#### Scenario: Admin loads dashboard
- **WHEN** an admin requests the dashboard
- **THEN** the response includes integer counts and a generated timestamp without user emails in bulk

#### Scenario: Non-admin requests dashboard
- **WHEN** a seller or buyer calls the dashboard endpoint
- **THEN** the request is denied and no counts are disclosed

### Requirement: Entity lists are searchable and paginated
Users, shops, categories, banners, and homepage-module settings lists SHALL support cursor pagination, a bounded page size, and server-side filters (status, keyword, and entity-specific filters). Keyword search MUST be bounded and MUST NOT return password hashes, session tokens, or full address dumps. Empty, loading, invalid-filter, and unavailable states MUST be explicit in the UI.

#### Scenario: Admin filters suspended users
- **WHEN** an admin lists users with status `suspended` and a valid cursor
- **THEN** only matching safe user summaries are returned in stable order

#### Scenario: Invalid list query
- **WHEN** limit, cursor, or filter values are malformed
- **THEN** the API returns 400 Problem Details and persists no change

### Requirement: Destructive actions require UI confirmation
Suspend, restore, delete-category (when allowed), and other destructive or status-changing actions SHALL require an explicit confirmation step and a non-blank bounded reason before the client submits the command. Cancelling confirmation MUST leave records unchanged.

#### Scenario: Admin cancels suspend
- **WHEN** an admin opens suspend confirmation and dismisses it
- **THEN** no API mutation is sent and the entity remains in its current status

#### Scenario: Admin confirms suspend with reason
- **WHEN** an admin confirms suspend with a valid reason
- **THEN** the command is submitted exactly once until the response returns

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


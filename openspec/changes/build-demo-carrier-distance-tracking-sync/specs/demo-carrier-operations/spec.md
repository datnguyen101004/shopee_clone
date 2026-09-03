## Purpose

Defines a dedicated shared-auth Demo Carrier portal for authorized carrier operators to find, inspect, and advance simulated shipments without granting carrier authority to ordinary marketplace users or creating physical deliveries.

## ADDED Requirements

### Requirement: Carrier portal uses shared authentication and a distinct operator permission

The existing website SHALL expose `/carrier` through the shared account login/session system and SHALL require `CARRIER_OPERATOR` for every carrier page and operations API. Unauthenticated users MUST return to their intended carrier page after successful login. A buyer, seller, or admin without `CARRIER_OPERATOR` MUST receive a stable access-denied experience with no shipment data, while a multi-role account MUST enter `/carrier` only through explicit navigation.

#### Scenario: Carrier operator signs in
- **WHEN** an unauthenticated carrier operator opens `/carrier`, completes the shared login flow, and still has `CARRIER_OPERATOR`
- **THEN** the user returns to `/carrier` and sees the carrier dashboard

#### Scenario: Ordinary marketplace account opens carrier portal
- **WHEN** an authenticated buyer, seller, or admin without `CARRIER_OPERATOR` requests any `/carrier` page or operations endpoint
- **THEN** access is denied without exposing shipment counts, references, or carrier actions

#### Scenario: Multi-role account changes area
- **WHEN** an account has both marketplace and `CARRIER_OPERATOR` permissions
- **THEN** normal sign-in does not force a carrier redirect and the account can explicitly switch between marketplace and `/carrier`

### Requirement: Carrier portal has a dedicated operational layout

`/carrier` SHALL use a dedicated Demo Carrier shell rather than the storefront, Seller Center, or admin console shell. It SHALL provide persistent simulation labeling, navigation for `Tổng quan` and `Vận đơn`, current account controls, a return-to-marketplace action, responsive sidebar/menu behavior, active-route indication, and loading/access-denied/error states from the approved UI/UX specification.

#### Scenario: Operator opens the portal on desktop
- **WHEN** an authorized operator opens `/carrier` at a desktop viewport
- **THEN** the dedicated carrier sidebar, simulation banner, account controls, dashboard content, and active navigation are visible without storefront shopping controls

#### Scenario: Operator opens the portal on mobile
- **WHEN** the portal is opened at 360 px
- **THEN** navigation collapses into an accessible menu and content remains usable without horizontal scrolling or covered actions

### Requirement: Carrier dashboard summarizes actionable shipments

The carrier dashboard SHALL show server-authored counts for pending acceptance, in transit, out for delivery, delivery failed, and completed today, plus a bounded newest-first `Vận đơn cần xử lý` list prioritizing registration failure, delivery failure, and return-in-transit states. Selecting a count SHALL open the shipment list with the corresponding normalized filter; an empty dashboard SHALL provide a successful no-work state.

#### Scenario: Operator selects a dashboard count
- **WHEN** an operator selects “Đang giao hàng”
- **THEN** the portal opens the shipment list with the matching filter applied and preserves that filter in the page URL

#### Scenario: No shipment needs attention
- **WHEN** there are no registration failures, delivery failures, or return-in-transit shipments
- **THEN** the dashboard displays “Không có vận đơn cần xử lý lúc này” rather than an error

### Requirement: Carrier operator can find safe shipment summaries

The carrier shipment list SHALL support bounded state/service/date filtering, exact tracking or order reference search, deterministic newest-activity-first cursor pagination, URL-preserved criteria, and an empty state. Each item SHALL include only tracking code, order reference, shop safe identity, pickup/delivery area, service, current state, last update, and simulation label; recipient names, phone numbers, full address lines, credentials, and unrelated order details MUST be absent.

#### Scenario: Operator filters by delivery state
- **WHEN** an operator selects a supported state filter
- **THEN** every returned item matches that state and pagination remains bound to the normalized filter

#### Scenario: Operator returns from detail
- **WHEN** an operator opens a shipment and returns to the list
- **THEN** the previous search, filters, cursor position, and scroll context are restored when still valid

#### Scenario: Cursor is reused with another filter
- **WHEN** a cursor issued for one filter/search is submitted with different normalized criteria
- **THEN** strict validation returns `400` Problem Details and no list data

### Requirement: Carrier detail exposes bounded order context and valid actions

Shipment detail SHALL show breadcrumb/back navigation, tracking and order references, shop safe identity, pickup/delivery area, service, estimated distance, parcel weight, fee, current state, last update, chronological timeline, and only actions valid for the current state. It MUST NOT expose marketplace payment details, buyer account data, phone numbers, full address lines, internal callback receipts, credentials, or unrelated shop orders.

#### Scenario: Operator opens a shipment
- **WHEN** an authorized operator requests a known Demo Carrier tracking code
- **THEN** the detail renders the safe shipment summary, current state, timeline, and state-derived available actions

#### Scenario: Unknown shipment is requested
- **WHEN** an operator requests an unknown or non-Demo-Carrier tracking code
- **THEN** the portal returns the same non-enumerating not-found experience and no order data

### Requirement: Carrier operator can advance only valid simulation actions

Shipment detail SHALL permit only advance along the success path, record supported delivery failure reasons, retry delivery, start return, advance return, or retry failed registration. Every mutation SHALL require the current shipment ETag and UUID idempotency key, enforce the project Origin policy, and return the authoritative updated projection or a refreshable pending result.

#### Scenario: Operator advances one step
- **WHEN** an operator submits the available next action with current version and a new key
- **THEN** Demo Carrier emits one signed external event and the portal renders the resulting normalized state after synchronization

#### Scenario: Operator skips a state
- **WHEN** an action attempts to move from `CREATED` directly to `DELIVERED`
- **THEN** the command conflicts and neither carrier nor marketplace timeline changes

#### Scenario: Command response is lost
- **WHEN** an equivalent operation is retried with the same idempotency key
- **THEN** the original result is returned without another external or marketplace event

### Requirement: Delivery failure requires a controlled reason

`FAIL_DELIVERY` SHALL be available only from `OUT_FOR_DELIVERY` and require one of `RECIPIENT_UNREACHABLE`, `RECIPIENT_RESCHEDULED`, `ADDRESS_UNCLEAR`, `RECIPIENT_REFUSED`, or `OTHER`. `OTHER` SHALL require a bounded normalized internal note. Buyer/seller projections SHALL expose only approved public wording and MUST NOT expose the operator identity or internal note.

#### Scenario: Operator records an unreachable recipient
- **WHEN** the operator selects `RECIPIENT_UNREACHABLE` from `OUT_FOR_DELIVERY`
- **THEN** one `DELIVERY_FAILED` event appears with safe public wording and retry/return actions become available

#### Scenario: Other reason has no note
- **WHEN** `OTHER` is submitted without a valid note
- **THEN** validation fails and shipment state remains unchanged

### Requirement: Fast demonstration reuses ordinary one-step commands

The carrier portal SHALL offer a client-controlled “Chạy nhanh hành trình thành công” sequence that calls the same one-step action repeatedly, displays current and next state, and can be paused. It MUST NOT use a hidden skip-to-terminal command, and closing, hiding, or navigating away from the page MUST stop initiating further steps.

#### Scenario: Operator runs the fast success journey
- **WHEN** the operator confirms fast mode on a nonterminal success-path shipment
- **THEN** each intermediate state appears and synchronizes in order before the next action begins

#### Scenario: Operator pauses fast mode
- **WHEN** the operator pauses, hides, or leaves the page
- **THEN** no additional client-driven transition is initiated and the last confirmed state remains authoritative

#### Scenario: One fast-mode step fails
- **WHEN** a one-step command fails or conflicts during the sequence
- **THEN** the sequence stops, refreshes current state, and offers a safe retry without assuming later states

### Requirement: Carrier portal is responsive and accessible

The dashboard, list, detail, timeline, dialogs, actions, loading, empty, duplicate, conflict, disconnected, success, and retry states SHALL follow the approved T33 UI/UX specification at 360, 768, and 1440 px. Controls MUST be keyboard accessible, focus managed, text labeled, contrast safe, and compatible with reduced motion.

#### Scenario: Operator uses keyboard navigation
- **WHEN** an operator opens and closes a command dialog using the keyboard
- **THEN** focus remains trapped while open and returns to the triggering action after close

#### Scenario: Operator receives a new state while reading history
- **WHEN** the detail refresh observes a new event while the operator is reading an older timeline entry
- **THEN** reading position is preserved and a labeled control leads to the latest event

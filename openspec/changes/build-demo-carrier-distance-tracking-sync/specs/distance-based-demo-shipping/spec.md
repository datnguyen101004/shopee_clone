## Purpose

Defines deterministic Demo Carrier quotes whose itemized VND fee is based on an estimated route distance, shipment weight, and selected service without relying on a live map or real carrier network.

## ADDED Requirements

### Requirement: Legacy addresses resolve to stable demo locations

The system SHALL resolve an active approved shop's pickup province and district and the buyer-owned delivery province and district against a versioned legacy Vietnam location snapshot. Resolution MUST be accent, case, whitespace, and common-prefix tolerant, MUST produce a stable location identity, and MUST NOT send recipient names, phone numbers, or address lines to a public geocoder.

#### Scenario: Both addresses are supported
- **WHEN** a quote uses recognizable legacy pickup and delivery province/district values
- **THEN** both addresses resolve to stable demo location identities used for distance estimation

#### Scenario: Buyer address cannot be resolved
- **WHEN** the selected delivery province or district is missing or ambiguous
- **THEN** that shop quote is unavailable with an address-specific blocker and no guessed fee

#### Scenario: Shop pickup address is incomplete
- **WHEN** an active shop has no usable pickup province or district
- **THEN** that shop quote is unavailable, the buyer is not instructed to edit the shop, and checkout cannot confirm the affected shop order

### Requirement: Route distance is deterministic and explicitly approximate

Calculation version `demo-distance-v1` SHALL derive a straight-line distance from versioned demo location coordinates, multiply it by a documented road factor of `1.25`, round upward to a whole kilometer, enforce a minimum billable distance of 3 km, and cap supported billable distance at 2,000 km. Identical canonical addresses under the same version MUST always produce the same `estimatedDistanceKm` without clock, request-order, random, browser, or external-network influence.

#### Scenario: Repeat an identical location pair
- **WHEN** the same canonical pickup and delivery locations are quoted repeatedly under `demo-distance-v1`
- **THEN** every result reports the same estimated and billable distance

#### Scenario: Quote locations in the same district
- **WHEN** pickup and delivery resolve within the same district
- **THEN** the deterministic local estimate is at least the 3 km minimum instead of becoming zero

#### Scenario: Route exceeds the supported demo range
- **WHEN** the estimated route would exceed 2,000 km
- **THEN** the quote rejects the unsupported distance rather than silently undercharging beyond the cap

### Requirement: Demo Carrier offers one versioned three-service catalog

Demo Carrier SHALL offer `ECONOMY`, `STANDARD`, and `EXPRESS` for a non-empty supported shipment. The catalog SHALL label all results as simulated, default an omitted shop choice to `STANDARD`, reject an unsupported or duplicate shop choice, and expose estimated delivery windows of 4–6, 2–4, and 1–2 days respectively.

#### Scenario: Default the service
- **WHEN** a supported shop shipment has no explicit service selection
- **THEN** the quote uses `STANDARD` and returns that choice explicitly

#### Scenario: Select a valid service
- **WHEN** the buyer selects one of the three documented services for a shop
- **THEN** the quote uses that service's distance, weight, and delivery-window rules

#### Scenario: Submit an unknown service
- **WHEN** a request contains an unsupported service or repeats a shop selection
- **THEN** strict validation returns sanitized `400` Problem Details and no quote

### Requirement: Fees use explicit distance and weight bands

`demo-distance-v1` SHALL calculate safe integer VND with these fixed rules:

| Service | Base fee including first 5 km | Each started 5 km from over 5 through 50 km | Each started 100 km over 50 km | Each started 500 g over first 500 g |
| --- | ---: | ---: | ---: | ---: |
| `ECONOMY` | 15,000 | 2,000 | 4,000 | 2,000 |
| `STANDARD` | 22,000 | 3,000 | 6,000 | 3,000 |
| `EXPRESS` | 35,000 | 4,000 | 8,000 | 4,000 |

The response SHALL expose base, near-distance, long-distance, weight, and total fee components, and the total MUST equal their checked sum.

#### Scenario: Quote a 6 km standard parcel weighing at most 500 g
- **WHEN** `STANDARD` is selected for a 6 km billable route and a parcel of at most 500 g
- **THEN** the quote itemizes 22,000 VND base, one 3,000 VND near-distance block, zero long-distance and weight surcharge, and 25,000 VND total

#### Scenario: Quote a 155 km standard parcel weighing 1,200 g
- **WHEN** `STANDARD` is selected for a 155 km route and a 1,200 g parcel
- **THEN** the quote charges nine near-distance blocks, two long-distance blocks, two additional-weight blocks, and returns their exact checked sum

#### Scenario: Arithmetic exceeds a safe boundary
- **WHEN** quantity, weight, distance, or a derived fee cannot remain a safe non-negative integer
- **THEN** quoting fails safely and no truncated or floating-point monetary value is returned

### Requirement: One authoritative quote is calculated per selected shop

The system SHALL aggregate eligible selected lines by canonical shop, calculate checked shipment weight as the sum of variant weight times quantity, and request exactly one Demo Carrier quote per non-empty shop. Different shops MUST retain independent origins, services, distances, fee components, and payable totals.

#### Scenario: Checkout contains two shops
- **WHEN** selected eligible lines belong to two shops
- **THEN** the response contains two independent distance quotes and the overall shipping total is their exact sum

#### Scenario: One shop contains multiple lines
- **WHEN** several selected variants belong to one shop
- **THEN** their weights are aggregated and the shop is charged one base fee and one set of distance bands

#### Scenario: A cart line becomes ineligible
- **WHEN** a selected line is excluded by current commerce validation
- **THEN** its quantity and weight contribute neither to the shipment nor its fee

### Requirement: Checkout treats a recalculated quote as authoritative

Cart quote, checkout preview, and checkout confirmation SHALL use the same server-authored Demo Carrier calculation. Changing address, quantity, included lines, or service SHALL invalidate the displayed shipping result until a complete replacement quote is validated. Confirmation MUST recalculate current facts, reject a changed checkout fingerprint, and persist the accepted service, calculation version, location-resolution level, estimated distance, weight, fee components, and delivery window in the immutable order shipping snapshot.

#### Scenario: Buyer changes destination
- **WHEN** the buyer selects another owned delivery address
- **THEN** all affected shops enter a pending state and totals are replaced only after a complete authoritative quote succeeds

#### Scenario: Facts change before confirmation
- **WHEN** product quantity, weight, shop pickup address, destination, service, or pricing version changes after preview
- **THEN** checkout refuses silent confirmation and requires the buyer to review the replacement totals

#### Scenario: Historical order is opened after a pricing upgrade
- **WHEN** an order committed with `mock-v1` or an earlier quote is viewed after T33 deployment
- **THEN** its original shipping snapshot and money remain unchanged and are not recomputed with `demo-distance-v1`

### Requirement: Shipping UI identifies simulation and itemizes the estimate

Checkout SHALL show Demo Carrier, a simulation label, selected service, estimated distance, delivery window, fee, and an expandable itemized calculation per shop. Missing-address, pending, stale, unavailable, retry, and success states MUST follow the approved T33 UI/UX specification, remain usable at 360, 768, and 1440 px, and never describe the estimate as GPS or a real-carrier promise.

#### Scenario: Buyer expands the fee explanation
- **WHEN** a valid shop quote is displayed and the buyer opens “Xem cách tính”
- **THEN** the UI shows every returned fee component and a plain-language approximate-distance notice whose values reconcile to the displayed total

#### Scenario: One shop quote fails
- **WHEN** one shop cannot be quoted while another shop quote succeeds
- **THEN** only the affected shop shows a recoverable error, checkout confirmation remains unavailable, and the successful shop result is not misrepresented as the whole-order total

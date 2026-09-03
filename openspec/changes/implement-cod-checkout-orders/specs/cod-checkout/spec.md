## Purpose

Defines the buyer-visible contract for safely previewing and confirming a cash-on-delivery checkout from the current authenticated cart.

## ADDED Requirements

### Requirement: Checkout requires an authenticated buyer and an owned active address

The system SHALL allow checkout preview, COD confirmation, and purchase-result retrieval only for an authenticated buyer. It MUST resolve the delivery address from a buyer-owned active address record and MUST NOT accept client-supplied address snapshot fields as authoritative data.

#### Scenario: Authenticated buyer uses an owned address

- **WHEN** a signed-in buyer previews checkout with the identifier of their active delivery address
- **THEN** the system uses the current persisted recipient, phone number, province, district, ward, and address line for the preview

#### Scenario: Checkout is attempted without a valid session

- **WHEN** an unauthenticated or expired session requests checkout preview, COD confirmation, or a purchase result
- **THEN** the system returns a `401` Problem Details response and creates no purchase data

#### Scenario: Address is absent, inactive, or belongs to another buyer

- **WHEN** a buyer supplies an address identifier that is not one of their active addresses
- **THEN** the system returns a non-enumerating `404` Problem Details response and discloses no foreign address fields

#### Scenario: Browser mutation origin is not trusted

- **WHEN** a browser sends a checkout preview or confirmation mutation from an origin that fails the project-wide origin guard
- **THEN** the system returns `403` before executing checkout business logic

### Requirement: Checkout preview is server-authoritative and itemized

The system SHALL expose `POST /api/v1/checkout/preview` with a required current cart `If-Match` value. The request SHALL identify the shipping address, one supported shipping service per participating shop, optional voucher selections, and optional per-shop notes. The response MUST be calculated from current cart, catalog, inventory-read, shipping, address, and voucher data using integer VND minor units and MUST contain the participating shops, selected lines, address, shipping breakdowns, voucher results, totals, readiness blockers, cart version, evaluation time, and a deterministic checkout fingerprint.

#### Scenario: Valid multi-shop preview

- **WHEN** the current cart has eligible selected lines from multiple shops and the buyer submits valid address, shipping, voucher, and note selections
- **THEN** the response groups the lines by shop and returns an itemized current total plus a checkout fingerprint covering the effective selection and calculated checkout facts

#### Scenario: Cart version is missing, malformed, or stale

- **WHEN** checkout preview does not include the current cart ETag in `If-Match`
- **THEN** the system returns `409` Problem Details with the latest cart version and does not return a confirmable fingerprint

#### Scenario: Preview contains a checkout blocker

- **WHEN** the selection is empty, a selected line is unavailable or understocked, a requested voucher is rejected, or a participating shop lacks a valid shipping choice
- **THEN** the system returns an itemized preview marked not ready with stable blocker codes and MUST NOT present that preview as confirmable

#### Scenario: Notes are supplied per shop

- **WHEN** a buyer supplies a note for a participating shop within the documented length limit
- **THEN** the preview normalizes surrounding whitespace, associates the note only with that shop, and includes the normalized value in the checkout fingerprint

#### Scenario: Invalid or foreign shop input is supplied

- **WHEN** shipping or note entries are duplicated, malformed, unsupported, or refer to a shop outside the effective selected cart
- **THEN** the system returns `400` Problem Details with stable invalid-parameter information

### Requirement: COD confirmation revalidates the preview before creating orders

The system SHALL expose `POST /api/v1/checkout/cod` with the current cart `If-Match`, a canonical idempotency key, the previously returned checkout fingerprint, and the checkout selections. Immediately before creation, the system MUST rebuild the authoritative checkout from current data. It SHALL create a purchase only when the rebuilt checkout is ready and its fingerprint equals the submitted fingerprint.

#### Scenario: Current confirmation succeeds

- **WHEN** an authenticated buyer confirms a ready preview and no fingerprinted checkout fact has changed
- **THEN** the system creates one COD purchase result, returns the purchase reference and per-shop orders, and marks the response as a first execution

#### Scenario: Price or checkout facts changed after preview

- **WHEN** product price, availability, selected lines, quantities, address, shipping calculation, voucher eligibility, or normalized notes produce a different fingerprint at confirmation
- **THEN** the system returns `409` Problem Details with a fresh preview payload or a clear refresh instruction and creates no purchase

#### Scenario: Requested voucher becomes invalid

- **WHEN** a requested voucher is expired, exhausted, ineligible, or over the buyer limit during confirmation
- **THEN** confirmation fails atomically with a stable checkout-not-ready conflict instead of silently dropping the voucher

#### Scenario: Client tampers with totals

- **WHEN** a client changes or adds monetary values in a confirmation request
- **THEN** strict request validation rejects the input or the server ignores no authoritative field because monetary totals are not accepted as client authority

### Requirement: COD confirmation is idempotent per buyer

The system SHALL scope idempotency keys to the authenticated buyer and bind every successful key to a canonical request fingerprint and its purchase result. Replays of the same key and same logical request MUST return the original result without repeating order creation, voucher consumption, or cart mutation. Reuse of the same key for a different logical request MUST fail with `409`.

#### Scenario: Successful request is retried

- **WHEN** a buyer repeats an already successful COD confirmation with the same idempotency key and equivalent canonical request
- **THEN** the system returns the original purchase reference and snapshots with a replay indicator and performs no new writes

#### Scenario: Two equivalent confirmations race

- **WHEN** concurrent requests from the same buyer use the same idempotency key and equivalent canonical request
- **THEN** exactly one purchase is committed and both successful callers resolve to that purchase

#### Scenario: Idempotency key is reused with different input

- **WHEN** a buyer reuses a successful idempotency key with a different address, cart version, shipping choice, voucher selection, shop note, or checkout fingerprint
- **THEN** the system returns an idempotency-conflict `409` and leaves the original purchase unchanged

#### Scenario: Initial attempt rolls back

- **WHEN** a confirmation fails before commit
- **THEN** no successful idempotency result is recorded and the buyer can retry that key after correcting the transient or validation condition

### Requirement: Checkout API responses are private, stable, and contract validated

The system SHALL return strict shared-contract payloads, RFC 9457-style Problem Details for failures, and `Cache-Control: private, no-store` on checkout responses. The first successful confirmation SHALL return `201`; an idempotent replay SHALL return `200` with an explicit replay signal.

#### Scenario: Validation fails at the HTTP boundary

- **WHEN** a request contains unknown fields, malformed identifiers, unsupported shipping services, overlong notes, an invalid idempotency key, or an invalid fingerprint
- **THEN** the system returns `400` Problem Details without executing order creation

#### Scenario: First success and replay are distinguishable

- **WHEN** a caller receives a first successful creation and later an idempotent replay
- **THEN** both responses satisfy the same purchase-result contract while their HTTP status or replay metadata identifies whether creation occurred

### Requirement: Buyer can complete and verify checkout in the storefront

The storefront SHALL provide an authenticated checkout screen that displays the selected cart grouped by shop, the chosen delivery address, per-shop shipping choices and notes, voucher feedback, and server totals. The confirmation action MUST remain disabled while the preview is loading, stale, or not ready. After success, the buyer SHALL reach a confirmation screen that can retrieve the committed purchase result by reference and MUST never expose another buyer's purchase.

#### Scenario: Buyer enters checkout from the cart

- **WHEN** a signed-in buyer selects purchasable lines and chooses to buy them
- **THEN** the checkout screen loads the owned address and an authoritative preview rather than trusting totals from the cart UI

#### Scenario: Buyer resolves a blocker

- **WHEN** the preview reports a missing address, unavailable line, rejected voucher, or invalid shipping choice
- **THEN** the screen clearly identifies the blocker, prevents confirmation, and offers the relevant correction or navigation action

#### Scenario: Buyer confirms COD successfully

- **WHEN** the COD request commits successfully
- **THEN** the screen prevents duplicate clicks, navigates to the purchase confirmation route, and displays the purchase reference, each shop order, and the committed total

#### Scenario: Buyer refreshes the confirmation screen

- **WHEN** the authenticated buyer reloads the confirmation route for their purchase reference
- **THEN** the screen retrieves and renders the same immutable committed result without resubmitting checkout

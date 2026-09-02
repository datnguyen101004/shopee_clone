## Purpose

Defines secure and testable VNPAY sandbox redirect, Return URL, IPN, result recovery, and configuration behavior while keeping the backend database authoritative for payment state.

## ADDED Requirements

### Requirement: VNPAY payment URLs are generated server-side

The system SHALL generate the VNPAY 2.1.0 hosted payment URL on the backend from an already committed PaymentAttempt, SHALL sign the canonical sorted parameters with HMAC-SHA512, and SHALL expose only an allowlisted HTTPS VNPAY sandbox URL to the buyer.

#### Scenario: Valid payment URL

- **WHEN** a VNPAY attempt is created for an eligible Purchase
- **THEN** the URL SHALL include the configured terminal code, pay command, VND currency, server amount multiplied by 100, buyer IP, GMT+7 create and expiry times, configured Return URL, a unique transaction reference, and a valid secure hash

#### Scenario: Amount below VNPAY minimum

- **WHEN** Purchase.payableTotalMinor is less than 5,000 VND
- **THEN** the system SHALL reject VNPAY before issuing a payment URL and SHALL return a safe eligibility error

#### Scenario: Generated host is not allowlisted

- **WHEN** configuration or a generated redirect does not target the exact approved VNPAY sandbox HTTPS origin and payment path
- **THEN** the system MUST refuse to return the URL to the client

### Requirement: Every VNPAY attempt has independent correlation

The system SHALL use an opaque alphanumeric vnp_TxnRef unique to each VNPAY PaymentAttempt and SHALL persist sufficient immutable correlation data to reproduce and validate the transaction without encoding a ShopOrder identifier.

#### Scenario: Buyer starts a new checkout after cancellation

- **WHEN** a buyer purchases again after a previous VNPAY order was cancelled or failed
- **THEN** the new checkout SHALL create a new Purchase, new ShopOrders, new PaymentAttempt, and different vnp_TxnRef without reopening the cancelled order

#### Scenario: Callback contains unknown transaction reference

- **WHEN** Return URL, IPN, or QueryDR data contains a vnp_TxnRef that maps to no VNPAY attempt
- **THEN** the system SHALL NOT expose or mutate any Purchase

### Requirement: VNPAY IPN is public but strictly authenticated

The backend SHALL provide GET /api/v1/payment-providers/vnpay/ipn without buyer session authentication. Before any state lookup or mutation, it MUST validate the parameter allowlist and shape, remove hash fields, reproduce the canonical query, and verify vnp_SecureHash with timing-safe comparison.

#### Scenario: Valid success IPN

- **WHEN** VNPAY sends an IPN with valid signature, terminal code, transaction reference, amount, ResponseCode 00, and TransactionStatus 00
- **THEN** the system SHALL persist an idempotent observation, atomically settle the Purchase, transition its ShopOrders from `PENDING_PAYMENT` to `PENDING_CONFIRMATION`, and return HTTP 200 JSON with RspCode 00

#### Scenario: Invalid signature

- **WHEN** an IPN secure hash is missing, malformed, or does not match
- **THEN** the system MUST NOT query or mutate payment state and SHALL return the VNPAY invalid-checksum acknowledgement without revealing verification details

#### Scenario: Invalid amount

- **WHEN** a signed IPN amount does not equal PaymentAttempt.amountMinor multiplied by 100
- **THEN** the system MUST NOT mark the payment PAID and SHALL return the VNPAY invalid-amount acknowledgement

#### Scenario: Wrong terminal code

- **WHEN** a signed IPN contains a terminal code different from the configured merchant terminal
- **THEN** the system SHALL treat the request as invalid and SHALL NOT mutate payment state

#### Scenario: Unknown transaction

- **WHEN** a structurally valid and correctly signed IPN refers to no payment attempt
- **THEN** the system SHALL return the VNPAY order-not-found acknowledgement without leaking internal identifiers

### Requirement: IPN processing is idempotent and monotonic

Repeated, concurrent, or reordered VNPAY observations MUST apply business side effects at most once and MUST NOT regress a Purchase or attempt from a stronger terminal state.

#### Scenario: Duplicate successful IPN

- **WHEN** the same successful IPN is delivered more than once
- **THEN** later deliveries SHALL return an already-confirmed or success acknowledgement and SHALL NOT duplicate inventory consumption, voucher redemption, order events, notifications, or realtime events

#### Scenario: Failure arrives after paid

- **WHEN** a failure or cancellation observation arrives after the Purchase is PAID
- **THEN** the system SHALL record or ignore it according to precedence and MUST keep the Purchase PAID

#### Scenario: Two attempts report success

- **WHEN** one attempt has already settled the Purchase and a different attempt later reports a valid success
- **THEN** the later attempt SHALL NOT reopen fulfillment or consume resources again and SHALL enter the existing refund/manual-resolution safety state

### Requirement: VNPAY results map to normalized attempt states

The system SHALL map documented VNPAY response and transaction status combinations to PAID, FAILED, CANCELLED, EXPIRED, PENDING_RECONCILIATION, or UNKNOWN. Only the combination ResponseCode 00 and TransactionStatus 00 SHALL be considered paid; unknown codes MUST NOT be treated as success.

#### Scenario: Buyer cancels at VNPAY

- **WHEN** an authenticated provider result identifies the documented buyer-cancel response
- **THEN** the attempt and Purchase payment status SHALL become `CANCELLED`, every associated ShopOrder SHALL become `CANCELLED`, resource holds SHALL be released exactly once, and the Purchase SHALL be non-retryable

#### Scenario: Provider reports non-success

- **WHEN** a verified result has a documented terminal non-success code
- **THEN** the attempt SHALL enter the matching terminal state, every associated ShopOrder SHALL become `CANCELLED`, resource holds SHALL be released exactly once, and the Purchase SHALL remain unpaid and non-retryable

#### Scenario: Result code is unknown

- **WHEN** a verified observation contains an unmapped response or transaction status
- **THEN** the attempt SHALL become UNKNOWN or PENDING_RECONCILIATION, its ShopOrders SHALL remain `PENDING_PAYMENT`, the system SHALL emit a metric, and backend recovery SHALL continue

### Requirement: Return URL is navigation only

The frontend SHALL expose /payment/callback for VNPAY browser return. It SHALL use vnp_TxnRef only to perform an authenticated owner-scoped resolution to an internal payment reference and MUST NOT derive, display, or persist an authoritative payment result from vnp_ResponseCode, vnp_TransactionStatus, or vnp_SecureHash in the browser.

#### Scenario: Return arrives after IPN

- **WHEN** the buyer returns after the backend has committed PAID
- **THEN** the callback SHALL resolve the payment and navigate to the buyer order view that displays the paid result

#### Scenario: Return arrives before IPN

- **WHEN** the callback resolves an attempt whose backend state is still uncertain
- **THEN** the UI SHALL display “Waiting for VNPAY confirmation”, poll the owner-scoped status API with bounded backoff, and keep polling until IPN produces a terminal backend state or the payment window is reached

#### Scenario: IPN result is reflected in buyer shop orders

- **WHEN** a status read observes a terminal state committed from IPN
- **THEN** the callback SHALL redirect to `/account/orders/:orderReference` when the Purchase has one ShopOrder, or `/account/orders` when it has multiple ShopOrders; each buyer order SHALL show exactly one shop and reflect `PENDING_CONFIRMATION` after success or `CANCELLED` after terminal failure

#### Scenario: Buyer tampers with Return URL

- **WHEN** browser query parameters claim success but backend state is not PAID
- **THEN** the UI MUST continue to show the backend state and SHALL NOT trigger a payment mutation

### Requirement: Missing or uncertain IPNs use bounded backend recovery

The backend SHALL use the configured VNPAY transaction API for QueryDR only after a grace period or an uncertain create/IPN result. Query requests and responses MUST be signed, correlated, rate-bounded, and passed through the same observation finalizer as IPN.

#### Scenario: QueryDR confirms success

- **WHEN** a signed QueryDR response matches terminal code, transaction reference, amount, and transaction identity and reports success
- **THEN** the system SHALL apply it through the same atomic and idempotent paid transition used by IPN

#### Scenario: QueryDR times out

- **WHEN** the VNPAY transaction API times out or returns an unverifiable response
- **THEN** the system SHALL keep the attempt uncertain, apply backoff, and MUST NOT infer failure or success

#### Scenario: IPN arrives during QueryDR

- **WHEN** IPN and QueryDR race for the same attempt
- **THEN** row-level or conditional state guards SHALL allow at most one state transition and one set of business side effects

### Requirement: Late success never silently reopens a released Purchase

If a valid VNPAY success arrives after the Purchase payment window has released inventory or voucher holds, the system MUST NOT restore or fulfill the Purchase automatically and SHALL place the payment in the existing refund/manual-resolution safety state.

#### Scenario: Success after resource release

- **WHEN** VNPAY authoritatively confirms payment after held resources have been released
- **THEN** the system SHALL block seller fulfillment, record the late-success evidence, notify operational monitoring, and expose a safe buyer support state

### Requirement: VNPAY configuration and observability protect secrets

VNPAY credentials SHALL come only from environment variables or a secret store, SHALL be validated only when VNPAY creation is enabled, and MUST never appear in source control, API responses, logs, traces, metrics, snapshots, or test output.

#### Scenario: Enabled configuration is incomplete

- **WHEN** VNPAY is enabled without terminal code, hash secret, payment URL, Return URL, IPN URL, or transaction API URL
- **THEN** application startup SHALL fail fast with a message naming only the missing setting

#### Scenario: Provider request is logged

- **WHEN** URL creation, IPN, or QueryDR emits observability data
- **THEN** logs and metrics SHALL contain only safe internal correlation, operation, result class, latency, and redacted metadata

#### Scenario: VNPAY is disabled with no credentials

- **WHEN** local development or CI starts with VNPAY disabled and credentials absent
- **THEN** COD and MoMo SHALL start and operate normally

### Requirement: Sandbox verification is opt-in and repeatable

The project SHALL document an opt-in VNPAY sandbox preflight and UAT flow covering hosted QR/card selection, success, buyer cancel, failure, duplicate IPN, Return-before-IPN, missing IPN recovery, new checkout after cancellation, and authorization. Default CI MUST use deterministic fixtures and a fake provider without contacting VNPAY.

#### Scenario: Sandbox happy path

- **WHEN** a tester provides valid sandbox configuration and a public HTTPS IPN URL and completes payment on the hosted VNPAY page
- **THEN** IPN SHALL settle the Purchase, transition its ShopOrders from `PENDING_PAYMENT` to `PENDING_CONFIRMATION`, the callback SHALL navigate to the one-shop buyer order or buyer order list as appropriate, and sellers SHALL become eligible to process their own ShopOrders

#### Scenario: CI without credentials

- **WHEN** the automated test suite runs without VNPAY credentials
- **THEN** VNPAY network tests SHALL be skipped or replaced by fixtures and the suite SHALL not print or require secrets

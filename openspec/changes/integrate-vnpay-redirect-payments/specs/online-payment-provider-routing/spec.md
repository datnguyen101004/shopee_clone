## Purpose

Defines provider-neutral online checkout, ownership, payment-gated order transitions, fulfillment gating, and one-shop buyer orders without coupling the marketplace domain to one payment gateway.

## ADDED Requirements

### Requirement: Online checkout selects an enabled provider

The system SHALL accept an explicit supported provider for online checkout, SHALL reject disabled or unconfigured providers before creating a Purchase, and SHALL preserve the existing COD and MoMo request behavior.

#### Scenario: Buyer selects VNPAY

- **WHEN** an authenticated buyer confirms a valid checkout with provider VNPAY and VNPAY is enabled
- **THEN** the system SHALL create one online-payment Purchase and return a VNPAY payment attempt with a safe redirect action

#### Scenario: Selected provider is disabled

- **WHEN** a buyer selects an online provider that is disabled or incomplete
- **THEN** the system SHALL return safe Problem Details and SHALL NOT create a Purchase, reserve inventory, hold vouchers, or call an external provider

#### Scenario: COD remains compatible

- **WHEN** a buyer confirms the same valid cart with COD
- **THEN** the existing COD contract and fulfillment behavior SHALL remain unchanged

### Requirement: One payment settles the complete multi-shop Purchase

The system SHALL calculate the payable amount from authoritative server data and SHALL associate each online payment attempt with the complete Purchase rather than an individual ShopOrder.

#### Scenario: Multi-shop VNPAY checkout

- **WHEN** a cart contains items from multiple shops and the buyer selects VNPAY
- **THEN** the payment amount SHALL equal Purchase.payableTotalMinor and one successful payment SHALL settle every ShopOrder in that Purchase atomically

#### Scenario: Client submits a conflicting amount

- **WHEN** a client supplies or tampers with an amount that differs from server pricing
- **THEN** the system SHALL ignore the client amount and SHALL use only the server-calculated Purchase amount

### Requirement: Each buyer-visible order belongs to one shop

The buyer order-history interface SHALL represent each owned ShopOrder exactly once and SHALL use `orderReference` as its canonical order identifier. Each order SHALL contain exactly one shop and all product lines for that shop. The parent `purchaseReference` may be returned as payment correlation metadata, while seller and fulfillment operations continue to address the same ShopOrder independently.

#### Scenario: Buyer lists a multi-shop checkout

- **WHEN** one checkout creates a Purchase containing ShopOrders for multiple shops
- **THEN** the buyer order list SHALL return one buyer order card per ShopOrder, each card SHALL contain exactly one shop, and each shop's card SHALL include all of its product lines

#### Scenario: Buyer opens a shop order detail

- **WHEN** the owner opens `/account/orders/:orderReference`
- **THEN** the detail SHALL show exactly one shop order with all of its products, status, delivery data, actions, timeline, and parent Purchase payment metadata

#### Scenario: Buyer list is paginated by shop order

- **WHEN** cursor pagination is applied to buyer order history
- **THEN** pagination SHALL operate on ShopOrder `(createdAt, id)` positions and MUST NOT return the same ShopOrder twice in one page

#### Scenario: Existing ShopOrder deep link is opened

- **WHEN** the buyer opens an existing order-detail link containing an owned ShopOrder reference
- **THEN** the system SHALL keep the ShopOrder reference and serve `/account/orders/:orderReference` without exposing other shops

#### Scenario: Seller opens a shop order

- **WHEN** a seller views or processes an order belonging to their shop
- **THEN** seller APIs and workflows SHALL continue to use that ShopOrder reference and SHALL NOT expose other shops in the Purchase

### Requirement: A VNPAY order aggregate has one checkout payment attempt

The system SHALL create one VNPAY PaymentAttempt with the new Purchase and its `PENDING_PAYMENT` ShopOrders. A terminal `CANCELLED`, `FAILED`, or `EXPIRED` result SHALL make that Purchase and its ShopOrders non-retryable; purchasing again MUST start a new checkout and create a new Purchase.

#### Scenario: Active checkout is replayed

- **WHEN** the buyer repeats the same VNPAY checkout request with the same idempotency key and canonical payload while its attempt is active
- **THEN** the system SHALL return the original Purchase, ShopOrders, attempt, and redirect action without creating duplicates

#### Scenario: Buyer tries to repay a cancelled order

- **WHEN** a VNPAY Purchase or any of its ShopOrders is terminally `CANCELLED`, `FAILED`, or `EXPIRED`
- **THEN** the system MUST reject payment retry for that Purchase and SHALL require a new checkout to create a new order aggregate

### Requirement: Checkout requests are idempotent

The system SHALL bind each online checkout mutation to an authenticated buyer, an idempotency key, and a canonical request digest.

#### Scenario: Exact mutation replay

- **WHEN** the same buyer repeats a request with the same idempotency key and canonical payload
- **THEN** the system SHALL return the original Purchase and payment attempt without duplicating holds, ShopOrders, attempts, or provider references

#### Scenario: Idempotency key reused with different input

- **WHEN** an idempotency key is reused with a different provider, cart version, or request body
- **THEN** the system SHALL return a conflict and SHALL NOT mutate payment or order state

### Requirement: Payment method and authoritative result drive ShopOrder status

The system SHALL use `PENDING_PAYMENT` as the initial ShopOrder status only for VNPAY checkout. COD ShopOrders SHALL continue to start at `PENDING_CONFIRMATION`. A verified VNPAY result SHALL transition all ShopOrders in the Purchase atomically and seller reads/actions MUST exclude `PENDING_PAYMENT` orders.

#### Scenario: COD order is created

- **WHEN** a buyer completes checkout using COD
- **THEN** every created ShopOrder SHALL have status `PENDING_CONFIRMATION` and SHALL enter the existing seller confirmation workflow

#### Scenario: VNPAY order is created

- **WHEN** a buyer completes checkout using VNPAY and receives a hosted-payment redirect
- **THEN** every created ShopOrder SHALL have status `PENDING_PAYMENT` and sellers SHALL NOT be able to view or process it as awaiting confirmation

#### Scenario: VNPAY payment remains uncertain

- **WHEN** the authoritative payment state is `PENDING`, `UNKNOWN`, or `PENDING_RECONCILIATION`
- **THEN** every associated ShopOrder SHALL remain `PENDING_PAYMENT`

#### Scenario: VNPAY payment succeeds

- **WHEN** a verified IPN or QueryDR observation changes the Purchase payment status to `PAID`
- **THEN** every associated ShopOrder SHALL transition atomically from `PENDING_PAYMENT` to `PENDING_CONFIRMATION`, append a matching timeline event, and become eligible for seller confirmation

#### Scenario: VNPAY payment is cancelled or failed

- **WHEN** a verified IPN or QueryDR observation changes the payment status to `CANCELLED`, `FAILED`, or `EXPIRED`
- **THEN** every associated ShopOrder SHALL transition atomically from `PENDING_PAYMENT` to `CANCELLED`, append a matching timeline event, and become non-retryable

#### Scenario: Buyer filters shop orders waiting for online payment

- **WHEN** a buyer opens the “Chờ thanh toán” order-history tab
- **THEN** the list SHALL include each owned ShopOrder whose status is `PENDING_PAYMENT` exactly once and SHALL exclude COD ShopOrders

#### Scenario: Buyer filters cancelled shop orders

- **WHEN** a buyer opens the “Đã hủy” order-history tab
- **THEN** the list SHALL include each owned ShopOrder whose status is `CANCELLED` exactly once, including cancellation originating from checkout, payment, fulfillment, or expiry

#### Scenario: Buyer opens a shop order after a terminal payment result

- **WHEN** a buyer opens an owned ShopOrder whose parent VNPAY payment was `CANCELLED`, `FAILED`, or `EXPIRED`
- **THEN** the detail SHALL retain the granular payment result and the ShopOrder SHALL expose status and a timeline ending in `CANCELLED`

### Requirement: Buyer shipping navigation groups two fulfillment states

The buyer order-history interface SHALL expose one tab labeled “Vận chuyển” with canonical filter value `SHIPPING`. That buyer filter SHALL include each owned ShopOrder whose fulfillment status is either `AWAITING_PICKUP` or `SHIPPING`. The system MUST NOT merge, rename, or remove those underlying fulfillment states.

#### Scenario: Awaiting-pickup order is listed under shipping

- **WHEN** a buyer opens the “Vận chuyển” tab and owns a Purchase with a ShopOrder in `AWAITING_PICKUP`
- **THEN** the ShopOrder SHALL be included once and SHALL retain the detail label “Chờ lấy hàng”

#### Scenario: In-transit order is listed under shipping

- **WHEN** a buyer opens the “Vận chuyển” tab and owns a Purchase with a ShopOrder in `SHIPPING`
- **THEN** the ShopOrder SHALL be included once and SHALL retain the detail label “Đang giao”

#### Scenario: Unrelated fulfillment state is excluded

- **WHEN** a buyer opens the “Vận chuyển” tab
- **THEN** a ShopOrder SHALL NOT be included when its status is `PENDING_PAYMENT`, `PENDING_CONFIRMATION`, `DELIVERED`, `CANCELLED`, `RETURN_REQUESTED`, `RETURNED`, or `REFUNDED`

#### Scenario: Shop orders in one Purchase have different statuses

- **WHEN** different ShopOrders in one Purchase match different buyer tabs
- **THEN** each matching ShopOrder SHALL appear in its corresponding tab and SHALL retain its actual status label

#### Scenario: Legacy awaiting-pickup link is opened

- **WHEN** a buyer opens an existing order-history URL with `filter=AWAITING_PICKUP`
- **THEN** the interface SHALL normalize it to the canonical `SHIPPING` filter and SHALL NOT render a separate “Chờ lấy hàng” tab

#### Scenario: Seller uses fulfillment workflow

- **WHEN** a seller views or transitions an order in `AWAITING_PICKUP` or `SHIPPING`
- **THEN** the seller interface and transition rules SHALL continue to distinguish the two statuses

### Requirement: Terminal VNPAY results cancel the order aggregate immediately

A verified `FAILED`, `CANCELLED`, or `EXPIRED` VNPAY result SHALL atomically make the Purchase non-retryable, cancel every `PENDING_PAYMENT` ShopOrder, release inventory and voucher holds, and restore eligible cart items exactly once.

#### Scenario: Buyer cancels on the provider page

- **WHEN** VNPAY authoritatively reports that the payment was cancelled
- **THEN** the attempt and Purchase payment status SHALL become `CANCELLED`, every ShopOrder SHALL become `CANCELLED`, held resources SHALL be released, and payment retry for that Purchase SHALL be rejected

#### Scenario: Purchase payment window expires

- **WHEN** the Purchase payment deadline passes while its ShopOrders are `PENDING_PAYMENT`
- **THEN** the system SHALL apply the same idempotent cancellation and resource-release transaction as a verified terminal payment failure

### Requirement: Payment status APIs are owner-scoped

Authenticated payment reads MUST reveal a payment only to the Purchase buyer and MUST return the same not-found response for an unknown reference and another buyer's reference.

#### Scenario: Owner reads payment

- **WHEN** the Purchase buyer requests a valid payment reference
- **THEN** the response SHALL include normalized provider, attempt status, Purchase reference, expiry, associated child order states, and a safe navigation action targeting `/account/orders/:orderReference` for one shop or `/account/orders` for multiple shops

#### Scenario: Another buyer reads payment

- **WHEN** an authenticated user requests a payment owned by another buyer
- **THEN** the system SHALL return the same not-found response used for an unknown payment and SHALL NOT reveal ownership or provider metadata

### Requirement: Buyer callback waits for the authoritative payment result

The VNPAY payment callback SHALL perform an initial owner-scoped status read, SHALL continue
with bounded status requests while the payment remains non-terminal, and SHALL stop as soon as
the backend reflects the terminal result committed from IPN (or the payment window is reached).
The callback MUST NOT derive payment state from Return URL query fields.

#### Scenario: IPN commits while callback is being polled

- **WHEN** a verified IPN changes the payment state while the owner has the callback screen open
- **THEN** the next owner-scoped status read SHALL observe the backend result without trusting Return URL result fields
- **AND** the callback SHALL redirect to `/account/orders/:orderReference` for a single-shop Purchase or `/account/orders` for a multi-shop Purchase

#### Scenario: Callback reaches a terminal failure

- **WHEN** the backend status becomes FAILED, CANCELLED, EXPIRED, REFUND_PENDING, REFUNDED, or PARTIALLY_REFUNDED
- **THEN** the callback SHALL redirect to the one-shop buyer order or buyer order list where each associated ShopOrder is `CANCELLED` for terminal unpaid outcomes and the granular payment result is displayed

#### Scenario: Callback polling is bounded

- **WHEN** no terminal result is available before the payment window or callback polling limit
- **THEN** polling SHALL stop, the buyer SHALL see a waiting message, and an explicit “Kiểm tra lại” action SHALL remain available

### Requirement: Provider expansion is backward compatible

Adding VNPAY SHALL NOT change existing MoMo signatures, status precedence, reconciliation, refund safeguards, or COD order behavior.

#### Scenario: Existing MoMo payment

- **WHEN** an existing MoMo checkout, IPN, status read, reconciliation, or refund test runs
- **THEN** it SHALL retain its current behavior and SHALL route only to the MoMo adapter

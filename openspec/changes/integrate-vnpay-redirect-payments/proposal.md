## Why

Shopee Clone currently supports COD and a MoMo-specific online checkout, but it has no VNPAY redirect flow that can confirm payments independently of the buyer's browser. A second online provider is needed for the local sandbox demo while keeping server-authoritative pricing, inventory and voucher guarantees, seller fulfillment gates, and the buyer-facing rule that each order belongs to one shop and may contain multiple products.

## What Changes

- Add VNPAY sandbox as a third checkout method beside COD and MoMo, using VNPAY's hosted payment page for QR and bank-card selection instead of collecting bank credentials in Shopee Clone.
- Generalize the online-payment boundary so the checkout request selects an enabled provider and provider-specific adapters do not leak into shared Purchase, ShopOrder, inventory, voucher, or order-history rules.
- Generate a signed VNPAY payment URL for one server-priced multi-shop Purchase and use a unique transaction reference for every payment attempt.
- Add a public VNPAY GET IPN endpoint that verifies HMAC-SHA512, terminal code, transaction reference, amount, currency semantics, and current state before applying an idempotent payment observation.
- Keep the frontend Return URL at `/payment/callback` for navigation only; browser query parameters never mark a payment as paid.
- Add `PENDING_PAYMENT` as an explicit ShopOrder status for VNPAY orders. COD orders continue to start at `PENDING_CONFIRMATION`, while VNPAY orders start at `PENDING_PAYMENT` and remain unavailable to sellers.
- Make the verified IPN/QueryDR result drive the VNPAY ShopOrder transition atomically: `PAID` moves every ShopOrder to `PENDING_CONFIRMATION`; `CANCELLED`, `FAILED`, or payment-window expiry moves every ShopOrder to `CANCELLED`.
- Treat a cancelled or failed VNPAY order as terminal: release its inventory and voucher holds exactly once, restore eligible cart lines, and require a new checkout to purchase again instead of retrying the same Purchase.
- Treat each buyer-visible order as exactly one ShopOrder (one shop with one or more products). A checkout containing several shops SHALL produce one buyer order card and detail route per shop order; the internal Purchase remains the payment/resource aggregate only.
- Use the ShopOrder `orderReference` as the canonical buyer order identifier. `purchaseReference` remains an internal payment/checkout correlation and is exposed only as supporting metadata.
- Back buyer order-history tabs by individual owned ShopOrders. “Chờ thanh toán” matches `PENDING_PAYMENT`, “Đã hủy” matches `CANCELLED`, and each shop order appears at most once in a result page.
- Keep each buyer order detail scoped to one shop and show all of that shop's products, status, delivery data, actions, and timeline, including `PENDING_PAYMENT → PENDING_CONFIRMATION` and `PENDING_PAYMENT → CANCELLED`.
- Consolidate the buyer order-history tabs “Chờ lấy hàng” and “Đang giao” into one “Vận chuyển” tab. A ShopOrder matches when its status is `AWAITING_PICKUP` or `SHIPPING`, while seller workflows and database fulfillment states retain their granular status.
- Keep the callback/payment screen synchronized with the IPN-backed payment status by polling the
  authenticated owner-scoped status API with bounded backoff, then always redirecting to
  `/account/orders/:orderReference` when a terminal result has one shop order, or the buyer order list when it covers multiple shops.
- Reuse backend QueryDR reconciliation only as recovery for missing or uncertain IPNs; automatic settlement accounting, buyer-initiated VNPAY refunds, tokenization, recurring payments, direct merchant-hosted card entry, and production go-live remain out of scope.
- Preserve existing COD and MoMo behavior and keep VNPAY disabled unless complete sandbox configuration is present.

## Capabilities

### New Capabilities

- `online-payment-provider-routing`: Provider-neutral online checkout selection, payment-method-specific initial ShopOrder status, IPN-driven order transitions, owner-scoped status APIs, seller gating, bounded callback status polling, and ShopOrder-scoped buyer order history.
- `vnpay-redirect-payment`: VNPAY sandbox URL signing, hosted redirect, Return URL navigation, authenticated IPN processing, result mapping, QueryDR recovery, safe configuration, and sandbox verification.

### Modified Capabilities

None. Payment capabilities have not yet been promoted into `openspec/specs`; this change introduces complete delta specifications without changing an existing main-spec requirement.

## Impact

- NestJS API: checkout/payment orchestration, provider registration, VNPAY configuration and protocol adapter, public IPN handling, owner-scoped status endpoints, terminal retry rejection, reconciliation, seller gating, ShopOrder-scoped buyer order queries, and Problem Details/OpenAPI contracts.
- PostgreSQL/Prisma: add VNPAY enum values, add `PENDING_PAYMENT` to ShopOrder status, retain provider-safe attempt correlation, and migrate existing VNPAY orders to the canonical order state derived from their authoritative payment result.
- Next.js frontend: checkout selector, redirect handoff, `/payment/callback`, one buyer order card/detail per shop order with all products in that shop, explicit “Chờ thanh toán” and “Đã hủy” filters, one buyer “Vận chuyển” tab for pre-pickup and in-transit orders, and a new-checkout action after terminal payment failure.
- Shared contracts: extend payment provider/method/next-action unions, add canonical `PENDING_PAYMENT` ShopOrder status, expose one-shop buyer order summaries/details, and define filters from individual ShopOrder status while retaining COD and MoMo compatibility.
- Operations and testing: environment-only sandbox credentials, public HTTPS IPN tunnel, redacted observability, protocol fixtures, unit/contract/PostgreSQL/Supertest/Playwright coverage, and opt-in VNPAY sandbox UAT.

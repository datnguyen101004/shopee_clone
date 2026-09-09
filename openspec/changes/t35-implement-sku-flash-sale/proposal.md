## Why

The existing Flash Sale campaign can discount products but does not provide SKU quotas or a durable one-purchase-per-product rule under concurrent checkout. T35 needs a complete COD purchase lifecycle and seller-controlled sold-out behavior so displayed offers, inventory, and cancellation agree.

Source: [T35, GitHub issue #36](https://github.com/datnguyen101004/shopee_clone/issues/36), refined by the user's decisions on 2026-09-07. Those decisions supersede the original issue where explicitly recorded below.

## What Changes

### BE — Backend and shared contracts

- Add a static waiting-room UI and a separate Admission/Queue control plane using SQS Standard and Lambda in LocalStack, with Redis ticket/idempotency and token-pool state. Grant fresh opaque random tokens only when the pool has capacity: 20 active leases, each valid for 5 minutes. The business backend validates Redis-backed tokens for Flash Sale carts and limits order confirmation to 5 concurrent requests. Keep traffic tokens distinct from internal quota-attempt tokens.

- Extend the existing campaign domain with SKU-level fixed sale prices, allocated/remaining quotas, versioned seller commands, purchase claims, and order-line consumption/reversal records.
- Permit quota edits before campaign start, freeze quota while active and positive, and permit replenishment or permanent SKU participation termination only at zero remaining quota. Replenishment preserves the campaign, price, and buyer claims.
- Enforce available physical stock >= remaining committed quota; protect that backing across ordinary checkout, inventory edits, and already-pending orders.
- Consume quota and stock only when COD order creation succeeds. Enforce one unit of one participating SKU per buyer/product/campaign across requests and sibling variants. Nonparticipating SKUs retain ordinary purchasing.
- Restore stock and quota on eligible cancellation while the original participation is ongoing, including sold-out participation; after termination/expiry restore ordinary stock only. Never restore a successful purchaser's claim after cancellation.
- Serve hot public reads through bounded per-instance in-memory L1 cache, Redis L2 cache, then PostgreSQL on controlled misses. Prewarm campaign data, coalesce cache fills, and invalidate versioned snapshots across instances.
- In peak checkout, perform rate/concurrency limiting and Redis atomic admission before entering the PostgreSQL transaction. L1 state is advisory and never allocates quota; PostgreSQL remains the final transactional guard for quota, stock, buyer limits, vouchers, and orders.
- Provide a lightweight batched status endpoint for all three traffic phases, separate from full catalog hydration, with server time, sale boundaries, state/version, and no quota counts.
- Continue voucher eligibility on post-Flash-Sale merchandise prices.

### FE — Seller and buyer experiences

- Add waiting/admitted/expired/closed checkout states for carts containing Flash Sale lines, with bounded queue polling, refresh-safe tickets and preserved cart/idempotency. An empty token pool keeps buyers waiting. Queue admission does not reserve a SKU or automatically place an order. Ordinary-only carts bypass this gate.

- Extend Seller Campaigns with SKU selection, quota editing, sold-out replenishment, and per-SKU termination using the existing blue/white workspace.
- Use quota-derived availability for participating SKUs. At zero quota, block buying and remove the SKU Flash Sale label without silently enabling ordinary-price purchases. Restore sale presentation when replenished or reversed to positive quota.
- Restore ordinary price/availability after seller termination or campaign end. Product-level badges require at least one eligible active SKU.
- Restrict a checkout containing a Flash Sale line to COD, explain purchase limits, and refresh changed quotes before confirmation.
- Do not display remaining quantities or sold-progress indicators to buyers; retain quota visibility for sellers.
- Drive local countdowns and controlled foreground polling with jitter; stop polling ended campaigns and respect overload retry guidance. Sold-out replenishment/cancellation becomes visible within a measured normal-operation freshness budget.

### Scope alignment

- This is a local demo/POC: one business API instance, Redis, PostgreSQL and LocalStack SQS Standard/Lambda. Production CDN deployment, private-origin/gateway topology, HA/Cluster, multi-instance acceptance, signing-key rotation and production throughput commitments are out of scope. Local correctness, bounded capacity and idempotency remain required.
- The user-approved admission revision supersedes the former FIFO/JWT/120-second/all-cart gateway design. SQS Standard does not guarantee FIFO and duplicate delivery must not create duplicate tickets, leases or orders. Join and order commands use separate idempotency keys.
- Release a traffic lease exactly once on successful order creation, its original 300-second deadline, an explicit buyer leave, or a best-effort last-tab/page-leave signal after a 5–10-second grace period. Refresh or another live tab cancels the pending early release without extending the original lease deadline. Never release merely because the page is hidden, and defer an admitted-leave release while order confirmation is executing. Release a confirmation request slot when its processing finishes, independently of lease expiry.

- Redis outage recovery, cache-loss rebuilding/reconciliation, and production Redis hosting are deferred by explicit user instruction; the original T35 recovery acceptance criteria are not claimed complete by this change.
- Multi-region inventory, advertising placement, online payments for sale lines, pipeline/training work, and post-delivery return/refund policy changes are excluded.
- **BREAKING** for legacy Flash Sale inputs: product-percentage-only registrations cannot become quota-backed live offers automatically. A coordinated local migration/registration gate is required; other campaign types retain their existing contracts.

## Capabilities

### New Capabilities

- `flash-sale-sku-participation`: SKU registration, protected allocation, lifecycle, quota editing/replenishment, seller ownership, and termination.
- `flash-sale-cod-allocation`: Pre-database atomic admission, bounded checkout pressure, persistent product-level purchase limits, cancellation reversal, and Redis/DB command safety.
- `flash-sale-storefront`: Three-phase traffic handling, tiered hot reads, quota-derived availability, contextual prices/badges, COD-only checkout, vouchers, and seller/buyer interface behavior.

### Modified Capabilities

None in the current main-spec inventory. Existing campaign/pricing/inventory/checkout implementation and active change artifacts are integration dependencies; the new capability specs describe the Flash Sale extension without rewriting unrelated main specs.

## Impact

- BE: `apps/api/src/marketplace-campaigns`, `pricing`, `inventory`, `checkout`, existing order-cancellation paths, `homepage`, `catalog`, and search hydration; Prisma schema/migrations and local Redis configuration.
- Admission: LocalStack SQS Standard/Lambda control plane, Redis pool/ticket/token state, static waiting-room UI and backend validation. Gate only server-classified Flash Sale carts (including mixed carts); preview validates a token but does not consume a confirmation slot. Ordinary-only checkout is unchanged. Authentication, cart classification and existing-result lookup remain bounded backend operations.
- Contracts: `packages/contracts` and OpenAPI for SKU commands, state, quote metadata, COD readiness, and stable errors.
- FE: Seller Campaigns, existing admin campaign type/placement configuration, campaign detail, product cards/detail, cart, checkout, and order confirmation. CMS/banner ownership remains with the completed CMS separation change.
- Planning ownership: one shared change, exactly two task workstreams (BE and FE). BE owns shared contracts and integration infrastructure; FE can start from contract fixtures, with end-to-end integration after BE APIs are ready.
- UX source: [Vietnamese UI/UX specification](../../../docs/ui-ux/t35-implement-sku-flash-sale.md). Architecture and API test inventory are in `design.md` and `design.vi.md`; implementation work is in `tasks.md`.

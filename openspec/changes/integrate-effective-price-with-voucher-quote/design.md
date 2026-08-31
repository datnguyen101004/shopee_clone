## Context

See `proposal.md` for motivation and `specs/buyer-best-voucher-price-preview/spec.md` for observable behavior. The repository already has server-authoritative scheduled product pricing, a strict `pricing-v2` quote, three voucher slots, deterministic voucher allocation, address-aware shipping calculators, and atomic checkout consumption. Public product assemblers currently have no optional buyer context and render the same effective price to every viewer; voucher discovery and calculation occur only in cart/checkout.

The change crosses contracts, optional authentication, catalogue/homepage/shop/engagement/detail assemblers, pricing/voucher services, shipping, caching, and frontend selectors. Product-card previews are necessarily estimates because they use one unit in isolation, while an actual cart can change minimum-spend eligibility, percentage bases, allocation, shipping weight, and voucher capacity.

## Goals / Non-Goals

**Goals:**

- Reuse existing scheduled-price, voucher-eligibility, integer-allocation, and shipping rules instead of creating storefront-only arithmetic.
- Produce one deterministic, explainable quantity-one buyer price preview from PostgreSQL facts.
- Keep guest behavior and existing top-level `priceMinor` compatibility intact.
- Make collection enrichment bounded, private, failure-tolerant, and independent of Elasticsearch.
- Reconcile automatic preview selection with authoritative cart and checkout recalculation.

**Non-Goals:**

- Reserving vouchers, guaranteeing a preview until checkout, or changing usage-limit semantics.
- Treating shipping savings as a reduction of merchandise unit price.
- Personalizing seller/admin screens or rewriting immutable purchase/order/return snapshots.
- Indexing buyer profiles, voucher definitions, usage counters, or personalized prices in Elasticsearch.
- Adding coins, cashback, membership tiers, coupon claiming, or a voucher wallet.

## Decisions

### 1. Add a nested personalized preview without changing canonical `priceMinor`

Covered contracts gain an optional structure conceptually shaped as:

```ts
interface BuyerBestPricePreview {
  version: 'buyer-best-price-v1';
  quantity: 1;
  currency: 'VND';
  evaluatedAt: string;
  effectivePriceMinor: number;
  shopVoucher: AppliedPreviewVoucher | null;
  platformVoucher: AppliedPreviewVoucher | null;
  shopVoucherDiscountMinor: number;
  platformVoucherDiscountMinor: number;
  merchandiseDiscountMinor: number;
  merchandisePayableMinor: number;
  shipping: null | {
    service: 'STANDARD';
    shippingFeeMinor: number;
    voucher: AppliedPreviewVoucher | null;
    shippingVoucherDiscountMinor: number;
    shippingPayableMinor: number;
    estimatedPayableMinor: number;
  };
}
```

Top-level `priceMinor` remains scheduled effective price, preserving the invariant introduced by `display-effective-product-price`. A shared selector returns `buyerBestPrice?.merchandisePayableMinor ?? effectiveProductPriceMinor(product)`. Shipping renders as a separate estimate.

Overwriting `priceMinor` per viewer was rejected because it would break the scheduled-price equality invariant and make shared caches, old clients, and audit language ambiguous. Adding an unversioned flat `finalPriceMinor` was rejected because “final” is only true for an actual cart/checkout.

### 2. Define product preview context as one unit in isolation

Every product preview uses the selected representative variant on a card or the selected variant on detail, quantity one, its current scheduled effective price, and no other cart lines. Minimum spend is evaluated against that isolated merchandise subtotal. The breakdown explicitly carries `quantity: 1` and preview language.

Using the buyer's current cart to price unrelated cards was rejected because the same product would change price based on incidental cart contents and allocations. Pretending a quantity-one preview is a guaranteed checkout price was rejected because larger quantities can unlock or cap vouchers.

### 3. Introduce a batched backend preview orchestrator around existing pure rules

A pricing-owned orchestration service accepts buyer ID, optional default address, one captured instant, and bounded product/variant snapshots already enriched with scheduled prices. It performs batched PostgreSQL reads for:

- enabled voucher definitions whose issuer/shop/type can affect the product set;
- voucher product scopes;
- global and buyer usage facts;
- the buyer's usable default address;
- shop origin and shipping inputs not already present in snapshots.

It maps each product into the same immutable pricing facts used by the voucher calculator. Calculation remains framework-free. Collection assemblers call it once per response after scheduled enrichment and before filters, facets, sorts, and pagination where the displayed personalized price affects those operations.

Calling the current cart quote endpoint once per card was rejected because it requires cart state and creates N+1 HTTP/database work. Copying voucher formulas into catalogue services was rejected because calculation order and allocation would drift.

### 4. Enumerate bounded legal combinations and choose by a stable comparator

For a single product, the candidate space is the Cartesian product of:

- no shop voucher or one eligible voucher belonging to the product shop;
- no platform merchandise voucher or one eligible platform voucher;
- when shipping facts exist, no shipping voucher or one eligible shipping voucher.

The loader first removes candidates that fail issuer, type, activity, scope, usage, and minimum-spend facts. Configuration enforces a maximum candidate count per slot; exceeding it retains candidates ordered by potential capped benefit then canonical ID. Every remaining combination runs through existing shop → platform → shipping rules.

The winner comparator is: lowest merchandise payable, then lowest combined estimated payable when shipping exists, then highest total saving, then lexicographically smallest canonical voucher code tuple. The all-null combination is always present, so no combination may raise the price.

Greedy “largest percentage” selection was rejected because fixed caps, residual bases, and minimum spend can make it non-optimal. Unbounded enumeration was rejected because platform promotion volume can turn collection pages into CPU amplification.

### 5. Resolve optional buyer identity at public endpoints without requiring login

Public controllers accept a sanitized optional buyer principal. Missing, expired, or invalid optional credentials are treated as guest for product discovery; they do not turn public browsing into a `401`. When a valid buyer exists, assemblers request personalization and set private/no-store response policy. Guest responses retain their existing cache behavior.

Personalized previews never include usage counts, hidden voucher definitions, address details, or raw eligibility failures. Only applied voucher code/name/slot and exact benefit are public to that buyer.

Making all catalogue endpoints authentication-required was rejected because guest discovery is a core surface. Sharing personalized responses in a public cache was rejected as both incorrect and a privacy leak.

### 6. Keep shipping optional, address-aware, and separate

The preview uses the buyer's valid default address, the product shop's authoritative origin, selected variant weight, quantity one, and `STANDARD` service. The existing shipping calculator produces the fee; the voucher calculator chooses a shipping voucher and caps the benefit. Without every required fact, `shipping` is null.

Subtracting free shipping from `merchandisePayableMinor` was rejected because it corrupts the product-price meaning and can make sorting products across locations misleading. For this reason, collection price filters/facets/sorts use merchandise payable only; estimated landed payable is supplementary.

### 7. Cover live product-price projections through shared enrichment and selectors

The backend enriches canonical card/detail projections used by catalogue/search, homepage, public shop, related products, favorites, and recently viewed. Cart and checkout use their existing line-level payable values, enhanced with automatic best selection when explicit selections are absent. Frontend components use one shared selector and one small breakdown presenter while retaining surface layouts.

Historical order/return/success screens continue rendering committed `payableMerchandiseMinor`. Seller and admin surfaces continue rendering stored base prices. This prevents current promotions from rewriting history or editor meaning.

### 8. Auto-best is the default, while explicit cart selections remain an override

Product previews have no explicit selection and always compute best available. For cart quotes, omitted voucher slots are auto-filled with the best available combination. A buyer's explicit code constrains that slot and is evaluated with existing rejection behavior; remaining empty slots may still be optimized. Checkout receives the resulting canonical set, recalculates inside its transaction, and consumes only still-eligible vouchers.

Removing manual voucher entry was rejected because buyers may possess codes outside the initially discovered display set and existing compatibility depends on explicit selections. Ignoring explicit codes in favor of an optimizer was rejected because it makes user actions unpredictable.

### 9. Fail optional preview enrichment closed to effective pricing

If optional buyer identity, address, voucher discovery, or optimization cannot produce a contract-valid preview, live product discovery still returns the scheduled effective price without voucher claims. Cart/checkout errors retain their stricter existing behavior because they calculate actual payable and consumption.

Failing an entire search/homepage response for an optional preview was rejected as poor availability. Reusing stale personalized data was rejected because voucher limits and eligibility can change.

### 10. Measure query count, calculation bounds, and personalized latency separately

Tests instrument PostgreSQL calls and assert no query per card. Add metrics for candidate counts, combinations evaluated, preview fallback reason, collection enrichment duration, and authenticated p95 latency. Initial acceptance targets are no more than one batched read per voucher fact family, a configured combination ceiling, and no more than 75 ms additional p95 backend time for a 48-card local dataset response.

No voucher or buyer fact is sent to Elasticsearch. If Elasticsearch later supplies candidate IDs, PostgreSQL personalization runs after retrieval; correctness of global personalized price sort requires a separate search-design decision and is not silently approximated.

### 11. Enforce self-purchase prevention at the backend and explain it in the buyer UI

Cart mutation validates the selected variant's shop owner against the authenticated user before writing. Pricing and checkout repeat the ownership check so stale carts and direct API calls cannot bypass the rule. The frontend maps this typed rejection to a warning dialog for Add to cart and Buy now; dismissing the dialog performs no follow-up mutation or navigation.

Relying only on a hidden or disabled button was rejected because stale pages and direct API calls could still create invalid cart or checkout state.

## Risks / Trade-offs

- **[Preview differs from cart due to quantity or other lines]** → Label quantity-one results as estimates, expose the applied breakdown, and recalculate actual cart context.
- **[A platform voucher can make collection pricing expensive]** → Batch reads, cap candidates/combinations, instrument p95, and preserve effective-price fallback.
- **[Personalized sorting conflicts with future Elasticsearch pagination]** → Keep this PostgreSQL implementation exact and require an explicit later design for search-engine candidate retrieval.
- **[Voucher availability changes immediately after preview]** → Never reserve during browsing and revalidate transactionally at checkout.
- **[Optional authentication can leak personalized data through caching]** → Use private/no-store personalized responses, separate guest handling, and cache-isolation tests.
- **[Default-address shipping estimate differs from chosen checkout service]** → Identify `STANDARD` and the destination context as an estimate and keep it out of merchandise price sorting.
- **[Manual cart override is not globally optimal]** → Mark explicit selections as buyer choices while continuing to optimize unfilled slots and show server-confirmed totals.

## Migration Plan

1. Add optional contract fields, validators, selectors, and compatibility tests before any producer emits personalized data.
2. Add the batched preview loader/optimizer behind a default-off local feature flag and verify calculator parity without a schema migration.
3. Integrate optional buyer context and backend enrichment one surface family at a time: detail/related, catalogue/shop, homepage, engagement, then cart/checkout auto-fill.
4. Enable locally after PostgreSQL query-count, privacy, fallback, latency, component, and cross-surface integration tests pass.
5. Roll back by disabling preview production; clients fall back to top-level effective price and existing explicit cart voucher behavior remains valid.

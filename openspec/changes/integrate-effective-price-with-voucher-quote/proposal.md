## Why

Guests currently see the correct scheduled effective product price, while authenticated buyers only discover their voucher-adjusted payable amount after entering the cart. The storefront should preview the best server-authoritative combination of shop, platform, and eligible shipping vouchers wherever a live buyer product price is shown, without presenting a shipping discount when the buyer has no usable address.

## What Changes

- Add a server-owned best-voucher preview for one unit of a sellable product, evaluated after scheduled product pricing.
- Automatically discover and deterministically choose the eligible shop/platform voucher combination that minimizes merchandise payable for the authenticated buyer.
- When the buyer has a usable default address, also choose the best shipping voucher against an authoritative standard-shipping estimate; otherwise omit all shipping-price claims.
- Extend live buyer product summaries with an optional, versioned price-preview breakdown. Guests and authenticated buyers without a valid preview continue to receive `effectivePriceMinor` as the displayed product price.
- Show the authenticated buyer's best merchandise price on catalogue/search, homepage, public-shop, product-detail, related-product, favorites, recently-viewed, and cart/checkout product-price displays. Shipping remains a separate estimated payable component rather than being subtracted from the merchandise unit price.
- Keep cart and checkout authoritative: they recalculate against actual selected lines, quantities, address, service, voucher state, and usage limits before showing or committing the true order payable.
- Batch PostgreSQL reads and calculations for collection surfaces, use one UTC evaluation instant per response, and add explicit latency/query-count safeguards.
- Exclude seller/admin price editors and immutable order, return, and purchase-history snapshots from personalized preview pricing.
- Prevent an authenticated seller from purchasing products owned by that seller's own shop, and show a clear buyer-facing warning when the blocked action is attempted.

## Capabilities

### New Capabilities

- `buyer-best-voucher-price-preview`: Defines authenticated best-voucher discovery, deterministic selection, guest fallback, address-dependent shipping preview, response contracts, covered live buyer surfaces, and checkout reconciliation.

### Modified Capabilities

None. Voucher pricing and storefront effective pricing currently exist only as completed change deltas rather than synchronized main capabilities, so this change introduces the combined buyer-preview behavior as a new capability.

## Impact

- **Contracts/API:** Product-card, homepage, engagement, and product-detail responses gain an optional versioned buyer preview containing merchandise and nullable shipping facts; endpoints need optional authentication context without making guest access private.
- **Backend:** Catalogue, homepage, public-shop, engagement, and detail assemblers call a shared batched preview service backed by PostgreSQL voucher, usage, address, product-price, and shipping facts.
- **Frontend:** Shared selectors distinguish guest/effective price from authenticated best merchandise price and render shipping estimates separately with clear preview language.
- **Cart/checkout:** Existing voucher calculators and transactional consumption remain authoritative and are reused for parity tests; no preview reserves or consumes a voucher.
- **Performance/security:** Collection endpoints require bounded candidate selection, no per-card queries, private/no-store handling for personalized responses, and no exposure of voucher counters or other buyers' data.

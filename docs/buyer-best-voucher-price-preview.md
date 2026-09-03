# Buyer best-voucher price preview

Live buyer product surfaces keep `priceMinor` as the scheduled effective product price. When a
valid authenticated preview exists, clients use `buyerDisplayProductPriceMinor()` to display the
quantity-one `merchandisePayableMinor`. Guests and failed or malformed previews always fall back to
the effective product price.

The preview automatically evaluates at most one shop voucher followed by one platform merchandise
voucher. It is informational, does not reserve or consume a voucher, and may differ from cart totals
when quantity, cart composition, caps, minimum spend, usage, or voucher state changes.

Shipping is separate. A `STANDARD` estimate and shipping voucher are included only when the buyer
has a usable default address and the selected variant has a valid weight and shop origin. Shipping
savings never reduce the displayed merchandise price.

Cart quote and checkout recalculate from current PostgreSQL facts. Explicit buyer voucher codes
constrain their slots; empty slots are filled with the best eligible candidates. Checkout remains the
only path that atomically consumes voucher usage.

When the cart has no usable delivery address, `POST /api/v1/cart/quote` accepts an omitted
`shippingAddressId` and still returns the best shop/platform merchandise calculation. In this state
`address`, `shippingVersion`, and each shop's `shipping` are `null`; shipping totals are zero and no
shipping voucher can be requested or advertised. The buyer must add an address before checkout.

## Local rollout

- `BUYER_BEST_PRICE_PREVIEW_ENABLED=false` keeps product browsing on effective-price fallback.
- `BUYER_BEST_PRICE_MAX_CANDIDATES_PER_SLOT=8` bounds candidates for each preview slot.
- `BUYER_BEST_PRICE_MAX_COMBINATIONS=256` bounds evaluated combinations per product.

Personalized responses remain `no-store`. Buyer IDs, addresses, voucher usage, and personalized
prices are read from PostgreSQL and are never indexed in or requested from Elasticsearch. Roll back
the discovery preview by setting the feature flag to `false`; cart and checkout voucher calculation
remain active and authoritative.

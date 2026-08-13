# Authenticated multi-shop cart and authoritative quote (T16–T17)

T16 stores one cart per authenticated buyer in PostgreSQL and projects current product, shop,
price, availability, stock, and purchase-limit facts. Anonymous browsing remains available, but no
cart state is created, read, or mutated until the buyer signs in.

## Ownership and authentication

- Every `/api/v1/cart/**` endpoint requires a valid bearer access session.
- Ownership is derived only from the verified session; requests never accept `userId` or `cartId`.
- Missing, expired, or invalid access sessions return sanitized `401` Problem Details after the
  request passes the shared browser-security boundary. Missing or untrusted mutation origins retain
  security precedence and return `403` before authentication.
- The browser stores only the last confirmed cart projection in React memory. Logout clears it
  immediately; localStorage and sessionStorage are not used.
- There is no guest cart cookie, guest credential, merge endpoint, or guest cleanup command.

The initial additive local migration included guest-compatible columns. They remain dormant so an
already-migrated developer database does not need a destructive reset. Runtime code never resolves
or creates those owner forms.

## API

All successful responses use `Cache-Control: private, no-store` and expose an ETag in the form
`"cart-<version>"`. Every mutation requires that value in `If-Match` and returns the complete
authoritative cart plus any reconciliation adjustments.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/cart` | Read the authenticated buyer's cart. |
| `POST` | `/api/v1/cart/items` | Add `{ variantId, quantity }` or combine a duplicate line. |
| `PATCH` | `/api/v1/cart/items/{lineId}` | Replace line quantity with `{ quantity }`. |
| `DELETE` | `/api/v1/cart/items/{lineId}` | Idempotently remove an owned line. |
| `PUT` | `/api/v1/cart/items/{lineId}/selection` | Set one line with `{ selected }`. |
| `PUT` | `/api/v1/cart/shops/{shopId}/selection` | Set every eligible line in one shop. |
| `PUT` | `/api/v1/cart/selection` | Set every eligible line in the cart. |
| `POST` | `/api/v1/cart/quote` | Calculate authoritative merchandise, mock shipping, and payable totals for `{ shippingAddressId, services? }`. |

The API caps a line at the smallest current stock/purchase/platform limit, allows at most 100
distinct variants, and returns typed adjustments when requested quantities cannot be accepted.
Stale `If-Match` values return `409`; clients reload rather than replay against an unknown version.
Cross-owner line identifiers use the same private not-found response as missing identifiers.

## Authoritative pricing quote

`POST /api/v1/cart/quote` is display-only and requires the current cart ETag in `If-Match`. The
request may contain only an owned `shippingAddressId` and optional `{ shopId, service }` choices.
It never accepts owner, cart, quantity, price, discount, shipping fee, or total fields. Unknown
fields are rejected by the strict DTO boundary.

Within one repeatable-read PostgreSQL transaction, the API verifies address ownership and cart
version, then reloads the current selected product, variant, inventory, shop, price, compare-at
price, and weight facts. Unavailable or insufficient-stock lines are excluded and reported without
contributing money or weight. The operation does not write the cart, address, catalog, or quote.

All monetary values are non-negative safe integers in VND, where one unit is one đồng. The rules
use checked integer arithmetic:

- list unit price is `max(current compare-at price, current selling price)`;
- product discount is `(list unit price - selling price) × quantity`;
- merchandise payable is `selling price × quantity`;
- each shop payable is merchandise plus its one shipping fee;
- the overall payable total is the exact sum of shop totals.

Overflow, unsafe persistence values, or calculation failures return sanitized `503` Problem
Details without partial totals. Invalid body/service data returns `400`; missing or foreign
addresses return the same private `404`; stale or malformed cart ETags return `409`; normal shared
browser-security and authentication failures remain `403`, `415`, `413`, or `401` as applicable.

## `mock-v1` shipping

Every selected shop becomes one independent shipment. The quote labels its provider as `MOCK` and
offers these deterministic services:

| Service | Base fee | Each started 500 g after the first 500 g | ETA |
| --- | ---: | ---: | ---: |
| `ECONOMY` | 15,000 VND | 3,000 VND | 4–6 days |
| `STANDARD` | 22,000 VND | 4,000 VND | 2–4 days |
| `EXPRESS` | 35,000 VND | 6,000 VND | 1–2 days |

The omitted choice defaults to `STANDARD`. The zone surcharge is 0 VND within the same legacy
province, 6,000 VND across provinces in the same north/central/south macro-region, and 12,000 VND
across regions or for an unknown location. Origin and destination use the shared normalized legacy
63-province catalog.

`ProductVariant.weightGrams` is a required positive integer bounded at 1,000,000 g. Migration rows
without a prior value receive 500 g. Canonical dataset rows without a valid source weight receive a
deterministic stable fallback in 250 g steps from 250–5,000 g, recorded in generated-field metadata.
Repeated imports therefore preserve the same weight.

## Frontend behavior

- On product detail, an anonymous add attempt links to login with a safe product return path.
- `/cart` shows a login-required screen to an anonymous buyer.
- After email or Google authentication, `CartProvider` loads the account cart once.
- Header count and cart controls update only from confirmed server responses.
- `/cart` loads the default owned address, defaults each selected shop to `STANDARD`, and displays
  line, shop, shipping, discount, and payable amounts only after validating the complete quote.
- Address, service, or cart changes mark the old quote stale and abort/sequence older requests;
  `409` reloads the cart before requoting. No-address and recoverable-error states invent no total.
- Logging out clears the private projection and returns the header count to zero.

The quote is not a reservation, signed price token, carrier promise, or order. Future checkout must
reload the same authoritative facts and rerun the same versioned calculation seam before creating
an order. T17 does not implement vouchers, real carrier integration, stock reservation, checkout,
payment, or order creation.

## Browser mutation security

The global NestJS guard applies to every ordinary unsafe browser mutation:

- an exact trusted `Origin` is required;
- method-override headers are denied;
- body-bearing requests use documented JSON media types and stay within 100 KiB;
- Google OAuth callbacks and provider-signed webhooks use narrow reviewed security classes.

Cart mutations require both the trusted browser origin and the bearer session. General application
rate limiting remains deferred; the existing authentication limiter is unchanged.

## Verification

With the API and web app running locally:

```bash
pnpm test:e2e:cart:quick
pnpm test:e2e:pricing:quick
```

The quick suite verifies anonymous login handoff and authenticated cart management with intercepted,
contract-valid APIs, so it does not mutate the developer database. Guarded PostgreSQL suites verify
real authenticated ownership and concurrency through `TEST_DATABASE_URL`.

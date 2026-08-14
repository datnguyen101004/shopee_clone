# Authenticated multi-shop cart, authoritative quote, and vouchers (T16–T18)

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
| `POST` | `/api/v1/cart/quote` | Preview authoritative merchandise, mock shipping, selected vouchers, and payable totals. |

The API caps a line at the smallest current stock/purchase/platform limit, allows at most 100
distinct variants, and returns typed adjustments when requested quantities cannot be accepted.
Stale `If-Match` values return `409`; clients reload rather than replay against an unknown version.
Cross-owner line identifiers use the same private not-found response as missing identifiers.

## Authoritative pricing quote

`POST /api/v1/cart/quote` is display-only and requires the current cart ETag in `If-Match`. The
request may contain only an owned `shippingAddressId`, optional `{ shopId, service }` choices, and
optional voucher code slots. The voucher shape is
`{ platformCode?, shopCodes?: [{ shopId, code }], freeShippingCode? }`.
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
- merchandise subtotal is `selling price × quantity`;
- shop vouchers apply first in canonical shop order, the platform merchandise voucher applies to
  the remaining merchandise, then the free-shipping voucher applies to authoritative shop fees;
- percentage benefits use integer basis points and floor division; capped benefits cannot exceed
  their eligible residual base;
- line/shop allocation uses deterministic largest-remainder reconciliation;
- merchandise payable is subtotal minus shop and platform merchandise voucher discounts;
- each shop payable is merchandise payable plus shipping fee minus shipping voucher discount;
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
- Each selected shop exposes one shop-code slot; platform and free-shipping slots appear near the
  summary. Codes are submitted only after **Áp dụng**, may be removed explicitly, and are retained
  while address, shipping service, or cart facts trigger a re-quote. Removed shop slots are omitted.
- Stable server rejection reasons are mapped to safe Vietnamese messages. The browser neither
  decides eligibility nor computes or trusts a voucher amount.
- Address, service, or cart changes mark the old quote stale and abort/sequence older requests;
  `409` reloads the cart before requoting. No-address and recoverable-error states invent no total.
- Logging out clears the private projection and returns the header count to zero.

The `pricing-v2`/`voucher-v1` quote is not a reservation, signed price token, carrier promise, or
order. Preview never updates a voucher counter. T19 checkout must call the transaction-owned
calculation seam, revalidate current definitions and limits, and call `consumeInTransaction` with a
server purchase reference inside the same order-creation transaction. No public consume endpoint
exists. T18 does not implement real carrier integration, stock reservation, checkout, payment, or
order creation.

## Deterministic local voucher fixtures

After `pnpm db:migrate:deploy && pnpm db:seed`, these codes support repeatable local checks:

| Code | Expected behavior |
| --- | --- |
| `PLATFORM-50K` | Active platform fixed-amount benefit. |
| `PLATFORM-10` | Active capped platform percentage benefit. |
| `SHOP-15` | Active product-scoped percentage benefit for the seeded product/shop. |
| `FREESHIP-30K` | Active capped free-shipping benefit. |
| `EXPIRED-10K` | Rejected with `EXPIRED`. |
| `FUTURE-10K` | Rejected with `NOT_STARTED`. |
| `EXHAUSTED-10K` | Rejected with `GLOBAL_LIMIT_REACHED`. |
| `USED-10K` | Rejected for the seeded buyer with `BUYER_LIMIT_REACHED`. |

Activity is evaluated at one UTC instant with a half-open `[startsAt, endsAt)` window. Minimum
spend uses the pre-voucher selling subtotal of scope-eligible selected lines. A structurally valid
but ineligible code returns a normal quote with an `APPLIED` or `REJECTED` result; malformed,
duplicate, repeated-slot, or money-bearing requests return sanitized `400` Problem Details.

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
pnpm test:e2e:vouchers:quick
```

The quick suite verifies anonymous login handoff and authenticated cart management with intercepted,
contract-valid APIs, so it does not mutate the developer database. Guarded PostgreSQL suites verify
real authenticated ownership and concurrency through `TEST_DATABASE_URL`.

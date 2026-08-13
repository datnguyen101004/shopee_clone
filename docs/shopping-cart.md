# Authenticated multi-shop cart (T16)

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

The API caps a line at the smallest current stock/purchase/platform limit, allows at most 100
distinct variants, and returns typed adjustments when requested quantities cannot be accepted.
Stale `If-Match` values return `409`; clients reload rather than replay against an unknown version.
Cross-owner line identifiers use the same private not-found response as missing identifiers.

## Frontend behavior

- On product detail, an anonymous add attempt links to login with a safe product return path.
- `/cart` shows a login-required screen to an anonymous buyer.
- After email or Google authentication, `CartProvider` loads the account cart once.
- Header count and cart controls update only from confirmed server responses.
- Logging out clears the private projection and returns the header count to zero.

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
```

The quick suite verifies anonymous login handoff and authenticated cart management with intercepted,
contract-valid APIs, so it does not mutate the developer database. Guarded PostgreSQL suites verify
real authenticated ownership and concurrency through `TEST_DATABASE_URL`.

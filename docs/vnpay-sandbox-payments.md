# VNPAY sandbox payments

VNPAY is an optional hosted-redirect provider. The API creates a signed URL from a
committed `PaymentAttempt`; VNPAY then renders the QR/bank-card choices. The web app
never receives or stores card credentials, the secure hash, or a complete URL in
application state.

## Local setup

1. Copy the non-secret placeholders from `.env.example` into the ignored `.env` file.
   Set `VNPAY_ENABLED=true`, the sandbox terminal/secret, the provided sandbox pay and
   transaction API URLs, `VNPAY_RETURN_URL=http://localhost:3000/payment/callback`, and
   a public HTTPS `VNPAY_IPN_URL`. The API accepts either
   `/api/v1/payment-providers/vnpay/ipn` or the legacy
   `/api/v1/callback/payment-callback` suffix.
2. Start PostgreSQL, API (`3001`) and web (`3000`). Expose the API through an HTTPS
   tunnel, for example `ngrok http 3001`, and use the tunnel URL as the IPN endpoint in
   both `.env` and the VNPAY merchant sandbox settings.
3. Run `RUN_VNPAY_SANDBOX_E2E=1 pnpm vnpay:sandbox:preflight`. The command validates
   hosts, callback paths, amount/TTL/timeout bounds and IPN reachability without
   printing credentials. Without the opt-in flag it exits successfully without making
   a network request.
4. In checkout select **VNPAY (sandbox)** and choose QR or bank card on the hosted
   VNPAY page. The browser return is navigation-only; the backend IPN is authoritative.

## Callback and status behavior

- `/payment/callback` reads only `vnp_TxnRef`, resolves it through the authenticated
  owner-scoped API, and removes provider query data from the visible URL.
- A Return before IPN shows **Đang chờ VNPAY xác nhận**. The page performs bounded,
  owner-scoped status reads with an initial one-second delay, backoff, a ten-minute
  limit, and a **Kiểm tra lại** action. It stops as soon as the backend reports a
  terminal result.
- A verified IPN is deduplicated and passed through the same atomic finalizer as other
  payment observations. VNPAY ShopOrders start at `PENDING_PAYMENT`; a verified
  success moves every ShopOrder in the Purchase to `PENDING_CONFIRMATION`.
- A cancelled, failed, or expired VNPAY attempt is terminal. The finalizer changes
  its ShopOrders to `CANCELLED`, releases inventory/voucher holds exactly once, and
  restores eligible cart lines. The same Purchase is never reopened or retried;
  the buyer starts a new checkout from the cart.

## Safe observability

Log only an internal payment reference, provider, operation (`create`, `ipn`, `query`),
result class, latency, retry count, active-attempt conflict count, pending age, and
redacted outcome. Never log terminal/hash secrets, `vnp_SecureHash`, raw query strings,
full signed URLs, bank identifiers, card data, or buyer personal data. QueryDR and
manual late-success/refund backlog should be tracked by count and oldest age, not by
provider payload.

## UAT checklist

- Successful hosted QR/card payment: IPN returns `RspCode=00`, payment becomes `PAID`,
  holds are consumed once, and seller actions become available.
- Cancel or failed payment: attempt and ShopOrders are terminal (`CANCELLED`), holds
  are released once, and no seller fulfillment action is allowed before `PAID`.
- Replay the same signed IPN and confirm no duplicate inventory, voucher, order event,
  notification, or state regression.
- Return before IPN, reload/new tab, unknown owner reference, and tunnel outage all
  retain a backend-driven waiting/support state. Keep only redacted evidence.

The sandbox may be enabled on a production-like host for this personal demo. Keep
`VNPAY_ENV=sandbox`, use only sandbox merchant credentials and fixed sandbox URLs, and
configure public HTTPS Return/IPN endpoints. This does not implement the VNPAY refund API,
settlement operations, or production merchant onboarding.

## Regression baseline captured during apply

With VNPAY disabled and deterministic fake providers, the local regression baseline is:

- API unit suites: 110 suites, 579 tests passed.
- Shared contracts: 28 files, 156 tests passed.
- Web tests: 85 files, 347 tests passed.
- API and web typecheck plus API/web lint passed (web reports only pre-existing warnings).
- Prisma generate, validate, deployed migrations, and migration checksum verification passed.

PostgreSQL checkout/order-history suites remain opt-in (`RUN_CART_DATABASE_TESTS=1`) and were
skipped in the current environment; sandbox UAT and Playwright require a running app, a public
HTTPS IPN tunnel, and merchant sandbox access.

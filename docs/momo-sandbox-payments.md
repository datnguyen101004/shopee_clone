# MoMo sandbox payments

This document records the external contract used by the `integrate-momo-sandbox-payments` change. It is sandbox-only; production credentials and go-live are explicitly out of scope.

## Contract snapshot

- Reviewed: 2026-08-28 (Asia/Ho_Chi_Minh)
- Documentation family: MoMo Developers v3, Open API/AIOv2 payment gateway
- Sandbox origin: `https://test-payment.momo.vn`
- Content type: `application/json; charset=UTF-8`
- Minimum HTTP timeout for create/query/refund: 30 seconds
- Currency: VND integer amount, from 1,000 through 50,000,000 for One-Time Wallet
- Flow: One-Time Wallet, `requestType=captureWallet`, `autoCapture=true`

Authoritative references:

- [One-Time Wallet payment](https://developers.momo.vn/v3/docs/payment/api/wallet/onetime/)
- [Payment notification/IPN](https://developers.momo.vn/v3/docs/payment/api/result-handling/notification/)
- [API idempotency](https://developers.momo.vn/v3/docs/payment/api/result-handling/idempotency/)
- [Transaction query](https://developers.momo.vn/v3/docs/payment/api/payment-api/query/)
- [Reverse and refund](https://developers.momo.vn/v3/docs/payment/api/payment-api/refund/)
- [Result codes](https://developers.momo.vn/v3/docs/payment/api/result-handling/resultcode/)
- [Sandbox test instructions](https://developers.momo.vn/v3/docs/payment/onboarding/test-instructions/)

The links and assumptions above must be reviewed again before updating the adapter contract or enabling a different MoMo environment.

## Endpoints and canonical signatures

### Create payment

- `POST /v2/gateway/api/create`
- Canonical input:

```text
accessKey={accessKey}&amount={amount}&extraData={extraData}&ipnUrl={ipnUrl}&orderId={orderId}&orderInfo={orderInfo}&partnerCode={partnerCode}&redirectUrl={redirectUrl}&requestId={requestId}&requestType={requestType}
```

- HMAC-SHA256 with the sandbox secret key.
- `orderId` and `requestId` are generated and persisted before the network call.
- A retry after an unknown outcome reuses both identifiers. MoMo documents `requestId` idempotency for at least 31 days.
- `resultCode=0` from create means that payment instructions were created. It does not prove that the buyer paid.
- `payUrl` is an HTTPS navigation URL, `deeplink` uses the MoMo app scheme, and `qrCodeUrl` is QR payload data rather than necessarily an image URL.

### IPN

- MoMo sends `POST application/json` to the configured `ipnUrl`.
- The receiver validates schema, HMAC, `partnerCode`, `orderId`, `requestId`, `amount`, and the stored VND currency before changing domain state.
- A valid accepted or duplicate event receives HTTP 204 within 15 seconds.
- Browser redirect is never authoritative. Only a verified IPN or verified server query can finalize payment.

### Transaction query

- `POST /v2/gateway/api/query`
- Canonical input:

```text
accessKey={accessKey}&orderId={orderId}&partnerCode={partnerCode}&requestId={requestId}
```

- Query is used after create timeout, stale pending state, missing IPN, expiry boundary, or result mismatch.
- Network failure is `UNKNOWN`/retryable, not terminal payment failure.

### Full refund

- `POST /v2/gateway/api/refund`
- A refund has a new `orderId`, a stable `requestId`, the original successful `transId`, and the full VND amount for the late-success safety flow.
- Canonical input:

```text
accessKey={accessKey}&amount={amount}&description={description}&orderId={refundOrderId}&partnerCode={partnerCode}&requestId={requestId}&transId={transId}
```

- An unknown refund outcome is reconciled through `POST /v2/gateway/api/refund/query` before another refund is attempted.

## Result classification

The adapter uses the official final-status flag plus a conservative allowlist:

- `0`: successful payment observation; create response remains pending until IPN/query.
- `9000`: authorized; accepted as success only for the configured auto-capture flow and a fully correlated authoritative observation.
- `1000`, `7000`, `7002`: pending/processing and eligible for reconciliation.
- `1005`: expired.
- `1006`: buyer denied/cancelled.
- `1017`: merchant cancelled.
- An unknown or non-final system code remains `UNKNOWN` and is queried; it is never treated as paid.

## Security rules

- Credentials come only from environment/secret storage and are never committed.
- Never log the secret key, full access key, signature, raw provider payload, complete payment URL, buyer PII, or canonical string containing credentials.
- Outbound API origin is fixed to the sandbox allowlist. Returned HTTPS URLs and MoMo deep links are validated before they reach the client.
- Signature comparison validates hexadecimal length first and then uses a timing-safe byte comparison.

## Local sandbox setup

1. Create or open a MoMo for Business sandbox application and copy its sandbox `partnerCode`, `accessKey`, and `secretKey` into the ignored `.env` file. Never paste real values into `.env.example`, logs, issues, screenshots, or UAT evidence.
2. Install the MoMo Test App and create/use a test wallet according to the current [official sandbox test instructions](https://developers.momo.vn/v3/docs/payment/onboarding/test-instructions/). Use only the test phone, OTP/password and test-balance mechanisms displayed by MoMo; they can change independently of this repository.
3. Expose the API with an HTTPS tunnel. For example, run `cloudflared tunnel --url http://localhost:3001` or `ngrok http 3001`, then set `MOMO_IPN_URL=https://<public-host>/api/v1/payment-providers/momo/ipn`.
4. Expose the web redirect over HTTPS (or use a separately deployed sandbox web URL) and set `MOMO_REDIRECT_URL`. Redirect is UX-only and never finalizes a payment.
5. Run `RUN_MOMO_SANDBOX_E2E=1 pnpm momo:sandbox:preflight`. It validates flags, credential presence, public callback URLs, timeout and amount without printing secrets.
6. Confirm the tunnel reaches the route with a deliberately invalid POST. A `400` response proves reachability while also proving unsigned data is rejected:

```bash
curl -i -X POST "$MOMO_IPN_URL" -H 'content-type: application/json' --data '{}'
```

## Sandbox UAT checklist

- Start API/web with `MOMO_ENABLED=true`, keep the preflight terminal output, and use a multi-shop cart whose authoritative total is within the documented amount range.
- Happy path: create the QR/deep link, pay in MoMo Test App, observe IPN `204`, polling `PAID`, consumed holds and seller fulfillment eligibility. Query MoMo and compare only safe order/request references, amount, result class and timestamps.
- Cancel/expiry: cancel once and let another payment expire. Confirm browser parameters do not finalize either payment, reconciliation determines the terminal state, and holds release once.
- Dedupe: replay the captured signed sandbox IPN only in the isolated test environment. Confirm one PaymentEvent/notification/resource finalization and no state regression.
- Late success/refund: use the controlled fixture/runbook path, verify one stable refund request, query it after any timeout, and confirm buyer-visible `REFUNDED`.
- Do not commit captured payloads or signatures. Record safe references/result classes/timestamps only. The real sandbox suite is opt-in and must remain disabled in default CI.

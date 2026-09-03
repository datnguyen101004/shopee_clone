# Buyer order lifecycle (T20)

T20 exposes each T19 per-shop `ShopOrder` as an authenticated buyer order. Historical address, shop,
product, variant, shipping, voucher and VND totals always come from committed snapshots; changing the
catalog or a saved address cannot rewrite an order.

## API

All responses use `Cache-Control: private, no-store`, require a valid buyer session and return exact
shared contracts. Unknown and foreign order references intentionally share the same sanitized `404`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/account/orders?filter=ALL&limit=20&cursor=...` | Newest-first per-shop order page |
| `GET` | `/api/v1/account/orders/:orderReference` | Owned snapshots, totals, capability and timeline |
| `POST` | `/api/v1/account/orders/:orderReference/cancel` | Cancel an owned pending-confirmation order |

Filters are `ALL`, `PENDING_CONFIRMATION`, `AWAITING_PICKUP`, `SHIPPING`, `DELIVERED`, `CANCELLED`
and `RETURN_REFUND`. Cursors are opaque and bound to the filter that produced them. The default limit is
20 and the maximum is 50.

Cancellation requires:

```http
If-Match: "order-0"
Idempotency-Key: 8b63c715-a17c-4da3-8cab-3ec56cf45964
Content-Type: application/json
Origin: http://localhost:3000
```

```json
{
  "reasonCode": "CHANGE_ADDRESS",
  "reasonNote": "Muốn nhận hàng ở địa chỉ khác"
}
```

The buyer may cancel only `PENDING_CONFIRMATION`. The service locks the owned order row, verifies the
ETag version, advances to `CANCELLED`, increments version and appends one buyer audit event in one
transaction. Replaying the same canonical request with the same key returns the original result;
reusing the key for another request, sending a stale version, or racing a later transition returns a
stable `409` without a second event.

## Lifecycle

- `PENDING_CONFIRMATION → AWAITING_PICKUP | CANCELLED`
- `AWAITING_PICKUP → SHIPPING | CANCELLED`
- `SHIPPING → DELIVERED`
- `DELIVERED → RETURN_REQUESTED`
- `RETURN_REQUESTED → RETURNED | REFUNDED`
- `RETURNED → REFUNDED`

T20 only exposes the buyer cancellation command. Seller fulfillment, carrier tracking and operational
return/refund commands remain later tasks, but must reuse the central lifecycle service.

## Screens and verification

- `/account/orders`: responsive status tabs, cursor “Xem thêm”, snapshot order cards.
- `/account/orders/:orderReference`: address/line/shipping/voucher totals, timeline and conditional
  cancellation modal.

```bash
npx --yes pnpm@10.34.5 db:migrate:deploy
npx --yes pnpm@10.34.5 --filter @shopee-clone/contracts test -- order-history.spec.ts
$env:RUN_CART_DATABASE_TESTS='1'; npx --yes pnpm@10.34.5 --filter @shopee-clone/api test -- order-history.postgres.e2e.spec.ts --runInBand
npx --yes pnpm@10.34.5 --filter @shopee-clone/web test -- buyer-order-history.test.tsx order-history-api.test.ts
npx --yes pnpm@10.34.5 test:e2e:orders:quick
```

For manual verification: sign in, complete a COD checkout, open **Tài khoản → Đơn mua**, filter the
list, open a pending order, cancel it, then reload the detail. The cancelled state and second timeline
event must persist while all address/product/total snapshots remain unchanged.

# Seller order fulfillment

Seller Center quản lý đơn của shop đã được duyệt tại `/seller/orders`. API luôn lọc theo shop của session seller và trả `Cache-Control: private, no-store`.

## API

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| `GET` | `/api/v1/seller/orders` | Queue cursor với `status`, `fulfillment`, `from`, `to`, `orderReference`, `limit` (tối đa 50), `cursor` |
| `GET` | `/api/v1/seller/orders/:orderReference` | Chi tiết snapshot, địa chỉ giao, timeline, deadline, packing và mock shipment |
| `POST` | `/api/v1/seller/orders/:orderReference/actions` | Thực thi một action seller |

Mutation bắt buộc `If-Match: "seller-order-<orderVersion>-<fulfillmentVersion>"`, `Idempotency-Key` là UUID và Origin nằm trong allow-list. Body chỉ nhận:

```json
{ "action": "CONFIRM" }
```

hoặc:

```json
{ "action": "REJECT", "reasonCode": "OUT_OF_STOCK", "reasonNote": "..." }
```

Các action là `CONFIRM → START_PREPARING → MARK_READY_FOR_PICKUP → HAND_OFF`; `REJECT` chỉ có ở bước chờ xác nhận. `CONFIRM` chuyển order sang `AWAITING_PICKUP` và đặt hạn bàn giao 48 giờ; `HAND_OFF` chuyển order sang `SHIPPING` và tạo shipment `MOCK` với tracking code ổn định. Xác nhận mặc định có hạn 24 giờ từ lúc tạo đơn. Lệnh trễ vẫn được chấp nhận nhưng audit event có `late=true`; hệ thống không tự hủy đơn.

Buyer hủy hoặc seller từ chối trước khi bàn giao dùng cùng transaction bù tồn kho: quantity on-hand được hoàn lại, sold giảm guarded, inventory adjustment có reason `ORDER_CANCELLATION`, và marker theo order khiến retry không hoàn hai lần.

## Màn hình kiểm tra

- `/seller/orders`: tab trạng thái, filter fulfillment, card sản phẩm/tổng tiền, badge quá hạn và tải thêm bằng cursor.
- `/seller/orders/:orderReference`: tiến trình, snapshot sản phẩm/địa chỉ, totals, timeline, action dialog và mock tracking.
- `/seller/orders/:orderReference/print`: packing view tối giản, dùng print CSS.

## Kiểm thử local

```bash
pnpm infra:up
pnpm db:migrate:deploy
pnpm seller-orders:migration:verify
pnpm --filter @shopee-clone/contracts test -- seller-orders.spec.ts
pnpm --filter @shopee-clone/api test -- seller-order-fulfillment.spec.ts
pnpm --filter @shopee-clone/web test -- seller-order-management.test.tsx
```

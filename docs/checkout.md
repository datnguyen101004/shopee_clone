# Checkout COD đa shop (T19)

T19 chuyển các sản phẩm đang được chọn trong giỏ của người mua đã đăng nhập thành một `Purchase` và một `ShopOrder` cho mỗi shop. Trình duyệt chỉ gửi ID, mã dịch vụ, mã voucher và ghi chú; mọi giá trị tiền đều được backend đọc lại và tính bằng số nguyên VND.

## Luồng màn hình

1. Tại `/cart`, nút **Mua hàng** chỉ bật khi cart và quote hiện hành đã sẵn sàng. Web lưu draft phiên bản 1 trong `sessionStorage` gồm cart version, address/shop/service/voucher ID hoặc code; draft không chứa tên, số điện thoại, địa chỉ đầy đủ hay tiền.
2. `/checkout` tải lại cart, danh sách địa chỉ và gọi preview. Mọi thay đổi địa chỉ, dịch vụ hoặc ghi chú đánh dấu tổng cũ là stale rồi lấy preview mới.
3. **Đặt hàng** tạo một UUID idempotency cho ý định hiện tại. Kết quả mạng chưa rõ sẽ dùng lại UUID này; thay đổi input hoặc conflict xác định mới xoay UUID.
4. Thành công chuyển đến `/checkout/success/:purchaseReference`. Trang này luôn gọi API owner-scoped để tải snapshot đã commit, vì vậy refresh không phụ thuộc state trong trình duyệt.

## API

Base URL local: `http://localhost:3001/api/v1`. Cả ba endpoint yêu cầu `Authorization: Bearer <access-token>`; hai mutation đi qua Origin/media guard toàn ứng dụng và response luôn `Cache-Control: private, no-store`.

### `POST /api/v1/checkout/preview`

Headers bắt buộc:

```http
Origin: http://localhost:3000
Authorization: Bearer <access-token>
Content-Type: application/json
If-Match: "cart-7"
```

Body chỉ chứa lựa chọn của người mua:

```json
{
  "shippingAddressId": "10000000-0000-4000-8000-000000000002",
  "services": [
    { "shopId": "10000000-0000-4000-8000-000000000003", "service": "STANDARD" }
  ],
  "vouchers": { "platformCode": "PLATFORM-10" },
  "notes": [
    { "shopId": "10000000-0000-4000-8000-000000000003", "note": "Giao giờ hành chính" }
  ]
}
```

`200` trả `checkout-v1` gồm full address snapshot, line/shop/shipping/voucher breakdown, `blockers`, `ready`, tổng tiền và `checkoutFingerprint`. Fingerprint chỉ có khi `ready: true`. Các blocker ổn định gồm `EMPTY_SELECTION`, `LINE_UNAVAILABLE`, `VOUCHER_REJECTED`, `MISSING_SHIPPING_SERVICE`.

### `POST /api/v1/checkout/cod`

Thêm header:

```http
Idempotency-Key: 8b63c715-a17c-4da3-8cab-3ec56cf45964
```

Body giống preview và thêm fingerprint vừa được server trả:

```json
{
  "shippingAddressId": "10000000-0000-4000-8000-000000000002",
  "services": [
    { "shopId": "10000000-0000-4000-8000-000000000003", "service": "STANDARD" }
  ],
  "checkoutFingerprint": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

- Lần commit đầu trả `201` và `{ "replayed": false, "purchase": ... }`.
- Gửi lại đúng buyer, key, cart version và body trả `200`, `replayed: true` cùng purchase cũ, kể cả cart đã được dọn.
- Dùng cùng key cho intent khác trả `409 checkout-idempotency-conflict`; client phải tạo key mới.
- Nếu bị timeout/mất response, client phải retry nguyên request với **cùng key**, không tự suy đoán đơn thất bại.

Transaction `Serializable` khóa intent và cart, tính lại preview, so fingerprint, ghi purchase/order/line/voucher snapshots, consume voucher, xóa đúng các cart line đã mua và tăng cart version một lần. Bất kỳ lỗi nào đều rollback toàn bộ.

### `GET /api/v1/checkout/purchases/:purchaseReference`

Trả `200` với immutable purchase result của buyer hiện tại. Reference không tồn tại và reference của buyer khác đều trả cùng `404 purchase-not-found`, tránh lộ sự tồn tại của đơn hàng.

## Problem Details và xử lý client

| HTTP | Type chính | Hành động |
| --- | --- | --- |
| 400 | `invalid-checkout-request` | Sửa body/header không hợp lệ. |
| 401 | `authentication-failed` | Khôi phục session hoặc chuyển login. |
| 403 | Origin/media security problem | Chỉ gửi mutation từ origin được allowlist. |
| 404 | `checkout-address-not-found`, `purchase-not-found` | Chọn địa chỉ khác hoặc hiển thị kết quả không khả dụng. |
| 409 | `checkout-cart-conflict` | Reload cart và preview. |
| 409 | `checkout-not-ready` | Hiển thị blockers. |
| 409 | `checkout-preview-changed` | Hiển thị preview/tổng mới, yêu cầu người mua xác nhận lại. |
| 409 | `checkout-idempotency-conflict` | Tạo key mới cho intent mới. |
| 503 | `checkout-unavailable` | Giữ nguyên key khi kết quả chưa rõ và cho phép retry. |

## Giới hạn chủ ý

T19 chưa reserve hoặc trừ tồn kho và chưa bảo đảm no-oversell giữa hai buyer đồng thời. Confirmation vẫn kiểm tra stock hiện tại, nhưng T24 mới sở hữu inventory reservation/decrement. T19 cũng chưa có thanh toán online, carrier thật, seller processing, hủy đơn hay lịch sử đơn đầy đủ.

## Kiểm tra

```bash
pnpm test:e2e:checkout:quick
```

Kiểm tra thủ công: đăng nhập → `/cart` → chọn sản phẩm của nhiều shop → **Mua hàng** → đổi địa chỉ/dịch vụ, nhập ghi chú → **Đặt hàng** → refresh trang thành công. API có thể kiểm tra qua Swagger tại `/docs` hoặc ba endpoint ở trên.

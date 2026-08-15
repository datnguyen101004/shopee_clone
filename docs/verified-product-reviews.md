# Đánh giá sản phẩm xác thực (T21)

Một buyer chỉ tạo được một đánh giá cho mỗi `OrderLine` thuộc đơn của mình khi shop-order đã `DELIVERED`. Điểm hợp lệ từ 1 đến 5; nhận xét tối đa 1.000 ký tự sau khi chuẩn hóa; tối đa 6 ảnh trên mỗi review.

## API riêng tư

- `POST /api/v1/account/review-media`: bearer session, `multipart/form-data`, field `file`; nhận JPEG/PNG/WebP có chữ ký hợp lệ, tối đa 5 MiB, kích thước từ 1 đến 5.000 px. Ảnh staged hết hạn sau 24 giờ.
- `POST /api/v1/account/orders/{orderReference}/lines/{lineId}/review`: body `{ rating, text?, mediaIds? }`, bắt buộc header `Idempotency-Key: <UUID>`; tạo đánh giá xác thực.
- `GET /api/v1/account/reviews/{reviewId}`: chỉ tác giả đọc được; response có `ETag: "review-{version}"`.
- `PATCH /api/v1/account/reviews/{reviewId}`: body giống create, bắt buộc `If-Match` lấy từ review hiện tại; stale version trả `409` cùng `currentVersion`.

Mọi mutation browser phải có Origin trong allowlist của ứng dụng. Không gửi URL ảnh tùy ý: chỉ gửi ID ảnh staged của chính tài khoản. `409` với cùng idempotency key và payload giống nhau replay dữ liệu canonical; cùng key nhưng payload khác bị từ chối.

## API công khai

- `GET /api/v1/catalog/products/{productId}/reviews?rating=1..5&limit=1..30&cursor=...`
- `GET /api/v1/review-media/{mediaId}` chỉ phục vụ ảnh đã `ATTACHED`.

Response công khai chỉ có tên hiển thị, điểm, nội dung, mốc cập nhật và URL ảnh an toàn. Không bao giờ có email, số điện thoại, reference đơn/purchase, địa chỉ, storage key hay metadata staging.

## Aggregate và local storage

`products.rating_*` và `shops.rating_*` được tính lại trong cùng transaction khi review create/edit; chỉ `VISIBLE` review được tính. `HIDDEN` giữ lại cho tác giả/audit và bị loại khỏi public/aggregate. Local adapter mặc định ghi file vào `apps/api/.runtime/review-media` (có thể đặt `REVIEW_MEDIA_ROOT`), chỉ phù hợp local/dev; production cần thay adapter bằng object storage/CDN.

Các file STAGED hết hạn chỉ được xóa bằng cleanup tường minh, không có scheduler nền trong T21.

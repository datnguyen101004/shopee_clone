# T35 — integration notes

## Boundary

`FlashSaleService` là boundary cho seller commands và public SKU status.
`ScheduledDiscountService` ưu tiên giá của Flash Sale SKU đang active, bỏ giá
Flash Sale khi SKU sold out hoặc campaign đã kết thúc, để sibling SKU thường
không bị giảm giá nhầm. `InventoryService` bảo vệ quota chưa bán khi seller
điều chỉnh hoặc checkout ordinary.

## Admission và consistency

`FlashSaleAdmissionService` đọc cart/active SKU, kiểm tra claim durable, rồi
chạy Lua atomic theo tất cả selected sale lines. Script giữ quota keys, một key
claim tạm thời cho mỗi `(campaign, buyer, product)` và một global slot; release
so sánh attempt token trước khi hoàn. PostgreSQL vẫn là authority cuối cùng và
transaction Serializable ghi claim, consumption, quota, inventory, voucher và
order. Redis admission có đúng 5 confirmation slots; preview không chiếm slot,
confirmation vượt pool trả 429/Retry-After và không có quota fallback
process-local.

## Public reads

Status endpoint là batch 1–50 ids. Mỗi snapshot có `authoritativeAt`, state
version và hard age limit 2 giây. L1 có TTL ngắn; Redis L2 dùng fill lease,
single-flight theo process và bounded fill count. Seller mutations xoá các key
status của campaign; dữ liệu cached không được dùng để cấp quota.

## Waiting room

Khi bật, ticket được lưu trong Redis sorted sets và dedupe theo buyer +
Idempotency-Key. LocalStack SQS Standard phát ticket; consumer xử lý duplicate
và out-of-order delivery idempotently. Pool có tối đa 20 lease; mỗi grant sinh
opaque random token lưu trong Redis 300 giây và delivered bằng HttpOnly cookie.
Backend kiểm tra live token theo buyer/session/gate/deadline cho protected
request. Chỉ order thành công hoặc expiry release lease; đóng tab/preview/failure
không release. Không có fallback token/quota process-local.

## Admin/CMS boundary

Admin vẫn author campaign type `FLASH_SALE` và homepage placement độc lập. FE
admin giữ type/presentation key và campaign navigation hiện có; SKU quota/price
được quản lý ở Seller Campaigns, không đưa thao tác seller vào CMS banner. Buyer
campaign detail chỉ nhận giá/badge đại diện từ public projection và không hiển
thị quota còn lại.

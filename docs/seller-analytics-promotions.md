# Seller dashboard và khuyến mãi

## Analytics

- `GET /api/v1/seller/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=DAY|WEEK|MONTH`
- `GET /api/v1/seller/analytics/products?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=1..100&cursor=...`

Hai endpoint yêu cầu session có role `seller` và shop `ACTIVE`/`APPROVED`. Khoảng ngày là inclusive theo `Shop.timeZone` (mặc định `Asia/Ho_Chi_Minh`), tối đa 366 ngày; response luôn `Cache-Control: private, no-store`. Chỉ các shop-order `awaiting_pickup`, `shipping`, `delivered` được tính. Conversion trả `NOT_AVAILABLE` vì hệ thống chưa có tracking lượt truy cập.

## Seller promotions

Các endpoint dưới đây owner-scoped, trả `Cache-Control: no-store` và `ETag: "seller-promotion-{version}"`:

```text
GET    /api/v1/seller/promotions/vouchers?state=&limit=&cursor=
POST   /api/v1/seller/promotions/vouchers
GET    /api/v1/seller/promotions/vouchers/:id
PATCH  /api/v1/seller/promotions/vouchers/:id       (If-Match)
POST   /api/v1/seller/promotions/vouchers/:id/actions (If-Match + Idempotency-Key)
DELETE /api/v1/seller/promotions/vouchers/:id       (If-Match; paused and unused only)
GET    /api/v1/seller/promotions/discounts?state=&limit=&cursor=
POST   /api/v1/seller/promotions/discounts
GET    /api/v1/seller/promotions/discounts/:id
PATCH  /api/v1/seller/promotions/discounts/:id       (If-Match)
POST   /api/v1/seller/promotions/discounts/:id/actions (If-Match + Idempotency-Key)
```

Mutation cần `Origin` hợp lệ. Voucher shop hỗ trợ fixed/percentage merchandise benefit; update không cho sửa economics/scope sau redemption. Voucher không còn trạng thái lưu trữ: seller chỉ `PAUSE`/`RESUME`, và có thể xóa cứng voucher đã tạm dừng nếu chưa có usage, redemption hoặc order snapshot. ETag/ownership vẫn được kiểm tra; voucher đã phát sinh lịch sử bị giữ lại để bảo toàn dữ liệu. Campaign chỉ áp dụng product đã publish, rate 1–90%, không được chồng thời gian trên cùng product; campaign đã bắt đầu không đổi `startsAt`/scope. Campaign vẫn hỗ trợ `PAUSE`, `RESUME`, `ARCHIVE` dùng database time và idempotency replay.

Scheduled discount được resolve server-side tại catalog, homepage, product detail và cart quote. Giá áp dụng theo thứ tự: scheduled product discount → shop voucher → platform voucher → shipping benefit; checkout re-evaluate lại giá và ghi snapshot immutable.

## Kiểm thử nhanh

```bash
pnpm infra:up
pnpm db:migrate:deploy
pnpm --filter @shopee-clone/contracts test -- --run
pnpm --filter @shopee-clone/api typecheck
pnpm --filter @shopee-clone/web typecheck
pnpm --filter @shopee-clone/api build
pnpm --filter @shopee-clone/web build
pnpm test:e2e:seller-analytics-promotions:quick
```

Trang kiểm tra: `/seller` (dashboard) và `/seller/promotions` (tab Voucher shop/Giảm giá sản phẩm). Form tạo campaign nhận product UUID sở hữu; giá hiển thị công khai luôn lấy từ API authoritative.

## Benchmark live analytics

Harness rollback-only: `apps/api/scripts/benchmark-seller-analytics.ts`. Chạy trên PostgreSQL reference profile với `BENCHMARK_SHOP_ID`, `BENCHMARK_BUYER_ID` và danh sách `BENCHMARK_VARIANT_IDS` hợp lệ; mặc định tạo 100.000 orders/500.000 order lines, giữ 10.000 orders thuộc shop đo và 90.000 orders foreign-control, warm-up 5 lần, đo 100 lần mỗi dải và rollback toàn bộ fixture. `BENCHMARK_CONCURRENCY` được giới hạn 20; dùng `BENCHMARK_MEASURED=3` chỉ cho smoke run.

Kết quả full run ngày 2026-08-19 (local Docker PostgreSQL, concurrency=1):

| Query | P50 | P95 | Budget |
| --- | ---: | ---: | ---: |
| Dashboard 90 ngày | 108.21 ms | 149.50 ms | ≤ 750 ms |
| Dashboard 366 ngày | 113.97 ms | 155.50 ms | ≤ 1.500 ms |
| Product analytics `limit=100` | 70.21 ms | 106.96 ms | ≤ 750 ms |

Reconciliation trả 10.000 eligible orders, 50.000 units và `7.297.525.100` minor units; response caps (366 buckets/10 best sellers/10 low-stock/100 products), statement counts cố định và owner predicate sử dụng `shop_orders_shop_id_created_at_id_idx` đều đạt. Kết quả chỉ mô tả profile local; không chứa credential hay dữ liệu fixture vì transaction được rollback.

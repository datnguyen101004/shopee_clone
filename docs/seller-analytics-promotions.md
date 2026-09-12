# Seller dashboard và khuyến mãi

## Seller product analytics

- `GET /api/v1/seller/analytics/overview?preset=today|yesterday|last_7_days|last_30_days&page=1&pageSize=10`
- `GET /api/v1/seller/analytics/overview?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&pageSize=10`

The overview requires an authenticated `seller` session and an approved,
active shop. The server derives the shop from the seller account; a caller
cannot select a foreign `shopId`. Custom dates are inclusive in `Shop.timeZone`
and are limited to 31 calendar days. Invalid, future-only, mixed preset/custom,
or unknown query parameters are rejected. Responses use
`Cache-Control: private, no-store`.

The ten summary and product-row metrics are Impressions, Product Views, Unique
Visitors, Clicks, CTR, Add to Cart, Orders, Units Sold, Revenue, and Conversion
Rate. Impressions count `product_impression` plus
`recommendation_impression`; Clicks count `product_clicked` plus
`recommendation_clicked`; Product Views count `product_viewed`; Unique Visitors
are distinct `COALESCE(buyerPseudonym, sessionPseudonym)` values on Product
Views; and Add to Cart counts only server-authored `cart_changed` events with
typed `properties.action = add`. Orders, units, and payable merchandise revenue
come from eligible shop orders (`awaiting_pickup`, `shipping`, `delivered`).

`CTR = clicks / impressions` and `Conversion Rate = orders / unique visitors`;
both rates are zero for a zero denominator. Every metric includes current and
immediately preceding equal-duration values. Relative change is
`(current - previous) / previous * 100`; both zero means `0`, while positive
current with zero previous is shown as `new`. Today/Yesterday use hourly trend
points; longer ranges use daily points. Today ends at the one captured server
request time and compares the same elapsed portion of the previous day. A
custom range ending today and Last 7/30 days likewise end at that request time;
past ranges and Yesterday use complete local calendar boundaries.

The response includes `generatedAt` and `freshness=near_real_time`. Firehose
buffering and Athena’s visibility delay mean this is recently updated rather
than transactional real-time data. Athena reads the compressed raw partitions
directly in one bounded current/previous scan, preserving this MVP’s no-new-
warehouse trade-off while accepting higher scan cost and latency as raw traffic
grows. The query is bounded by UTC `schema_version/dt/hour` partitions and the
31-day selected-range limit.

Analytics stores pseudonymous identities only. Raw IDs, e-mail, addresses,
payment details, and other direct personal data are prohibited; key rotation
prevents joins across pseudonym key IDs. No historical Product Views are
backfilled. The additive event does not change the Glue training path, its
04:00 schedule, or existing impression/click labels.

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

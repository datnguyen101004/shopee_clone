# T35 — Kết quả POC và quick E2E

Ngày chạy: **2026-09-07–2026-09-08**  
Phạm vi: API/Redis/PostgreSQL/LocalStack Lambda bằng k6 và các quick E2E Playwright hiện có. Các credential/fixture chỉ dùng local.

## Môi trường và topology

- k6 `2.2.0` (`C:\Program Files\k6\k6.exe`).
- Nest API `127.0.0.1:3001`, PostgreSQL, Redis standalone chạy bằng Docker.
- LocalStack `4.4.0`, SQS Standard + Lambda `t35-poc-admission`.
- Fixture gồm 21 buyer độc lập, cart và địa chỉ giao hàng; fixture chỉ tồn tại local và đã được dọn sau run.
- Có hai lượt admission: Nest grant fallback (`ADMISSION_SQS_ENABLED=false`) và Lambda topology (`ADMISSION_LAMBDA_ENABLED=true`). Lượt nghiệm thu Lambda dùng shared secret nội bộ và event-source mapping SQS.

## Kết quả POC đã chạy lại

| Case | Kết quả | Bằng chứng chính |
| --- | --- | --- |
| Lambda contract + browser guard unit | **PASS** | 4 test suites, 13/13 tests passed |
| Redis admission smoke | **PASS** | 21 ticket đồng thời giữ tối đa 20 lease; release cấp ticket waiting tiếp theo |
| A02 — 21/20, Nest fallback | **PASS** | 21/21 join HTTP 200; 20 lượt được cấp trong pool và 1 lượt chờ; 26 request, p95 API `439.31 ms`, `t35_unexpected=0` |
| A02 — 21/20, SQS + Lambda | **PASS** | 21/21 join HTTP 200; 20 admitted, 1 waiting; 93 request, p95 API `583.34 ms`, `t35_unexpected=0`; LocalStack có callback Lambda `/response` và `/logs` (57 response callback trong cửa sổ run) |
| R02 active public status | **PASS (phạm vi public-read)** | 30 request trong 10 giây, 60/60 checks passed, không trả `remainingQuantity`/stock riêng tư; p95 API `25.58 ms` |
| A01 — smoke join → preview → COD | **PASS sau fix** | Chạy với Redis admission namespace rỗng: 4/4 checks passed, COD `201`, tạo 1 order; p95 API `456.20 ms`, không còn `503 checkout-unavailable` |
| A03 — duplicate join | **PASS** | 6 buyer gửi cùng join key hai lần; 18/18 checks passed, một ticket được tái sử dụng cho mỗi buyer, không có unexpected |
| A05 — 6/5 confirmation | **PASS (gate behavior)** | Bật `T35_POC_HOLD_MS=5000`, 6 buyer/5 slot; 18/18 checks passed, 3 order + 3 rejection `429`, không có `5xx`; p95 `6024.10 ms` do barrier POC. DB serialization contention cũng được chuyển thành `429`; chưa có metric runtime độc lập để khẳng định peak execution bằng 5 |
| A07 — token/session binding | **PASS** | 6 buyer join rồi dùng access token/session của buyer khác để đọc ticket; 12/12 checks passed, mismatch bị từ chối HTTP `428` |
| A06 — ordinary bypass + missing admission | **PASS** | Fixture ordinary: 3/3 join trả `ticketId=bypass`, `ADMITTED`; fixture Flash Sale: 3/3 preview không có admission bị từ chối `428`; không phát sinh request admission dư |
| A08 — admission lease expiry (shortened local TTL) | **PASS (diagnostic)** | Với `T35_POC_LEASE_TTL_MS=1000` chỉ dùng local, join được cấp lease rồi status sau 1.5 giây trả `200/EXPIRED`; 3/3 checks, p95 `63.08 ms`. Production default vẫn 5 phút |
| A09 — success sau khi internal slot TTL hết | **PASS (diagnostic)** | Với `T35_POC_ADMISSION_TTL_MS=1000` và `T35_POC_HOLD_MS=2000`, COD vẫn commit `201`, replay `200`, result lookup khớp và payload conflict `409` (9/9 checks); chứng minh finalize không tạo duplicate khi attempt key hết hạn. Chưa thay thế race đầy đủ với waiting-room lease 300 giây |
| Q01 — suất cuối | **PASS** | Quota `1`, 20 buyer; 60/60 checks passed, đúng 1 order và 19 rejection, không có unexpected |
| Q03 — same-key replay/result lookup/payload conflict | **PASS (single buyer)** | 9/9 checks passed: confirm đầu `201`, replay `200`, result lookup `200` khớp purchase, payload hợp lệ nhưng khác digest trả `409`; 6-request run đồng thời bộc lộ contention quota/inventory (không dùng làm PASS cho throughput) |
| R01 — trước Flash Sale | **PASS (public status)** | 10 request, 20/20 checks passed, trạng thái `UPCOMING`, không lộ quota/stock, p95 `74.76 ms` |
| R03 — sold out | **PASS (public status)** | Quota về `0`, 30 request/60 checks passed, trạng thái sold-out không cho mua, p95 `63.01 ms` |
| R05 — status contract validation | **PASS** | Một lần chạy deterministic: batch hợp lệ `200`, variant id lỗi `400`, trên 50 ids `400`; 3/3 checks, p95 `17.57 ms` |
| `verify.mjs` invariant snapshot | **PASS** | Snapshot rerun: peak lease 20, duplicate order/reversal 0, quota/stock âm 0, polling checkout query 0, Lambda invocation `57` |

K6 summary của các lượt nằm tại `tmp/t35/a02-fallback-rerun-summary.json`, `tmp/t35/a02-lambda-rerun-summary.json`, `tmp/t35/r02-active-rerun-summary.json`, `tmp/t35/a01-smoke-rerun-summary.json`, `tmp/t35/a03-duplicate-join-rerun-summary.json`, `tmp/t35/a05-five-slot-final-summary.json`, `tmp/t35/a06-ordinary-bypass-summary.json`, `tmp/t35/a06-flash-missing-token-summary.json`, `tmp/t35/a07-token-mismatch-fixed2-summary.json`, `tmp/t35/a08-expiry-summary.json`, `tmp/t35/a09-expiry-success-race-summary.json`, `tmp/t35/q01-last-quota-rerun-summary.json`, `tmp/t35/q03h-summary.json`, `tmp/t35/r01-before-rerun-summary.json`, `tmp/t35/r03-soldout-rerun-summary.json` và `tmp/t35/r05-contracts-summary.json`. Snapshot verify mới là `tmp/t35/poc-invariant-snapshot-20260908.json`.

Snapshot invariant local mới vẫn đạt: peak active lease `20`, peak execution `5`, duplicate order/reversal `0`, quota/stock âm `0`, checkout polling query `0`, Lambda invocation đã quan sát `57`. POC barrier đã được gỡ sau lượt A05.

## Quick E2E hiện có

Chạy toàn bộ 16 suite `test:e2e:*:quick` trên API/Web local đang chạy. Chỉ hai suite pass hoàn toàn; các suite còn lại kết thúc với lỗi hiện hữu của storefront/seller test hoặc môi trường test, chưa phải bằng chứng lỗi riêng của Flash Sale:

| Suite | Kết quả |
| --- | --- |
| homepage | **PASS** — 6 passed, 3 skipped |
| product | **PASS** — 9 passed |
| catalog | **FAIL** — 12 failed |
| auth, account, engagement, shop, cart, pricing, vouchers | **FAIL** — có test failed |
| checkout | **FAIL** — 17 passed, 4 failed; một lỗi timeout do nút chat nổi che nút Đặt hàng/button disabled |
| orders, reviews, seller, seller-orders, seller-analytics-promotions | **FAIL** — còn test failed |

Flash Sale-specific browser journeys (refresh/tab lifecycle, cookie policy, waiting-room UI, responsive seller/buyer states) chưa có quick suite riêng chạy pass; k6 không thay thế được các kiểm tra đó.

Đã bổ sung kiểm thử FE tập trung cho hook polling: `pnpm --filter @shopee-clone/web test -- lib/use-flash-sale-status-polling.test.tsx components/checkout/checkout-waiting-room.test.tsx` đạt **2 file / 8 tests**. Các kiểm tra này phủ dedupe request đang bay, pause khi tab hidden + refresh khi visible, không tự poll campaign đã ended và keyboard focus; chưa phải bằng chứng đầy đủ cho task 2.16/2.18 vì chưa chạy browser cookie/tab flow trên API thật. Backend thêm `admission-result.controller.spec.ts` với **2 tests** cho validation/delegation result lookup.

Sau các bản vá, API `tsc --noEmit`, build và 4 suite Flash Sale/admission (6 tests) đều PASS; Web typecheck, lint và 2 file test trên cũng PASS.

Bảng máy đọc được của toàn bộ lượt chạy nằm tại `tmp/t35/e2e-quick-results-20260908.json`.

## Ma trận còn lại

Các case sau **chưa được nghiệm thu đầy đủ**: A04, A10; Q02 và Q04–Q08; R02 ở topology Lambda với mixed traffic, R04; cùng browser tasks 2.12, 2.13, 2.16 và 2.18. A08/A09 mới là diagnostic với TTL rút ngắn, Q03 mới chứng minh replay/lookup ở single buyer, và A06/R05 đã có run riêng nhưng chưa thay thế ma trận LocalStack đầy đủ. Những case còn lại cần fixture/mutation/proxy/barrier/đối soát riêng cho publication retry, lost response, mixed cart/voucher, cancellation, seller replenish/end và cache generation. Không dùng việc k6 exit code 0 để đánh dấu các case này đạt.

## Phát hiện trong lúc chạy

1. Fixture k6 phải gửi `Origin: http://localhost:3000`; nếu thiếu, browser mutation guard trả 403.
2. Lambda server-to-server cần request class `internal-signed` để không bị browser-origin guard chặn; controller vẫn kiểm tra shared secret.
3. COD idempotency key phải là UUID. Harness đã chuyển key text sang UUID ổn định trước khi gửi confirm.
4. Fixture checkout cần có `shopId` và service vận chuyển; provision script đã bổ sung `STANDARD` theo shop của SKU.
5. A01 ban đầu trả 503 vì Prisma field `FlashSaleBuyerClaim.flashSaleSkuId` thiếu `@map("flash_sale_sku_id")`; PostgreSQL có cột snake_case nhưng Prisma truy vấn camelCase. Sau khi sửa mapping và regenerate client, smoke COD đã tạo order thành công.
6. Admission quota/epoch được hydrate bằng `SET NX` từ snapshot PostgreSQL khi Redis cache lạnh; checkout fingerprint bỏ qua `campaignPrice.evaluatedAt` vì đây là timestamp quan sát, không phải fact làm thay đổi giá.
7. Result lookup nhận key idempotency dạng text từ harness đã từng đi vào Prisma UUID và trả 500. Controller hiện validate `CHECKOUT_IDEMPOTENCY_KEY_PATTERN` trước truy vấn và dùng `CheckoutExceptionFilter`; harness dùng đúng UUID key đã gửi qua confirm, còn lookup key không hợp lệ trả `400` validation thay vì lỗi server.
8. Q03 payload conflict phải thay đổi trường hợp lệ (địa chỉ UUID) thay vì nối chuỗi vào fingerprint 64-hex; nếu phá pattern fingerprint thì DTO trả 400 trước khi kiểm tra idempotency.

## Kết luận

Admission gate, Redis pool 20, đường SQS/Lambda, A01, A03, A05–A09 (A08/A09 diagnostic), A06 bypass, Q01, Q03 single-buyer và public status cho R01/R03/R05 đã có bằng chứng local đạt. T35 vẫn **chưa nghiệm thu toàn bộ** vì publication retry, lost-response, mixed-cart/cancellation/replenishment/cache-generation và Flash Sale browser journeys còn thiếu; các quick E2E nền cũng đang cho thấy nhiều lỗi cần xử lý riêng trước khi dùng làm regression gate.

# T35 — Kế hoạch POC Flash Sale bằng k6

Trạng thái: **PARTIAL — đã chạy một phần**. Kết quả chi tiết nằm trong [`poc-results.md`](./poc-results.md). Đã chạy quick E2E nền; chưa nghiệm thu toàn bộ T35 và chưa có quick browser journey riêng cho Flash Sale.

Nguồn yêu cầu: `design.md` mục 7, 9, 10; các specs trong change và `tasks.md`. Khi kết quả khác kỳ vọng, ghi nhận lỗi implementation, không sửa kỳ vọng để khớp kết quả.

## 1. Mục tiêu và phạm vi

Chứng minh bằng request đồng thời và đối soát dữ liệu rằng:

- Không oversell, không tạo đơn hoặc hoàn kho trùng; một buyer chỉ mua một đơn vị thuộc một biến thể trong cùng product/campaign, kể cả sau khi hủy đơn.
- Waiting room giữ tối đa **20 lease đang hiệu lực**, mỗi lease **300 giây từ lúc grant**, không tự gia hạn.
- Tối đa **5 execution xác nhận Flash Sale cùng lúc** trước bước phân bổ quota/transaction. Đây là giới hạn đồng thời, không phải 5 request/giây và không phải số đơn tối đa.
- Public reads đi qua L1 → Redis L2 → DB có kiểm soát trong cả ba phase. Cache không phải nguồn quyết định quyền mua, quota hay hiệu lực admission.
- Buyer đang WAITING không gọi checkout; status polling không tự grant hoặc truy vấn PostgreSQL cho nghiệp vụ admission/order.

Topology nghiệm thu: k6 đóng vai buyer → Admission/Queue control plane dùng **LocalStack SQS Standard + Lambda** → Redis; sau khi admitted, k6 gọi trực tiếp một Nest API → Redis/PostgreSQL. Static waiting-room UI được phục vụ local và kiểm chứng trình duyệt ở đợt riêng.

Không nằm trong POC này: triển khai AWS thật, production CDN/private ingress, HA/Redis Cluster, nhiều API instance, khôi phục khi mất Redis và cam kết throughput production. Có thể kiểm tra fail-closed 503 riêng; không đánh đồng với kiểm thử recovery.

## 2. Điều kiện trước khi chạy

### 2.1. Công cụ và môi trường

Kiểm tra trong PowerShell mới:

```powershell
k6 version
docker version
docker compose version
pnpm --version
```

Chuẩn bị một API, PostgreSQL thật, Redis standalone thật và LocalStack có SQS/Lambda. Dùng database, Redis instance và volume **riêng cho POC**, cùng dữ liệu giả. Ghi lại cổng, URL và phiên bản thực tế. Không reset DB phát triển hoặc FLUSHALL Redis đang dùng chung.

Cấu hình API cần bật `FLASH_SALE_SKU_ENABLED`, `TRAFFIC_ADMISSION_ENABLED`, `ADMISSION_SQS_ENABLED`; cấu hình `DATABASE_URL`, `REDIS_URL`, `ADMISSION_SQS_ENDPOINT`, `ADMISSION_SQS_QUEUE_URL` trỏ đúng môi trường POC. Kiểm tra pool thực tế bằng 20 và lease TTL bằng 300 giây; xác nhận budget execution bằng 5 trong implementation, không suy diễn từ tên biến môi trường.

Endpoint LocalStack trên máy host và endpoint từ Lambda/container có thể khác nhau. Phải kiểm tra kết nối Redis/SQS từ chính runtime Lambda. Đồng bộ đồng hồ máy/container, dùng thời gian server làm mốc campaign và lease.

### 2.2. Khoảng trống cần hoàn thiện

Tại thời điểm viết tài liệu:

- `apps/api/scripts/admission-localstack-setup.ts` và lệnh `pnpm --filter @shopee-clone/api admission:localstack:setup` tạo/lấy queue, đóng gói handler Lambda và tạo/cập nhật event-source mapping. Cần đặt `ADMISSION_LAMBDA_DEPLOY=true` và `ADMISSION_LAMBDA_SHARED_SECRET` trong môi trường POC.
- `traffic-admission.service.ts` có consumer polling SQS trong Nest như fallback. Khi `ADMISSION_LAMBDA_ENABLED=true`, consumer này tự tắt để Lambda là consumer duy nhất. `admission-lambda.ts` giữ contract batch failure; Lambda local gọi internal grant adapter có shared secret.
- Bộ harness k6 và script manifest/đối soát đã nằm trong `scripts/poc/t35`. Chúng vẫn cần fixture buyer/cart thật của môi trường POC; chưa có nghĩa là POC đã được chạy.

Trước nghiệm thu cần chạy setup với Lambda, kiểm tra event source mapping và chứng minh Lambda thực sự xử lý ticket. Khi kiểm tra đường Lambda, bật `ADMISSION_LAMBDA_ENABLED=true` để tắt consumer Nest và tránh hai consumer tranh queue. Smoke test với Nest consumer có thể hỗ trợ debug nhưng ghi rõ topology đó, không đánh dấu đạt nghiệm thu SQS/Lambda.

Chạy preflight một buyer qua join → grant → status → preview → COD với Redis/PostgreSQL thật. Kiểm tra Lua key/argument mapping, TTL, counter và release thực tế. Nếu bước này lỗi, dừng tăng tải; unit test/mock hoặc task đã đánh dấu hoàn thành không thay thế preflight.

### 2.3. Quan sát bắt buộc

Chuẩn bị log/metric hoặc probe POC cho các đại lượng sau trước khi chạy concurrency:

| Đại lượng | Cách sử dụng |
| --- | --- |
| Lease grant/release/deadline và peak active leases | Đếm lease đồng thời theo deadline, không đếm tổng grant lịch sử; phát hiện cấp/thu hồi trùng |
| Execution start/end, order key, peak đang xử lý | Chứng minh tối đa 5 công việc thực sự đang chạy; đọc counter sau khi chạy xong là chưa đủ |
| SQS delivery, ticket ID, Lambda invocation, redelivery delay | Chứng minh không mất ticket khi đầy pool, xử lý duplicate/out-of-order và không busy-loop |
| L1/L2 hit/miss, fill owner/waiter, DB fill và allocation transaction | Phân biệt đọc classification/auth với transaction phân bổ quota; xác nhận loser không vào allocation transaction |
| Order, claim, consumption, reversal, physical stock, quota, outbox | Đối soát trước/sau khi request và tác vụ nền đã kết thúc |
| Request latency, status/error code, Retry-After, kết quả lookup | Báo cáo p50/p95/p99 theo endpoint và theo success/rejection |

Gắn `runId`, scenario, buyer fixture ID và correlation ID. Không lưu auth cookie, opaque token hoặc dữ liệu cá nhân trong báo cáo. Không chỉ lấy mẫu counter thưa: có thể bỏ sót peak ngắn; cần sự kiện start/end hoặc peak được cập nhật nguyên tử.

## 3. Fixture và cách tạo request đồng thời

### 3.1. Bộ dữ liệu

Tạo tối thiểu 30 buyer giả, seller sở hữu sản phẩm, địa chỉ giao hàng hợp lệ và cart độc lập. Tăng số fixture nếu tăng số VU. Mỗi scenario có dữ liệu mới hoặc bước reset có kiểm chứng sau khi toàn bộ execution/outbox của lượt trước đã kết thúc.

| Fixture | Trạng thái/dữ liệu |
| --- | --- |
| C-upcoming | Campaign chưa bắt đầu, thời điểm bắt đầu đủ gần để quan sát chuyển phase |
| C-active | Campaign đang chạy, còn đủ thời gian cho test TTL 300 giây |
| P-hot / SKU-A | SKU Flash Sale, quota 1 cho tranh suất cuối; quota 20 cho test pool/budget |
| P-hot / SKU-B | Biến thể Flash Sale khác cùng product để test giới hạn buyer/product |
| P-hot / SKU-C | Biến thể không tham gia, mua giá thường |
| P-normal | Product thường cho ordinary-only cart và mixed cart |
| C-sold-out / C-ended | Participation hết quota nhưng còn hiệu lực; participation đã kết thúc |
| Voucher | Một voucher đạt ngưỡng theo giá sau sale và một voucher không đạt ngưỡng |

Stock vật lý phải đủ bảo chứng quota và các nghĩa vụ giữ hàng hiện có. Có fixture riêng cho biên `stock = quota`; nếu nhiều participation dùng cùng SKU, đối soát tổng quota được bảo vệ. Không dùng tồn kho lớn để che lỗi bảo chứng stock.

### 3.2. Danh tính, key và cookie

- Một VU thường tương ứng một buyer/session riêng; không chia sẻ admission cookie giữa các buyer. Riêng test nhiều tab dùng có chủ ý cùng danh tính/session.
- `join Idempotency-Key` và `order Idempotency-Key` là hai key riêng, đúng định dạng hợp đồng. Retry cùng lệnh giữ nguyên key và payload; đổi nội dung với cùng key phải conflict.
- Lấy cart version/ETag và preview fingerprint từ response thật. Không hardcode fingerprint hoặc sửa trực tiếp DB để bỏ qua preview.
- k6 nhận admission qua cookie jar từ status response, không sao chép token vào URL. Cấu hình domain/path/local HTTP nhất quán. k6 không chứng minh được trình duyệt thực thi SameSite/CORS hoặc HttpOnly; phần đó hoãn kiểm chứng browser.
- Chỉ submit theo hành động được scenario chỉ định. Poll status/replenishment không tự động tạo đơn. Retry 429 tuân thủ Retry-After, có giới hạn số lần và tổng thời gian.

### 3.3. Đồng thời có kiểm soát

Khởi động nhiều VU gần cùng lúc chỉ tạo tải gần đồng thời; chưa đảm bảo request cùng nằm trong đoạn code quan trọng. Với test 6 request/5 execution, chuẩn bị đủ 6 buyer đã admitted và đủ quota, đồng bộ thời điểm confirm. Cần test hook/barrier local giữ 5 execution sau khi lấy slot và trước khi kết thúc, rồi gửi request thứ sáu. Request thứ sáu phải nhận 429 khi 5 execution còn bị giữ.

Backend có hook `T35_POC_HOLD_MS` để giữ request sau khi lấy confirmation slot; chỉ bật ở môi trường POC, tối đa 120 giây, không xuất hiện trên deployment bình thường. Không dùng transaction bị khóa ngẫu nhiên làm bằng chứng duy nhất. Bỏ hook khi đo latency/tải thông thường; kết quả có hook chỉ chứng minh correctness.

Các race khác cũng cần điều khiển điểm xen kẽ và chạy lặp trên fixture mới. Nếu chưa có hook/probe phù hợp, ghi **BLOCKED**, không ghi PASS từ một lượt không xuất hiện cạnh tranh.

## 4. Kịch bản P0 — Admission và tính đúng dữ liệu

Chạy từng scenario độc lập trước khi phối hợp tải. Mọi PASS cần cả HTTP checks lẫn đối soát trạng thái server.

| ID | Chuẩn bị và thao tác | Kỳ vọng bắt buộc |
| --- | --- | --- |
| A01 — Baseline | Một buyer join, poll đến admitted, preview rồi COD; lookup lại order key | Một lease, preview không trừ quota/stock/slot; một order; commit thành công trả đúng lease; lookup không tạo đơn mới |
| A02 — 21/20 | 21 buyer join đồng thời; không confirm, theo dõi sau khi queue xử lý | Tối đa 20 lease active, buyer còn lại WAITING; không hứa buyer nào là người cuối; polling không grant. Cho một người mua thành công: một người đang chờ được cấp qua SQS/Lambda trong khoảng redelivery cấu hình |
| A03 — Duplicate join/delivery | Cùng buyer gửi nhiều join, retry cùng key, nhiều tab; inject duplicate/out-of-order message cùng ticket | Một live ticket/buyer/gate; tối đa một grant/ticket; deadline không kéo dài; đổi payload cùng key conflict; message cũ không cấp lại lease mới |
| A04 — Publication retry | Gây lỗi gửi SQS ở điểm publish, sau đó retry cùng join key | Không trả join thành công bị mất vĩnh viễn; retry tiếp tục được đúng ticket, không tạo ticket/grant trùng |
| A05 — 6/5 | Sáu buyer đã admitted, đủ quota, dùng barrier giữ 5 execution rồi gửi người thứ sáu | Peak execution = 5 trong tình huống này; thứ sáu 429 + Retry-After, chưa phân bổ quota/chưa vào allocation transaction; giữ lease. Sau nhả barrier, retry cùng key có thể xử lý nếu còn hợp lệ |
| A06 — Preview/bypass | Preview nhiều lần; confirm ordinary-only không admission; mixed cart thiếu token; gọi online cho sale | Preview không chiếm confirmation slot; ordinary-only bypass; mixed cart bị gate; sale không đi đường online. Kiểm tra selection phía server, không dựa flag client |
| A07 — Token binding | Thiếu token, token hết hạn, token sai, dùng cookie buyer/session khác hoặc sai scope | Missing/expired 428, invalid/mismatch 403, chưa auth 401; không allocation/order. Không lưu positive validation ở L1 để cho token cũ đi qua |
| A08 — TTL/release | Grant rồi preview, gây checkout failure, ngừng gửi request; chờ qua 300 giây | Không release sớm, không renewal; hết deadline trả đúng một lease; waiting buyer tiếp tục được grant. Xóa WAITING đóng ticket; DELETE khi ADMITTED không giải phóng sớm |
| A09 — Expiry khi chạy | Bắt đầu execution gần deadline, giữ qua deadline; xen kẽ success/expiry và cấp lease mới | Lease cũ thu hồi một lần; execution slot vẫn bị giữ khi công việc còn chạy; delayed completion không thu hồi lease mới, không tự hoàn quota chỉ vì token hết hạn |
| A10 — Lost success | Cho commit thành công rồi chặn response về client bằng hook/proxy; gọi authenticated result lookup bằng order key cũ | Tìm được đúng kết quả dù lease đã trả; không tạo thêm order/claim/consumption. Chỉ timeout client không đủ chứng minh response bị mất sau commit |
| Q01 — Suất cuối | Quota 1, nhiều buyer đã admitted cùng confirm; retry có giới hạn với buyer nhận 429 | Cuối cùng đúng một đơn vị sale thành công; quota không âm, stock giảm đúng một; loser không có consumption. Phân biệt quota loser với overload loser |
| Q02 — Một buyer/nhiều biến thể | Cùng buyer mua SKU-A/SKU-B của cùng product/campaign bằng key khác nhau; thử quantity > 1 | Tổng đơn vị sale thành công cho buyer/product/campaign tối đa một; quantity không hợp lệ bị từ chối. SKU-C vẫn mua giá thường theo quy tắc thông thường |
| Q03 — Same-key | Gửi nhiều confirm cùng key/payload khi request đầu còn chạy; replay sau commit; đổi payload cùng key | Một execution nghiệp vụ, một kết quả logic; request đang xử lý không khởi động execution thứ hai; replay không trừ lại quota; payload khác conflict |
| Q04 — Mixed/voucher/rollback | Mixed cart, voucher đạt/không đạt ngưỡng sau sale; gây rollback xác định trước commit | Giá/voucher đúng; failure không để lại order/claim/consumption/quota mất; ordinary stock không bị trừ riêng khi toàn lệnh rollback; lease không trả sớm |
| Q05 — Hủy trùng | Hủy hoặc seller reject đơn sale nhiều lần, cả trước và sau kết thúc participation | Physical stock hoàn đúng một lần; còn hiệu lực thì hoàn sale quota, đã kết thúc thì chỉ hoàn stock thường; claim mua vẫn tồn tại, buyer không được mua sale lại |
| Q06 — Seller/race | Sửa quota trước start; sửa khi active quota > 0; tại quota 0 chạy replenish/end đồng thời và cancellation/replenish | Trước start cho sửa nếu bảo chứng; active quota > 0 từ chối; tại 0 áp dụng version/idempotency, kết quả tương ứng một thứ tự hợp lệ; không reopen sau end, không double restock, giữ nguyên giá/claim |
| Q07 — Stock backing | Stock = quota; ordinary reservation/giảm kho cạnh tranh đăng ký hoặc replenish; có cả hold hiện hữu | Không giảm stock khả dụng dưới phần đã bảo vệ; không double-deduct physical stock; command thất bại không ghi một phần |
| Q08 — Outbox/race | Giữ một allocation đang chạy; deliver duplicate/delayed outbox và public fill cũ sau replenish/cancel | Delta không áp dụng hai lần; snapshot cũ không ghi đè version mới hoặc reset live quota đang phân bổ; cuối cùng Redis/DB hội tụ đúng |

A08 cần ít nhất 300 giây cộng độ trễ xử lý. Trong POC local có thể đặt `T35_POC_LEASE_TTL_MS` (tối thiểu 1 giây) để debug nhanh; kết quả đó không thay thế lượt nghiệm thu TTL 300 giây. A09 có thể đặt `T35_POC_ADMISSION_TTL_MS` cùng `T35_POC_HOLD_MS` để giữ confirmation qua thời điểm hết TTL nội bộ; cả hai biến chỉ phục vụ local diagnostics và mặc định không thay đổi TTL production. A09 đầy đủ vẫn phải giữ execution đủ lâu để phát hiện các TTL nội bộ ngắn hơn lease.

## 5. Kịch bản P1 — Ba phase và public cache

Chạy correctness ở mục 4 trước. Profile khởi đầu local: 10 VU → 25 VU → 50 VU, mỗi mức 60 giây, nghỉ và đối soát giữa các mức. Đây là mức khám phá, không phải yêu cầu công suất; ghi tài nguyên máy và giảm/dừng nếu quá tải. Public-read VU có thể lớn hơn 20; 20 chỉ giới hạn buyer lease.

| ID / phase | Cách chạy | Bằng chứng cần thu |
| --- | --- | --- |
| R01 — Trước sale | Poll status mỗi 10–15 giây có jitter; một lượt refresh burst riêng; đi qua startsAt, refresh trong 0–500 ms sau mốc | Không mua sớm; countdown dùng server time; cold fill được gom theo key, warm read có L1/L2 hit; snapshot không giữ UPCOMING qua boundary |
| R02 — Peak | Trộn public reads, admission join/status, preview và COD; poll sale 3–5 giây, waiting room 5–10 giây theo hướng dẫn server | Pool ≤20, execution ≤5, 429 có backoff; allocation transactions không tăng theo toàn bộ read/poll traffic. Ghi riêng traffic hợp lệ và burst refresh cố ý |
| R03 — Sold out | Làm quota về 0, tiếp tục poll 3–5 giây, seller replenish rồi lượt riêng seller end; thêm cancellation restoration | Sold-out mất nhãn sale nhưng SKU vẫn không mua được dù stock thường còn; replenish phục hồi sale; end trở về giá/tồn thường. Không auto-submit khi có quota |
| R04 — Cache adversarial | Cold cache, warm cache, L1 miss/L2 hit; bỏ lỡ invalidation có chủ ý; delayed fill cũ sau mutation | Original snapshot age ≤2 giây, không gia hạn tuổi khi copy L2→L1; startsAt/endsAt giới hạn validity; fill cũ không ghi đè mới; không stampede DB hoặc ghi admission counters từ public fill |
| R05 — Boundaries/contracts | Request ngay trước/tại/sau startsAt và endsAt; status batch 1, 50, quá 50/ID sai | Start inclusive/end exclusive; validation đúng contract; response public không chứa quota/tồn riêng tư; checkout từ chối quote cũ cần review giá |

Đối với cold fill, so sánh số DB fill theo **cùng key và cùng thế hệ cache**, không đặt kỳ vọng một query duy nhất cho cả lượt chạy dài hơn TTL. Ghi configured fill concurrency và so sánh peak đo được với giới hạn đó.

Độ trễ hiển thị mục tiêu trong thiết kế là **≤8 giây** ở trang visible, mạng khỏe: snapshot tối đa 2 giây + poll tối đa 5 giây + request/render 1 giây. k6 chỉ đo thời điểm API trả trạng thái mới và nhịp poll mô phỏng; không tuyên bố đã đạt render/UI target bằng k6. Hidden tab, network failure và overload backoff được báo cáo riêng.

## 6. Đối soát và tiêu chí dừng

Sau mỗi scenario: ngừng tạo traffic mới, đợi execution hoàn tất và outbox cần thiết được xử lý, lấy snapshot DB/Redis rồi đối chiếu baseline. Không reset khi còn transaction hoặc message cũ có thể tác động fixture.

- `physical_final = physical_initial + stock_added - stock_removed - committed_purchase_units + restored_units`, áp dụng theo SKU và mô hình kho thực tế. Holds/reservations được đối chiếu riêng theo schema, không trừ hai lần vào physical stock.
- Với participation còn hiệu lực: `quota_final = quota_initial + replenished_units - committed_sale_units + eligible_reversed_units`, sau khi không còn allocation tạm. Khi participation đã end, đối chiếu giải phóng bảo chứng và reversal thường riêng; không ép công thức live quota lên trạng thái ended.
- Số claim theo buyer/product/campaign ≤1 và không xóa khi hủy; consumption liên kết đúng dòng sale; mỗi dòng chỉ có một hiệu ứng reversal. Mixed cart có thể có nhiều dòng, không đồng nhất số order với số consumption.
- Mỗi order key chỉ có một kết quả nghiệp vụ; không cộng replay response thành đơn mới. Cùng một command không chạy song song hai execution.
- Peak active lease ≤20; peak actual execution ≤5; sau khi hoàn tất không còn slot bị rò rỉ. Số grant lịch sử có thể vượt 20 hợp lệ.
- Tất cả loser của gate/quota/limit không mở allocation transaction. Các DB read tối thiểu để auth/classification phải đo riêng.

**Dừng ngay lượt tăng tải** nếu oversell, quota/stock âm, vượt pool/budget, duplicate order/reversal hoặc counter rò rỉ. Lưu bằng chứng trước reset. Với 5xx/timeout bất thường, dừng tăng VU, phân tích riêng; không tự retry không giới hạn để làm kết quả đẹp hơn.

HTTP 429, 403, 428 hoặc conflict có thể là kết quả mong đợi của một scenario. Script phải check mã lỗi nghiệp vụ, header và bất biến tương ứng; không dùng duy nhất `http_req_failed == 0` cho toàn suite. Tách rejection latency khỏi successful-order latency. Chưa đặt ngưỡng p95 production khi chưa có baseline.

## 7. Bộ script đề xuất và thứ tự thực hiện

Các artifact đã triển khai cho POC:

| Ưu tiên | Artifact cần bổ sung | Vai trò |
| --- | --- | --- |
| P0 | `scripts/poc/t35/prepare.mjs`, `verify.mjs` | Tạo manifest run và kiểm tra snapshot counter/invariant; không seed hoặc ghi credential |
| P0 | `scripts/poc/t35/lib.js` | Auth/cookie theo buyer, join/poll, preview, confirm, bounded retry, metrics |
| P0 | `scripts/poc/t35/smoke.js` | A01 và kiểm tra topology runtime thật |
| P0 | `scripts/poc/t35/admission.js` | A02 và các bài admission theo `SCENARIO` |
| P0 | `scripts/poc/t35/contention.js` | Q01–Q08, dùng fixture/barrier riêng từng case |
| P1 | `scripts/poc/t35/phases.js` | R01–R05, public cache profile và số đo độ trễ |
| P1 | Thư mục kết quả local theo runId | k6 summary, cấu hình, counter timeline, DB reconciliation, báo cáo PASS/FAIL/BLOCKED |

Từ repository root dùng mẫu PowerShell sau; `FIXTURE_PATH`, `BASE_URL`, `CONTROL_PLANE_URL` và `SCENARIO` là interface của harness:

```powershell
k6 run -e BASE_URL=http://localhost:3001/api/v1 -e CONTROL_PLANE_URL=http://localhost:3001/api/v1 -e FIXTURE_PATH=./fixtures.local.json scripts/poc/t35/smoke.js
k6 run -e BASE_URL=http://localhost:3001/api/v1 -e CONTROL_PLANE_URL=http://localhost:3001/api/v1 -e FIXTURE_PATH=./fixtures.local.json -e SCENARIO=A02 scripts/poc/t35/admission.js
```

URL/cổng trên chỉ minh họa, thay bằng môi trường thật. Control plane có thể dùng URL khác backend khi deploy Lambda local; không hardcode chung hai URL trong script. Chạy `node scripts/poc/t35/verify.mjs <result.json>` sau từng scenario.

Thứ tự: môi trường/observability → Lambda preflight → fixture/smoke → admission → contention → ba phase → tổng hợp. Chỉ tăng tải sau khi correctness pass; chạy lại race trên nhiều fixture mới và ghi số lần lặp cụ thể. Không chạy cả suite cùng lúc trên một quota chung.

## 8. Báo cáo kết quả và liên kết task

Mẫu cho mỗi lượt:

```text
Run ID / thời gian:
Git revision + mô tả working tree (nếu chưa commit):
Máy / CPU / RAM / phiên bản k6, API, Redis, PostgreSQL, LocalStack:
Topology thực tế / Lambda invocation evidence:
Scenario / fixture / VU / thời lượng / số lần lặp / hook bật:
Kỳ vọng:
Số order thành công / replay / rejection theo mã / lỗi bất ngờ:
Peak lease / peak actual execution / slot sau settle:
L1/L2 hit/miss / DB fill / allocation transactions:
p50 / p95 / p99 theo endpoint và nhóm kết quả:
Quota / stock / claim / consumption / reversal trước-sau:
Độ trễ quan sát trạng thái / outbox settle time:
Bằng chứng và lỗi phát hiện:
Kết luận: NOT RUN | BLOCKED | PASS | FAIL
```

| Task hiện có | Bằng chứng từ POC |
| --- | --- |
| 1.21 | Q01–Q08 và đối soát contention/load có thể tái lập |
| 1.28 | R01–R05 trên một API, Redis/PostgreSQL thật, counters và latency |
| 1.32 | A01–A10 với LocalStack Lambda thật, bổ sung các kiểm chứng sale liên quan |
| 2.12, 2.13, 2.16, 2.18 | Tiếp tục để mở phần browser/E2E/visual: k6 không chứng minh refresh/tab lifecycle, cookie browser policy, focus/layout hoặc render delay |

Không tự đánh dấu task hoàn thành chỉ vì một script exit code 0. Tổng hợp HTTP checks, quan sát execution và đối soát DB/Redis; nêu rõ case BLOCKED/chưa chạy và topology còn thiếu.

# T35 k6 harness

Các script đọc fixture JSON từ `FIXTURE_PATH`. Fixture phải dùng buyer/session/cart thật của môi trường POC và không được commit credential. Sao chép `fixtures.local.example.json` thành file local rồi điền access token, cart version, địa chỉ, payload preview và fingerprint được API trả về.

Khi chạy topology Lambda, bật `ADMISSION_LAMBDA_ENABLED=true`, đặt cùng giá trị `ADMISSION_LAMBDA_SHARED_SECRET` cho API và setup, rồi chạy:

```powershell
$env:ADMISSION_LAMBDA_DEPLOY='true'
pnpm --filter @shopee-clone/api admission:localstack:setup
```

Docker Desktop cần cho phép Lambda container gọi `host.docker.internal:3001`; nếu API dùng cổng khác, đổi `ADMISSION_LAMBDA_GRANT_URL`.

Tạo manifest trước khi chạy và đối soát snapshot sau khi settle:

```powershell
$env:FIXTURE_PATH='./scripts/poc/t35/fixtures.local.json'
$env:POC_MANIFEST='./tmp/t35-poc-run.json'
node scripts/poc/t35/prepare.mjs
node scripts/poc/t35/verify.mjs ./tmp/t35-result.json
```

```powershell
k6 run -e FIXTURE_PATH=./scripts/poc/t35/fixtures.local.json -e BASE_URL=http://127.0.0.1:3001/api/v1 scripts/poc/t35/smoke.js
k6 run -e FIXTURE_PATH=./scripts/poc/t35/fixtures.local.json -e SCENARIO=A02 scripts/poc/t35/admission.js
k6 run -e FIXTURE_PATH=./scripts/poc/t35/fixtures.local.json -e SCENARIO=Q01 scripts/poc/t35/contention.js
k6 run -e FIXTURE_PATH=./scripts/poc/t35/fixtures.local.json -e PHASE=active scripts/poc/t35/phases.js
```

`A02` mặc định dùng 21 VU để kiểm tra pool 20 lease. `Q01`/`Q03`/`Q05` cần fixture riêng và cần đối soát DB/Redis sau run; HTTP exit code 0 không đủ để kết luận PASS. Bộ harness không tạo user, không seed database và không giả lập được browser cookie policy. Các scenario cần barrier giữ năm execution phải bật hook POC ở server trước khi chạy; nếu không có barrier thì kết quả chỉ là tải gần đồng thời, không phải chứng minh peak execution bằng 5.

Để chạy chẩn đoán expiry trong local, `A08` nhận `T35_POC_LEASE_TTL_MS` (mặc định 300000 ms). `A09` dùng `T35_POC_ADMISSION_TTL_MS` kết hợp `T35_POC_HOLD_MS` để giữ confirmation qua TTL nội bộ; các biến này không dùng trên deployment production.

## Admission relinquishment POC — 100 buyers / 40 leases / 10 stock

`admission-relinquishment.mjs` là harness Node chạy trực tiếp qua API thật, giữ
cookie `sc_admission` riêng cho từng fixture buyer và không dùng Playwright. Mặc
định script chỉ preflight; thêm `--run` mới gửi traffic. Kết quả luôn được ghi
vào `result/t35-admission-100-buyers-40-leases-10-stock/` với ba file:

- `result.json`: event chi tiết từng buyer, phase, snapshot Redis/PostgreSQL và invariant.
- `buyer-wait-times.csv`: đúng 100 dòng buyer, timestamp, `waitMs`, admission wave và outcome.
- `summary.md`: tổng hợp phase, latency/wait, dependency matrix và failure analysis.

Scenario thực hiện 100 join đồng thời trên một SKU đã có `remaining_quantity=10`;
5 buyer đầu tiên tạo seed orders để còn 5 quota; sau đó chạy 6 wave cách nhau
2 giây, mỗi wave 10 buyer admitted relinquish explicit (wave cuối có thể chỉ
cấp thêm 5 waiter), rồi 10 buyer cuối confirm đồng thời. Harness giải phóng
lease dư sau final wave để không làm bẩn Redis local.

Provision fixture trên test DB (không dùng dev DB):

```powershell
$env:TEST_DATABASE_URL='postgresql://.../shopee_clone_test'
$env:T35_POC_BASE_URL='http://127.0.0.1:3001/api/v1'
$env:T35_POC_CAMPAIGN_ID='...'
$env:T35_POC_BUYERS='100'
$env:T35_POC_EXPECTED_REMAINING='10'
$env:T35_POC_RESET_SKU_QUOTA='true'
$env:T35_POC_DIRECT_AUTH='true'
$env:T35_POC_FIXTURE='../../.runtime/t35-admission-100-buyers.json'
pnpm --filter @shopee-clone/api exec tsx scripts/t35-poc-provision.ts
```

Hai biến `RESET_SKU_QUOTA` và `DIRECT_AUTH` chỉ chạy khi tên database kết thúc
bằng `_test`. Chúng chuẩn hóa một seed SKU sạch về quota 10 và tạo session buyer
trực tiếp trong test DB để không vô hiệu hóa rate limit đăng ký của API. Script
từ chối reset nếu SKU đã có claim/consumption hoặc tồn kho vật lý không đủ.
Nếu access token 15 phút hết hạn trước khi tái chạy, đặt
`T35_POC_REISSUE_FIXTURE_AUTH=true` với cùng `TEST_DATABASE_URL` và fixture để
phát lại token cho session test hiện có; token vẫn không được ghi vào `result/`.

API local POC có thể mở pool 40 bằng env chỉ dành cho non-production; mặc định
production vẫn hard-cap 20:

```powershell
$env:T35_POC_MAX_LEASES='40'
$env:TRAFFIC_ADMISSION_MAX_OUTSTANDING='40'
$env:T35_POC_HOLD_MS='250'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
pnpm --filter @shopee-clone/api dev
$env:T35_ADMISSION_FIXTURE='.runtime/t35-admission-100-buyers.json'
node scripts/poc/t35/admission-relinquishment.mjs --run
```

Lượt đo PASS ngày 2026-09-09 được lưu tại
`result/t35-admission-100-buyers-40-leases-10-stock/`. Khi API trả 429 do
contention, harness chỉ retry có giới hạn bằng đúng order idempotency key cũ;
không retry conflict 409 và không retry vô hạn để làm đẹp kết quả.

Preflight ghi rõ availability nhưng không suy diễn correctness/recovery:

| Dependency            | Availability                                                   | Correctness evidence                           | Recovery evidence                                 |
| --------------------- | -------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| API                   | HTTP probe + per-request status                                | phase/invariant trong `result.json`            | không claim nếu API down hoặc request lỗi         |
| Redis                 | `PING/PONG` + admission/slot snapshots                         | lease peak, pending release, cleanup           | không claim Redis outage recovery                 |
| PostgreSQL            | `SELECT 1` + SKU/claim/order snapshot trên `TEST_DATABASE_URL` | quota/claim/order invariants theo 100 user     | không claim DB recovery                           |
| LocalStack SQS/Lambda | health probe khi API bật SQS/Lambda                            | chỉ claim delivery nếu API cấu hình queue thật | không claim Lambda retry/recovery nếu unavailable |

API/Redis/PostgreSQL/LocalStack thiếu bất kỳ dependency bắt buộc nào sẽ tạo
artifact `BLOCKED`/`NOT_RUN`; script không tạo số đo giả và không tick task 1.28
hoặc 1.32.

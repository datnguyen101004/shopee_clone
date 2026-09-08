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

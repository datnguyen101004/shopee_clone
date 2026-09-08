# T35 Flash Sale — flow và local runbook

## Luồng thực tế

1. Seller đăng ký từng biến thể SKU trước `startsAt`. Backend kiểm tra ownership,
   giá cố định, quota nguyên dương và `inventory.available >= quota`, sau đó ghi
   `FlashSaleSku` cùng outbox trong một transaction.
2. Trước giờ mở, seller chỉ sửa được quota. Khi campaign đã chạy, quota dương bị
   khóa. SKU đã bán hết có thể `replenish` hoặc `end`; cả hai dùng `version` để
   chống ghi đè và không đổi giá.
3. Buyer đọc status theo batch (tối đa 50 variant). Public status đi qua L1 trong
   process, Redis L2 và fill có single-flight/lease; dữ liệu public không chứa
   quota chính xác hay claim cá nhân.
4. Cart chỉ có sản phẩm thường bypass waiting room. Cart có ít nhất một SKU
   Flash Sale được server phân loại và đi qua waiting room; Redis lưu ticket,
   token opaque và deadline lease 300 giây. COD preview chỉ xác thực token và
   không chiếm confirmation slot. COD confirm kiểm tra lại cart version, dùng
   Redis atomic admission tối đa 5 confirmation đồng thời trước transaction
   Serializable, rồi trong cùng transaction ghi order, inventory
   reservation/consumption, voucher, claim buyer-product và quota.
5. Một buyer chỉ có một claim cho `(campaign, product)`. Vì vậy hai sibling SKU
   của cùng product không thể tạo hai claim. Claim vẫn tồn tại sau hủy; quota
   được hoàn lại nếu campaign/SKU còn live, còn sau end thì unit về kho thường.
6. Seller reject và buyer cancel dùng compensation marker để physical inventory
   chỉ hoàn một lần. Outbox snapshot mang `stateVersion` và `managementEpoch`;
   mutation cũng xoá public cache để request kế tiếp revalidate.

## Chạy local

```powershell
Copy-Item .env.example .env
docker compose up -d postgres redis
docker compose --profile admission up -d localstack
pnpm --filter @shopee-clone/api admission:localstack:setup
pnpm --filter @shopee-clone/api db:migrate:deploy
pnpm --filter @shopee-clone/api db:seed
pnpm --filter @shopee-clone/api flash-sale:verify
pnpm --filter @shopee-clone/api typecheck
pnpm --filter @shopee-clone/api test
pnpm --filter @shopee-clone/web typecheck
pnpm --filter @shopee-clone/web test
pnpm --filter @shopee-clone/web build
```

`FLASH_SALE_SKU_ENABLED` dùng để bật rollout SKU path sau khi migration và
fixtures đã sẵn sàng; `.env.example` để `false`. `TRAFFIC_ADMISSION_ENABLED`
chỉ bật waiting room khi muốn kiểm tra ingress local. Khi bật admission, Redis
phải sẵn sàng; không dùng fallback token/quota process-local. Đặt
`ADMISSION_SQS_ENABLED=true` và `ADMISSION_SQS_QUEUE_URL` từ lệnh setup nếu
muốn chạy SQS Standard/LocalStack worker. LocalStack chỉ là control-plane POC,
không phải topology production.

Các acceptance cần Playwright, hai API instance hoặc load harness được giữ lại
cho bước E2E/performance riêng. Unit/typecheck/build ở trên không được hiểu là
đã đo capacity hay cam kết throughput.

Kiểm tra local đã đo được: API `148` suite pass (`781` test), migration deploy
không còn pending, seed tạo `1` Flash Sale SKU và `flash-sale:verify` pass; FE
typecheck/build pass và `95` suite ngoài test return workflow hiện hữu pass
(`411` test). Full FE run còn một failure không liên quan tại
`components/returns/return-workflows.test.tsx`, nơi assertion đọc nhãn trạng
thái trong option trước khi dữ liệu queue render.

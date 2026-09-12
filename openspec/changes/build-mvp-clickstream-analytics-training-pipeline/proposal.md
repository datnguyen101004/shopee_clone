## Why

Shopee Clone cần một pipeline clickstream tối giản có thể chạy được cho demo: vừa cung cấp CTR theo sản phẩm cho seller, vừa tạo `training.csv` hằng ngày cho personal ranking. Kiến trúc ưu tiên chi phí thấp và happy path ở giai đoạn MVP; retry, recovery và các failure path được chấp nhận là technical debt ngoài phạm vi change.

## What Changes

- Nhận batch clickstream tại AWS API Gateway, chuyển qua Lambda ingestion và Kinesis Data Firehose để ghi dữ liệu bất biến vào S3 Raw.
- Chuẩn hóa payload tối thiểu phục vụ hai nhánh, bao gồm event ID, event type, UTC timestamp, shop, product, buyer/session pseudonym và context hiển thị cần thiết.
- Tạo Athena table/view trên dữ liệu S3 Raw và cho seller query tỷ lệ click trên lượt xuất hiện của sản phẩm qua endpoint CTR có xác thực quyền sở hữu shop.
- Định nghĩa CTR theo khoảng thời gian bằng `product_clicked / product_impression`, trả về số impression, số click và tỷ lệ CTR; endpoint chỉ đọc dữ liệu của shop hiện tại.
- Tạo Glue ETL chạy lúc 04:00 hằng ngày theo múi giờ `Asia/Ho_Chi_Minh`, xử lý dữ liệu của ngày hoàn chỉnh trước đó từ S3 Raw sang S3 Processed.
- Xuất một `training.csv` có version theo ngày chạy để Model Training tiêu thụ; việc huấn luyện, đánh giá và deploy model nằm ngoài change này.
- Giới hạn implementation và kiểm thử ở happy path. Retry, DLQ, replay, backfill, late-event correction, deduplication nâng cao, cảnh báo, tự phục hồi và rollback tự động đều ngoài phạm vi MVP.

## Capabilities

### New Capabilities

- `clickstream-firehose-raw-ingestion`: Nhận batch qua API Gateway và Lambda, chuyển tới Firehose, rồi lưu clickstream có schema và partition vào S3 Raw.
- `seller-product-ctr-query`: Định nghĩa Athena dataset/query và seller REST endpoint để đọc impression, click và CTR của sản phẩm thuộc shop theo thời gian.
- `daily-ranking-training-dataset`: Chạy Glue ETL lúc 04:00 mỗi ngày, tạo dữ liệu processed và `training.csv` theo ngày cho bước Model Training kế tiếp.

### Modified Capabilities

None. Change bắt đầu tại API Gateway và không thay đổi contract nghiệp vụ search/recommendation hiện có; producer phía ứng dụng và model training được xem là ranh giới tích hợp bên ngoài.

## Impact

- **AWS:** API Gateway route/integration, Lambda ingestion, Kinesis Data Firehose, S3 Raw, Glue Data Catalog/Athena, Glue ETL schedule và S3 Processed. Mỗi thành phần dùng IAM role riêng với least privilege.
- **Backend:** Thêm seller-authenticated CTR endpoint và Athena query adapter; không thêm database bảng clickstream hoặc worker polling trong API process.
- **Data:** Thêm schema raw có version, S3 partition convention, Athena DDL/view, processed dataset và contract `training.csv`.
- **Security:** Seller chỉ query sản phẩm thuộc shop của mình; clickstream dùng buyer/session pseudonym và không chứa credential, email, địa chỉ hoặc thông tin thanh toán.
- **Operations:** MVP không cam kết exactly-once, tự retry end-to-end hoặc khôi phục tự động. Nếu một stage lỗi, việc phát hiện và chạy lại là thủ công.
- **Cost/performance:** Firehose và S3 phù hợp ghi rẻ theo batch; Athena tránh vận hành analytics database nhưng mỗi request có độ trễ truy vấn và chi phí theo bytes scanned. Partitioning và projection cột giới hạn lượng dữ liệu quét.
- **Testing:** Chỉ yêu cầu unit/contract/integration happy-path cần thiết; không yêu cầu E2E hoặc forced-failure tests trong change này.

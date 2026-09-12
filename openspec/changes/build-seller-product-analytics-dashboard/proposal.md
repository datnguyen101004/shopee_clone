## Why

Màn hình CTR theo một sản phẩm không đủ để seller hiểu toàn bộ phễu từ lúc sản phẩm xuất hiện đến khi tạo doanh thu. Seller cần một màn hình phân tích thống nhất, chọn được khoảng thời gian và nhìn thấy mức thay đổi so với kỳ liền trước.

## What Changes

- Thay UI CTR cũ trong `/seller/analytics` bằng dashboard phân tích tổng của shop và bảng chi tiết theo sản phẩm.
- Cho phép chọn `Today`, `Yesterday`, `Last 7 days`, `Last 30 days` hoặc khoảng ngày tùy chỉnh theo múi giờ của shop.
- Hiển thị Impressions, Product Views, Unique Visitors, Clicks, CTR, Add to Cart, Orders, Units Sold, Revenue và Conversion Rate.
- Trả về giá trị kỳ hiện tại, kỳ liền trước có cùng độ dài và phần trăm thay đổi cho từng metric.
- Ghi nhận riêng event mở trang chi tiết sản phẩm; tách nó khỏi click từ listing, search và recommendation.
- **BREAKING:** Thay endpoint CTR thử nghiệm theo một sản phẩm bằng endpoint seller analytics tổng hợp có seller authentication và shop scoping.
- Không thay đổi Glue training path, lịch 04:00 hoặc training dataset.

## Capabilities

### New Capabilities

- `seller-product-analytics-dashboard`: Dashboard seller theo khoảng thời gian, metrics phễu mua hàng, so sánh kỳ trước và chi tiết theo sản phẩm.
- `product-engagement-clickstream`: Ghi nhận và phân biệt impression, click từ bề mặt khám phá, product view và add-to-cart cho seller analytics.

### Modified Capabilities

Không có.

## Impact

- **Web:** `/seller/analytics`, seller navigation, dashboard cards/chart/table, clickstream capture trên trang chi tiết sản phẩm.
- **API/contracts:** seller analytics response contract, date-range parsing, Athena aggregation adapter, truy vấn PostgreSQL cho order/units/revenue.
- **Data:** S3 Raw/Athena bổ sung event product view; không cần migration PostgreSQL vì clickstream không lưu trong DB.
- **Compatibility:** UI và endpoint CTR thử nghiệm hiện tại được thay thế; training pipeline tiếp tục dùng các event cũ.

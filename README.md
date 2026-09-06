# Shopee Clone

Ứng dụng thương mại điện tử đa gian hàng với ba vai trò **Buyer**, **Seller** và **Admin**. Project triển khai các luồng từ tìm kiếm sản phẩm, giỏ hàng, thanh toán, giao nhận đến đánh giá, trả hàng và kiểm duyệt.

**Stack:** TypeScript · Next.js / React · NestJS · Prisma · PostgreSQL · Elasticsearch · Socket.IO. Frontend được host trên **AWS Amplify**; backend chạy trên **EC2**, kết nối **Amazon RDS for PostgreSQL** và sử dụng **S3 / CloudFront** cho media.

## 1. Hướng dẫn chạy dự án

### Yêu cầu

| Công cụ | Phiên bản / yêu cầu                          |
| ------- | -------------------------------------------- |
| Node.js | `22.12.0`, theo `.nvmrc`                     |
| pnpm    | `10.34.5`, theo `packageManager`             |
| Docker  | Docker Engine / Docker Desktop và Compose v2 |

### Cài đặt lần đầu

Chạy tại thư mục gốc của repository:

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

Trên PowerShell, thay lệnh sao chép bằng `Copy-Item .env.example .env`. Chỉ sao chép khi chưa có `.env` để giữ cấu hình hiện tại. Nếu Corepack không hoạt động, có thể gọi pnpm qua `npx --yes pnpm@10.34.5`.

File `.env` ở gốc cấu hình API, Prisma và Docker Compose. Các giá trị quan trọng khi chạy local:

```dotenv
NODE_ENV=development
DEV_ENV_FILE=.env
POSTGRES_USER=shopee_local
POSTGRES_PASSWORD=local_only_change_me
POSTGRES_DB=shopee_clone
POSTGRES_TEST_DB=shopee_clone_test
POSTGRES_PORT=5432
DATABASE_URL=postgresql://shopee_local:local_only_change_me@127.0.0.1:5432/shopee_clone
TEST_DATABASE_URL=postgresql://shopee_local:local_only_change_me@127.0.0.1:5432/shopee_clone_test
PORT=3001
AUTH_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
AUTH_WEB_BASE_URL=http://localhost:3000
AUTH_COOKIE_SECURE=false
```

Giữ các biến còn lại theo [`.env.example`](.env.example). Giá trị mẫu dành cho local; credential OAuth, cổng thanh toán và AWS được cấu hình riêng trong môi trường chạy.

Next.js chạy tại `apps/web`. Khi cần khai báo rõ địa chỉ API, tạo `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
HOMEPAGE_API_BASE_URL=http://127.0.0.1:3001
```

Khởi tạo PostgreSQL và dữ liệu mẫu:

```bash
docker compose up --detach --wait postgres
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
```

Seed nhập danh mục, shop, sản phẩm, biến thể, ảnh và dữ liệu trang chủ từ bộ dữ liệu trong `asserts/`. Với database đã có dữ liệu, chỉ cần chạy migration còn thiếu; không cần seed lại mỗi lần khởi động.

### Khởi động và dừng

```bash
pnpm dev
```

Lệnh trên chạy Next.js, NestJS API và Demo Carrier ở chế độ phát triển. Có thể chạy riêng bằng `pnpm dev:web`, `pnpm dev:api` và `pnpm --filter @shopee-clone/demo-carrier dev`.

| Dịch vụ             | Địa chỉ                                                                              |
| ------------------- | ------------------------------------------------------------------------------------ |
| Website             | [http://localhost:3000](http://localhost:3000)                                       |
| API health          | [http://127.0.0.1:3001/api/v1/health](http://127.0.0.1:3001/api/v1/health)           |
| Swagger API         | [http://localhost:3001/api/docs](http://localhost:3001/api/docs)                     |
| Web health          | [http://localhost:3000/health](http://localhost:3000/health)                         |
| Demo Carrier health | [http://127.0.0.1:3010/internal/v1/health](http://127.0.0.1:3010/internal/v1/health) |

Dừng các tiến trình bằng `Ctrl+C`; dừng container bằng `docker compose down`. Docker volume vẫn giữ dữ liệu. `pnpm infra:reset` và `pnpm db:reset` là các lệnh xóa/reset dữ liệu, không thuộc quy trình khởi động thông thường.

> `compose.yaml` hiện có PostgreSQL, API image và các profile `search`, `carrier`; không có service web hoặc profile `full`. Khi chạy source bằng `pnpm dev`, khởi động riêng service `postgres` như trên để tránh chạy thêm API container trùng cổng. `pnpm infra:up` gọi Compose không chỉ định service nên sẽ khởi động cả API image.

### Tài khoản buyer, seller và admin

1. Mở `/register` để tạo tài khoản buyer, sau đó đăng nhập tại `/login`. Các tài khoản catalogue do seed tạo mặc định không có mật khẩu đăng nhập.
2. Buyer mở **Đăng ký thành shop**, điền hồ sơ và gửi đăng ký. Admin duyệt shop tại `/admin/shops`; hệ thống kích hoạt shop và cấp quyền seller.
3. Để tạo **admin đầu tiên** trên database mới, đăng ký một tài khoản rồi đặt các biến sau trong `.env`:

```dotenv
RBAC_BOOTSTRAP_ADMIN_EMAIL=<email-tai-khoan-da-dang-ky>
RBAC_BOOTSTRAP_REASON=Khoi tao quan tri vien cho moi truong local
```

```bash
pnpm auth:roles:bootstrap-admin
```

Bootstrap chỉ dùng khi chưa có admin đang hoạt động. Sau đó quản lý vai trò bằng tài khoản admin hiện có. Đăng nhập lại để giao diện nhận quyền mới. Thông tin đăng nhập dùng chụp ảnh không được lưu trong README.

### Elasticsearch và các tích hợp tùy chọn

Catalogue có thể truy vấn PostgreSQL khi chưa bật Elasticsearch. Để dùng search index:

```bash
pnpm infra:search:up
pnpm search:bootstrap:personalized-script
pnpm search:reindex
pnpm search:reconcile
```

Đặt `SEARCH_ELASTICSEARCH_ENABLED=true` trong `.env`, rồi khởi động lại API. Các cờ `SEARCH_PERSONALIZATION_ENABLED` và `SEARCH_DAILY_RECOMMENDATIONS_ENABLED` bật cá nhân hóa và gợi ý hôm nay sau khi chuẩn bị profile/model:

```bash
pnpm recommendations:profiles
pnpm recommendations:seed
pnpm recommendations:train
pnpm recommendations:activate <model-version-vua-train>
```

| Tích hợp         | Cấu hình                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| COD              | Luồng checkout cơ bản, không cần credential cổng thanh toán                                                   |
| VNPAY / MoMo     | Bật `VNPAY_ENABLED` / `MOMO_ENABLED`, khai báo credential sandbox và callback/IPN có thể truy cập từ provider |
| Google đăng nhập | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`                                             |
| Demo Carrier     | `DEMO_CARRIER_ENABLED`, URL và cặp HMAC khớp giữa API và carrier; đây là dịch vụ mô phỏng                     |
| Media local      | Để trống `AWS_S3_BUCKET` để sử dụng filesystem fallback                                                       |
| Media AWS        | S3 private bucket, quyền IAM và `AWS_CLOUDFRONT_BASE_URL` / `AWS_S3_PUBLIC_BASE_URL`                          |

Chi tiết: [VNPAY](docs/vnpay-sandbox-payments.md), [MoMo](docs/momo-sandbox-payments.md), [xác thực](docs/authentication.md), [Demo Carrier](docs/t33-demo-carrier-local.md), [ảnh sản phẩm](docs/seller-products.md).

### Build và kiểm tra

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

Các lệnh E2E và kiểm tra database có yêu cầu môi trường riêng; xem [hướng dẫn local](docs/local-development.md). Database kiểm thử sử dụng `TEST_DATABASE_URL` riêng, có tên kết thúc bằng `_test`.

## 2. Tính năng chính và ảnh chụp ứng dụng

Ảnh được chụp ngày **03/09/2026**, từ ứng dụng local đang chạy với **API và PostgreSQL thật**, đăng nhập ba tài khoản tương ứng buyer, seller và admin. Ảnh desktop dùng viewport **1440 × 1000**, một số màn hình chụp toàn trang. Các danh sách trống phản ánh dữ liệu hiện có của tài khoản; ảnh không mô phỏng kết quả nghiệp vụ.

### Buyer — mua sắm và quản lý tài khoản

| Nhóm             | Tính năng                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| Khám phá         | Trang chủ, danh mục, Flash Sale, sản phẩm bán chạy, Mall, gợi ý hôm nay                             |
| Tìm kiếm         | Từ khóa, gợi ý tìm kiếm, lọc danh mục/nơi bán/giá/đánh giá/tồn kho, sắp xếp và phân trang           |
| Sản phẩm và shop | Gallery, phân loại hàng, giá, tồn kho, đánh giá, trang shop, theo dõi và chat                       |
| Mua hàng         | Giỏ hàng nhiều shop, chọn sản phẩm, voucher shop/sàn/vận chuyển, báo giá và phí giao hàng từ server |
| Thanh toán       | COD, redirect VNPAY/MoMo sandbox, tra cứu kết quả thanh toán                                        |
| Sau mua          | Danh sách đơn, timeline vận chuyển, hủy đơn theo điều kiện, đánh giá sau mua, trả hàng/hoàn tiền    |
| Cá nhân          | Hồ sơ, nhiều địa chỉ, yêu thích, đã xem, shop đang theo dõi, thông báo và báo cáo vi phạm           |

**Trang chủ và khám phá**

![Trang chủ buyer, danh mục và gợi ý sản phẩm](docs/images/features/buyer-home.png)

<details>
<summary>Tìm kiếm, chi tiết sản phẩm và gian hàng</summary>

![Tìm kiếm, bộ lọc và sắp xếp](docs/images/features/buyer-catalog.png)

![Chi tiết sản phẩm, giá, biến thể và đánh giá](docs/images/features/buyer-product.png)

![Trang shop và danh sách sản phẩm](docs/images/features/buyer-shop.png)

</details>

<details>
<summary>Giỏ hàng, voucher và checkout</summary>

![Giỏ hàng nhiều shop, voucher và bảng giá từ server](docs/images/features/buyer-cart.png)

![Checkout, địa chỉ, vận chuyển và phương thức thanh toán](docs/images/features/buyer-checkout.png)

</details>

<details>
<summary>Đơn mua, hành trình đơn hàng và trả hàng</summary>

![Danh sách đơn mua](docs/images/features/buyer-orders.png)

![Chi tiết đơn và timeline trạng thái](docs/images/features/buyer-order-detail.png)

![Yêu cầu trả hàng và hoàn tiền](docs/images/features/buyer-returns.png)

</details>

<details>
<summary>Đăng nhập, hồ sơ và địa chỉ</summary>

![Đăng nhập email hoặc Google](docs/images/features/login.png)

![Hồ sơ cá nhân](docs/images/features/buyer-profile.png)

![Địa chỉ giao hàng](docs/images/features/buyer-addresses.png)

</details>

<details>
<summary>Yêu thích, đã xem và theo dõi shop</summary>

![Sản phẩm yêu thích](docs/images/features/buyer-favorites.png)

![Sản phẩm đã xem](docs/images/features/buyer-recently-viewed.png)

![Shop đang theo dõi](docs/images/features/buyer-followed-shops.png)

</details>

<details>
<summary>Chat, thông báo và báo cáo vi phạm</summary>

![Chat nổi trong trang mua sắm](docs/images/features/buyer-chat.png)

![Hộp thư thông báo](docs/images/features/buyer-notifications.png)

![Cài đặt kênh thông báo](docs/images/features/buyer-notification-settings.png)

![Theo dõi báo cáo vi phạm](docs/images/features/buyer-reports.png)

</details>

### Seller — vận hành gian hàng

| Nhóm                | Tính năng                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Dashboard           | Tiền hàng, đơn hợp lệ, lượng bán, biểu đồ theo ngày/tuần/tháng và sản phẩm bán chạy               |
| Hồ sơ shop          | Thông tin liên hệ, mô tả, logo/banner, địa chỉ lấy/trả hàng, bật/tạm ngừng bán                    |
| Sản phẩm            | Tạo nháp, đăng bán, sửa, ẩn, lưu trữ/xóa mềm, nhiều ảnh, phân loại, biến thể, SKU và slug tự sinh |
| Tồn kho             | Hiện có, giữ chỗ, đã bán, khả dụng, cảnh báo sắp hết, điều chỉnh và lịch sử                       |
| Đơn hàng            | Xác nhận/từ chối, chuẩn bị hàng, bàn giao vận chuyển, theo dõi trạng thái và phiếu in             |
| Khuyến mãi          | Voucher shop, giảm theo số tiền/phần trăm, giới hạn sử dụng và lịch giảm giá sản phẩm             |
| Chăm sóc khách hàng | Chat, xem/báo cáo đánh giá, xử lý trả hàng và nhận thông báo kiểm duyệt                           |

**Dashboard người bán**

![KPI và biểu đồ vận hành shop](docs/images/features/seller-dashboard.png)

<details>
<summary>Sản phẩm, biến thể và tồn kho</summary>

![Danh sách sản phẩm của seller](docs/images/features/seller-products.png)

![Tạo sản phẩm với ảnh và phân loại](docs/images/features/seller-product-new.png)

![Cập nhật sản phẩm](docs/images/features/seller-product-edit.png)

![Tồn kho theo sản phẩm và SKU](docs/images/features/seller-inventory.png)

</details>

<details>
<summary>Đơn hàng, khuyến mãi và trả hàng</summary>

![Đơn bán và trạng thái chuẩn bị](docs/images/features/seller-orders.png)

![Voucher và lịch khuyến mãi shop](docs/images/features/seller-promotions.png)

![Yêu cầu trả hàng của shop](docs/images/features/seller-returns.png)

</details>

<details>
<summary>Hồ sơ shop, chat, đánh giá và kiểm duyệt</summary>

![Hồ sơ và địa chỉ vận hành shop](docs/images/features/seller-shop.png)

![Chat của seller](docs/images/features/seller-chat.png)

![Đánh giá sản phẩm của shop](docs/images/features/seller-reviews.png)

![Thông báo kiểm duyệt](docs/images/features/seller-moderation.png)

</details>

### Admin — quản trị sàn

| Nhóm       | Tính năng                                                                  |
| ---------- | -------------------------------------------------------------------------- |
| Tổng quan  | Thống kê tài khoản, shop, nội dung trang chủ và hoạt động quản trị         |
| Người dùng | Tìm kiếm, quản lý trạng thái, cấp/thu hồi quyền và ghi nhận lý do thao tác |
| Gian hàng  | Duyệt/từ chối đăng ký, xem hồ sơ, tạm ngưng và khôi phục shop              |
| Nội dung   | Kiểm soát sản phẩm, quản lý danh mục, banner và các khối trang chủ         |
| Chiến dịch | Chọn loại STANDARD, FLASH_SALE hoặc CHEAPEST_DEALS; publish/cancel, mời seller và theo dõi tham gia |
| Kiểm duyệt | Xử lý tố cáo sản phẩm/shop/đánh giá/tin nhắn, lưu hồ sơ và kết quả xử lý   |
| Tranh chấp | Xem yêu cầu trả hàng, bằng chứng và đưa ra quyết định theo quyền admin     |
| Audit      | Tra cứu nhật ký thao tác đặc quyền, đối tượng, lý do và thay đổi           |

**Trung tâm quản trị**

![Dashboard admin và tổng quan hệ thống](docs/images/features/admin-dashboard.png)

<details>
<summary>Người dùng, cửa hàng và danh mục</summary>

![Quản lý người dùng và vai trò](docs/images/features/admin-users.png)

![Duyệt và quản lý cửa hàng](docs/images/features/admin-shops.png)

![Quản lý danh mục](docs/images/features/admin-categories.png)

</details>

<details>
<summary>Sản phẩm, banner và kiểm duyệt</summary>

![Tra cứu và kiểm soát sản phẩm](docs/images/features/admin-products.png)

![Quản lý banner và các khối trang chủ](docs/images/features/admin-homepage.png)

![Hàng đợi kiểm duyệt và tố cáo](docs/images/features/admin-moderation.png)

</details>

Quản trị viên có thể tạo chiến dịch tại `/admin/campaigns`, chọn loại chương trình và xem preview trước khi publish. `FLASH_SALE` được registry đánh dấu `FEATURED`; các loại còn lại dùng importance `NORMAL`. Sau khi publish, type, importance và ranking profile được snapshot và khóa; mọi profile đều chịu global cap khi đưa vào ranking.

**Campaign flow**

- Seller mở `/seller/campaigns` để xem các chiến dịch đủ điều kiện, nhận thông báo trước hạn đăng ký, chọn sản phẩm và mức giảm riêng cho từng sản phẩm, hoặc từ chối/rút lui trước cutoff. Chi tiết sản phẩm tại `/seller/products/[productId]` hiển thị các campaign đang chạy, sắp tới và lịch sử.
- Buyer truy cập `/banner/:bannerId` để xem nội dung, lịch và sản phẩm đang bán. Kệ Flash Sale trên trang chủ chỉ lấy sản phẩm từ campaign `FLASH_SALE` đang active và dùng cùng nguồn giá authoritative với catalog, cart và checkout.
- Reservation dùng cửa sổ thời gian nửa kín `[startsAt, endsAt)` để chặn một sản phẩm tham gia hai chương trình trùng thời gian, bao gồm cả promotion của shop.

<details>
<summary>Tranh chấp trả hàng và nhật ký kiểm toán</summary>

![Yêu cầu trả hàng và tranh chấp](docs/images/features/admin-returns.png)

![Chi tiết yêu cầu trả hàng và kết quả xử lý](docs/images/features/admin-return-detail.png)

![Nhật ký kiểm toán thao tác đặc quyền](docs/images/features/admin-audit.png)

</details>

## 3. Kiến trúc ứng dụng

![Sơ đồ kiến trúc ứng dụng Shopee Clone](docs/images/architecture/application.png)

Backend là **modular monolith**: các module nghiệp vụ nằm trong một ứng dụng NestJS, cùng sử dụng PostgreSQL qua Prisma. Frontend trao đổi qua API và Socket.IO; quyền truy cập và quyền sở hữu tài nguyên được kiểm tra ở backend.

| Thành phần                   | Trách nhiệm                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| Next.js / React              | Storefront, tài khoản, seller console, admin console; kết hợp render phía server và tương tác phía client |
| NestJS                       | HTTP API, guards, xác thực, phân quyền, kiểm tra đầu vào, nghiệp vụ và Socket.IO gateway                  |
| PostgreSQL / Prisma          | Dữ liệu chuẩn, transaction, ràng buộc, lịch sử đơn hàng, payment, audit và trạng thái công việc nền       |
| Elasticsearch                | Read model cho tìm kiếm, gợi ý và xếp hạng; API đối chiếu trạng thái sản phẩm với PostgreSQL              |
| pg-boss / scheduler / outbox | Hết hạn giữ tồn, công việc định kỳ, xử lý sự kiện và phát thông báo; tích hợp trong API                   |
| S3 / CloudFront              | Lưu media và phân phối ảnh; hỗ trợ presigned upload, local có filesystem fallback                         |
| Packages dùng chung          | DTO/schema, validation, cấu hình và thành phần giao diện thống nhất                                       |

Các quyết định nghiệp vụ chính:

- **Giá do server quyết định:** checkout tính lại giá, voucher và phí ship; dữ liệu giá/địa chỉ được lưu thành snapshot của đơn.
- **Checkout nhiều shop:** một `Purchase` chứa các `ShopOrder`; mỗi shop xử lý phần đơn của mình.
- **Thanh toán có xác minh:** callback/IPN được kiểm tra chữ ký và dữ liệu giao dịch; trang redirect về web hiển thị trạng thái do API xác nhận.
- **Tìm kiếm có đường dự phòng:** Elasticsearch phục vụ tìm kiếm; PostgreSQL vẫn quyết định sản phẩm nào được hiển thị và mua.
- **Chat có lưu trữ:** Socket.IO truyền cập nhật thời gian thực, PostgreSQL lưu hội thoại/tin nhắn và trạng thái liên quan.
- **Phân quyền gắn với dữ liệu:** role đi cùng kiểm tra trạng thái tài khoản, shop và quyền sở hữu; audit ghi nhận thao tác đặc quyền.

```text
apps/web/                 Next.js: giao diện buyer, seller, admin
apps/api/                 NestJS: API, gateway, worker và Prisma
apps/api/prisma/          Schema, migrations, seed và import dataset
apps/demo-carrier/        Dịch vụ vận chuyển mô phỏng
packages/contracts/      Hợp đồng dữ liệu và validation dùng chung
packages/ui/             Design tokens và UI primitives
packages/config/         Cấu hình TypeScript / ESLint
asserts/                 Dataset sản phẩm và ảnh nguồn
docker/                  Dockerfile API, migrator và web
scripts/                 Công cụ dữ liệu, kiểm thử, deploy và chụp tài liệu
docs/                    Tài liệu nghiệp vụ, vận hành và hình ảnh
openspec/                Đặc tả, proposal và kế hoạch thay đổi
compose.yaml             Hạ tầng local và API image
compose-prod.yaml        API + Elasticsearch + migrator trên EC2
```

## 4. Kiến trúc deploy trên AWS

![Sơ đồ AWS: Amplify, ALB và ACM, EC2, RDS, CloudFront/S3, IAM role và SSM qua NAT](docs/images/architecture/aws-deployment.png)

Sơ đồ dùng [AWS Architecture Icons chính thức](https://aws.amazon.com/architecture/icons/). Bản [SVG](docs/images/architecture/aws-deployment.svg) nhúng sẵn icon để chỉnh sửa và xuất ảnh. Các dịch vụ và luồng mạng bên dưới theo cấu hình triển khai do chủ dự án xác nhận; cấu hình container và CI/CD được đối chiếu với repository.

| Thành phần                      | Vai trò trong triển khai hiện tại                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| AWS Amplify                     | Host frontend Next.js cho buyer, seller và admin                                                   |
| Application Load Balancer (ALB) | Nhận request HTTPS từ frontend, route qua target group đến EC2 và kiểm tra health của target       |
| AWS Certificate Manager (ACM)   | Cấp và quản lý chứng chỉ TLS được gắn vào HTTPS listener của ALB                                   |
| Amazon EC2                      | Chạy NestJS API, Elasticsearch, worker và migrator bằng Docker Compose; có SSM Agent để quản trị   |
| Amazon RDS for PostgreSQL       | Lưu dữ liệu nghiệp vụ, tách vòng đời database khỏi container API                                   |
| Amazon CloudFront               | Phục vụ ảnh cho frontend từ S3 origin qua CDN và Origin Access Control (OAC)                       |
| Amazon S3                       | Private bucket lưu media; frontend đọc ảnh qua CloudFront, backend thao tác S3 bằng quyền IAM role |
| IAM role / EC2 instance profile | Cấp quyền cho ứng dụng trên EC2 truy cập S3 và cho SSM Agent làm việc với Systems Manager          |
| NAT Gateway + Internet Gateway  | Cung cấp đường outbound từ EC2 trong private subnet đến public endpoint của SSM                    |
| AWS Systems Manager             | Session Manager / SSH over SSM để quản trị EC2; Run Command phục vụ pipeline deploy                |
| Docker Hub + GitHub Actions     | Build/publish API và migrator; workflow nhận quyền AWS tạm thời bằng OIDC để gọi SSM               |

### Các luồng truy cập

1. **Frontend → ALB → EC2:** người dùng mở ứng dụng trên Amplify; frontend gọi API qua HTTPS tới ALB. ALB sử dụng chứng chỉ do ACM quản lý và chuyển request tới EC2 theo target group. ACM gắn chứng chỉ vào listener, không nằm trên đường truyền request. [Tài liệu HTTPS listener của AWS](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html).
2. **Frontend → CloudFront → S3:** frontend tải ảnh bằng URL CloudFront. CloudFront đọc object từ private S3 origin theo OAC và phục vụ nội dung qua CDN.
3. **EC2 → S3 bằng IAM role:** AWS SDK trong backend dùng credential tạm thời từ instance profile. IAM role quyết định quyền thao tác S3, không phải gateway chuyển tiếp traffic. Mũi tên này biểu diễn quyền truy cập logic, không khẳng định đường mạng S3 sử dụng NAT hay VPC endpoint.
4. **EC2 → NAT → Internet Gateway → SSM:** SSM Agent chủ động mở kết nối outbound HTTPS cổng 443 tới các endpoint Systems Manager. Sơ đồ thể hiện đúng đường qua NAT đang sử dụng. [Tài liệu kết nối của SSM Agent](https://docs.aws.amazon.com/systems-manager/latest/userguide/troubleshooting-ssm-agent.html).
5. **Quản trị viên → SSM → phiên trên EC2:** quản trị viên mở Session Manager hoặc SSH over SSM. Phiên quản trị sử dụng kênh do agent thiết lập ở luồng 4; không cần mở cổng SSH 22 ra Internet. [Tài liệu Session Manager](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html).

Mũi tên liền thể hiện chiều khởi tạo request; response đi ngược chiều. Nét đứt thể hiện quan hệ cấp quyền hoặc gắn chứng chỉ. Public/private subnet được gom theo chức năng, không biểu diễn số Availability Zone hoặc số instance thực tế.

### Luồng deploy backend

Workflow [Development CICD](.github/workflows/cicd.yml) được chạy thủ công bằng **Run workflow**, chọn nhánh **`development`**:

1. Kiểm tra Compose, Prisma, lint, typecheck, test độc lập database và build API/contracts.
2. Build hai image API runtime và Prisma migrator; push lên Docker Hub với **full Git commit SHA** và tag tiện dụng `development`.
3. GitHub Actions assume IAM role bằng OIDC, rồi gọi SSM đến EC2.
4. EC2 kiểm tra và cập nhật `compose-prod.yaml`, giữ bản trước ở `compose-prod.yaml.previous`.
5. Pull image đúng commit; migrator chạy `prisma migrate deploy` vào RDS bằng `.env.production` trên EC2.
6. Recreate Elasticsearch/API và chờ API đạt healthcheck.

Pipeline này deploy backend; cấu hình build/deploy Amplify được quản lý riêng. Workflow không chạy seed, frontend tests hoặc browser E2E. Tham khảo [hướng dẫn CI/CD](docs/development-cicd.md), [script SSM](scripts/deploy-development-via-ssm.sh) và [Compose deploy](compose-prod.yaml).

### Ưu điểm của kiến trúc hiện tại

| Quyết định                      | Lợi ích                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Tách Amplify, EC2 và RDS        | Frontend, API và database có vòng đời triển khai riêng; cập nhật giao diện không yêu cầu dựng lại database/backend          |
| Modular monolith                | Nghiệp vụ nằm trong module rõ ràng, thuận tiện phát triển/debug; đơn hàng, tồn kho và payment có thể dùng transaction chung |
| RDS tách khỏi container         | Recreate API không làm mất database; giảm phần việc tự vận hành PostgreSQL trên máy ứng dụng                                |
| Elasticsearch riêng cho search  | Tìm kiếm, gợi ý và xếp hạng phát triển độc lập với mô hình ghi nghiệp vụ; vẫn có PostgreSQL fallback                        |
| S3 + CloudFront                 | Ảnh được phục vụ qua CDN, giảm tải truyền media cho API; bucket giữ private và upload có thời hạn                           |
| Image theo commit SHA           | Truy vết phiên bản đang chạy và tái sử dụng đúng artifact giữa CI và EC2                                                    |
| OIDC + SSM                      | CI dùng phiên quyền AWS tạm thời, không cần lưu AWS access key dài hạn hoặc SSH key để deploy                               |
| Migrator riêng và healthcheck   | Kiểm soát thứ tự đổi schema trước khi thay API; phát hiện container khởi động không thành công                              |
| PostgreSQL-backed jobs / outbox | Trạng thái công việc được lưu bền vững, tận dụng database hiện có và giảm số dịch vụ cần vận hành                           |
| ALB + ACM                       | Tập trung HTTPS và quản lý chứng chỉ tại đầu vào API; routing và healthcheck được tách khỏi ứng dụng                        |
| IAM role cho EC2                | Cấp quyền S3 qua credential tạm thời; ứng dụng không cần nhúng access key dài hạn                                           |
| SSM qua NAT                     | Quản trị EC2 private bằng kênh outbound, giảm nhu cầu mở cổng SSH public                                                    |

**Phạm vi vận hành:** ALB đã có trong kiến trúc triển khai và chuyển request đến EC2. Compose hiện chạy API cùng Elasticsearch single-node trên EC2; có ALB không đồng nghĩa backend đã chạy nhiều replica hoặc deploy không gián đoạn. Migration đã áp dụng không tự rollback nếu API mới lỗi; migration cần tương thích với phiên bản API trước đó. Số AZ, số instance, RDS Multi-AZ, backup retention và autoscaling không được suy ra từ sơ đồ này.

## 5. Cập nhật ảnh tài liệu

Ảnh UI nằm tại [`docs/images/features/`](docs/images/features/), kèm [báo cáo chụp](docs/images/features/capture-report.json). Sơ đồ có cả PNG để xem và SVG để chỉnh sửa tại [`docs/images/architecture/`](docs/images/architecture/).

Để chụp lại, khởi động ứng dụng local rồi tạo file JSON trong `.runtime/` với ba khóa `buyer`, `seller`, `admin`, mỗi khóa có `email` và `password` của tài khoản tương ứng. File này được Git ignore.

```powershell
pnpm exec playwright install chromium
$env:README_ACCOUNTS_FILE = '.runtime/readme-accounts.json'
$env:README_EXTRA = '1'
node scripts/capture-readme-screenshots.mjs
node scripts/render-readme-architecture.mjs
```

Script đăng nhập thật, điều hướng màn hình, chụp PNG và ghi route vào báo cáo. Để có ảnh checkout, buyer cần có sản phẩm khả dụng trong giỏ và địa chỉ giao hàng. Script mở checkout để chụp, không gửi đơn hoặc thực hiện thanh toán. Có thể dùng biến `README_ROLES` với giá trị `buyer`, `seller` hoặc `admin` để cập nhật riêng từng vai trò.

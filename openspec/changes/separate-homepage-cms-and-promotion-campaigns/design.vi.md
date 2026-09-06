## Bối cảnh

Xem `proposal.md` về động cơ và `docs/ui-ux/separate-homepage-cms-and-promotion-campaigns.md` về hành vi buyer/admin. Hiện `HomepageBanner.campaignId` bắt buộc và unique. `MarketplaceCampaignsService.createAdmin` tạo banner trong cùng transaction. CRUD banner của `AdminService` còn tự tạo campaign `STANDARD` nháp. Homepage public lọc banner theo lifecycle campaign. `GET /api/v1/campaigns/by-banner/:bannerId` lấy banner id làm identity public của chiến dịch.

Phần kinh tế khuyến mãi (type, seller tham gia, reservation, giá) giữ nguyên trong `MarketplaceCampaignsModule` và các service promotion hiện có. Thiết kế này chỉ tách phần trình bày khỏi aggregate đó.

## Mục tiêu / Không thuộc phạm vi

**Mục tiêu:**

- Để Homepage/CMS service sở hữu persistence banner, CRUD admin, resolve đích và mapping homepage.
- Lưu đích typed tùy chọn thay vì foreign key campaign bắt buộc.
- Resolve và kiểm tra click-through lúc đọc public.
- Đưa identity public của chiến dịch khỏi banner id.
- Migrate hàng 1:1 hiện có mà không xóa lịch sử campaign hay banner.

**Không thuộc phạm vi:**

- CMS bài Markdown dài hoặc route bài viết cho từng banner.
- Banner do seller đăng, vị trí trả phí hoặc đấu giá.
- Đổi pricing, enrollment, voucher hay kệ flash sale.
- Đưa lệnh ghi banner vào `MarketplaceCampaignsService` hoặc `SellerPromotionsService`.
- Lấy isolated full-stack Playwright (`pnpm test:e2e:homepage`) làm cổng giao hàng của change này.

## Quyết định

### 1. Thêm `HomepageCmsService` cạnh read model homepage

Tạo `HomepageCmsService` (và admin controller) trong `HomepageModule` hoặc `HomepageCmsModule` riêng. Service này sở hữu list/create/update/reorder/delete banner, validate đích lúc ghi, và helper mapping public cho `HomepageService`. `AdminHomepageController` ủy quyền sang service này, không còn đường `AdminService` tự tạo campaign. `MarketplaceCampaignsService` ngừng tạo/sửa `HomepageBanner`.

Campaign chỉ được expose query đọc, ví dụ “chiến dịch này có đang public active không?”, để CMS kiểm tra click-through. Campaign không nhận payload banner.

Phương án đã cân nhắc: giữ CRUD banner trên `AdminService` tiếp tục trộn catalog admin với presentation và đã tạo campaign như side effect.

### 2. Thay `campaignId` bắt buộc bằng cột đích typed

Trên `HomepageBanner`:

- `targetType`: `CAMPAIGN | PRODUCT | SHOP | CATEGORY | SEARCH | URL`
- `targetId`: UUID cho CAMPAIGN/PRODUCT/SHOP/CATEGORY
- `targetQuery`: chuỗi cho từ khóa SEARCH hoặc path URL
- `displayFrom` / `displayUntil`: timestamptz tùy chọn
- `priority`: số nguyên (`sortOrder` có thể giữ làm khóa thứ tự unique theo module)
- `isEnabled`: boolean

Bỏ unique `campaignId` bắt buộc sau backfill. Có thể giữ `campaignId` nullable nếu giúp migration, nhưng contract public là `targetType`/`targetId`. Tạo campaign không còn insert banner.

Kiểm tra lúc ghi: đích tồn tại với loại entity; URL là path cùng origin; SEARCH là text giới hạn; media trong allowlist. Muốn *lưu* đích CAMPAIGN thì campaign phải tồn tại; muốn *đưa buyer tới* thì campaign phải *đang chạy*.

Phương án đã cân nhắc: giữ `campaignId` bắt buộc không diễn tả được thẻ sản phẩm/shop/danh mục/tìm kiếm/URL.

### 3. Resolve href lúc đọc homepage

`HomepageService` hỏi CMS mapper các banner đủ điều kiện: đang bật, trong cửa sổ hiển thị, module đang bật. Với mỗi banner:

| targetType | href nếu hợp lệ | nếu đích lỗi |
| --- | --- | --- |
| CAMPAIGN | `/campaigns/:campaignId` | giữ thẻ banner, bỏ href và nội dung chiến dịch, báo admin |
| PRODUCT | href public sản phẩm hiện có | bỏ href, giữ banner |
| SHOP | href public shop hiện có | bỏ href, giữ banner |
| CATEGORY | href danh mục hiện có | bỏ href, giữ banner |
| SEARCH | `/search?q=...` | bỏ href nếu query rỗng |
| URL | path tương đối đã lưu | bỏ href nếu path không an toàn |

Không tự thêm chiến dịch đang chạy nếu không có banner. Không ẩn banner CMS chỉ vì fetch campaign thất bại.

Chi tiết chiến dịch public chuyển thành `GET /api/v1/campaigns/:campaignId`. `GET /api/v1/campaigns/by-banner/:bannerId` chỉ còn alias tương thích tạm: tìm banner CMS đích CAMPAIGN rồi trả campaign đó; gỡ khi client dùng campaign id. Route storefront chuẩn là `/campaigns/[campaignId]`; `/banner/[bannerId]` có thể redirect khi banner còn trỏ campaign, không thì not-found.

Phương án đã cân nhắc: giữ `/banner/:bannerId` làm identity chiến dịch khiến CMS và promotion dùng chung một không gian URL.

### 4. Hai đồng hồ độc lập

Banner dùng thời điểm đánh giá homepage với `displayFrom`/`displayUntil` và `isEnabled`. Campaign dùng `campaignLifecycleAt` hiện có **chỉ** để quyết định có gắn href/nội dung chiến dịch hay không. Hủy, hết hạn hoặc xóa chiến dịch không xóa và không ẩn banner. Xóa banner không hủy chiến dịch.

Khi đích `CAMPAIGN` không fetch được hoặc không `ACTIVE`, `HomepageCmsService` bỏ `href`, đánh dấu đích không khả dụng cho admin, và gửi **một** thông báo in-app nhóm `SYSTEM` tới tài khoản admin (type kiểu `BANNER_CAMPAIGN_TARGET_UNAVAILABLE`) kèm deep link `/admin/homepage`. Khóa chống trùng gồm banner id, campaign id và lý do lỗi để homepage đọc lại không spam inbox. Lỗi gửi thông báo không được chặn render homepage.

### 5. Hai màn admin tách nhau

`/admin/homepage` là editor CMS (chọn đích, lịch hiển thị, ưu tiên). `/admin/campaigns` bỏ side effect “tạo banner homepage” và có thể chỉ đường sang Homepage khi muốn treo thẻ. Preview thuộc CMS: không publish; nếu đích CAMPAIGN chưa chạy thì vẫn hiện ảnh kèm chú thích đích không khả dụng.

### 6. Kiểm thử trình duyệt chỉ dùng quick E2E

Chạy `pnpm test:e2e:homepage:quick` trên API/web local đang chạy. Không start Docker, migrate, seed, snapshot hay sửa database dev. Cổng trình duyệt chỉ cần banner seed và click đích còn sống. Campaign hết/xóa/fetch fail và thông báo admin chứng minh bằng unit/API test.

Phương án đã cân nhắc: full E2E isolated mutate campaign an toàn hơn, nhưng change này chỉ lấy quick làm cổng.

## Rủi ro / đánh đổi

- **[Chiến dịch đang chạy biến khỏi home cho đến khi admin tạo banner]** → Migration biến mỗi banner 1:1 hiện có thành banner CMS trỏ campaign đó; tài liệu hóa rằng campaign mới muốn lên home thì phải tạo thẻ có chủ đích.
- **[Đích CAMPAIGN cũ sau khi hủy/hết hạn/xóa]** → Giữ banner, bỏ href/nội dung chiến dịch, admin thấy “đích không khả dụng”, gửi một thông báo đã chống trùng.
- **[URL cũ `/banner/:id`]** → Chỉ redirect khi banner còn tồn tại và còn trỏ campaign; không thì 404 đã làm sạch.
- **[Homepage tra cứu thêm theo banner]** → Số banner nhỏ; validate đích theo từng loại bằng một nhóm query.

## Kế hoạch migration

1. Thêm cột đích nullable, cửa sổ hiển thị, cờ bật và backfill: `campaignId` hiện có → `targetType=CAMPAIGN`, `targetId=campaignId`; `destinationPath` không còn lái điều hướng; `sortOrder` → priority.
2. Deploy CMS service đọc được cả `campaignId` cũ và target mới.
3. Ngừng campaign create/update ghi banner; ngừng tạo banner admin kèm campaign nháp.
4. Chuyển mapping homepage sang điều kiện CMS + validate đích.
5. Thêm route public theo campaign id; giữ alias by-banner một thời gian.
6. Nới/`drop` ràng buộc `campaignId` bắt buộc sau khi kiểm tra.
7. Rollback: giữ cột additive; binary cũ còn đòi `campaignId` vẫn đọc hàng đã backfill cho đến khi drop constraint. Không đảo dữ liệu target.

## Câu hỏi mở

Không. Loại đích, lịch độc lập, kiểm tra campaign đang chạy lúc đọc, và CMS service riêng đã được chốt.

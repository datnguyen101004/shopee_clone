## Bối cảnh

Xem [proposal.md](proposal.md) về lý do thay đổi và [đặc tả UI/UX tiếng Việt](../../../docs/ui-ux/separate-seller-onboarding-and-shop-lifecycle.md) về trải nghiệm. Đây là bản Việt hóa của [design.md](design.md); các quyết định và phạm vi tương đương.

Project dùng TypeScript, pnpm/Turborepo, Next.js App Router/React, NestJS REST với tiền tố `/api/v1`, Prisma/PostgreSQL, packages contracts và UI dùng chung. `SellerOnboardingService` đã lưu hồ sơ thành `Shop(INACTIVE, PENDING_APPROVAL)` và cấp `SELLER` khi duyệt. `Shop.ownerId` đã có ràng buộc duy nhất. `SellerIdentityLifecycleService` hiện gắn việc khóa/mở khóa cả hai thực thể và thu hồi phiên với nhau. `sellableShopWhere` và `isSellableShop` chỉ kiểm tra shop, dựa vào sự gắn kết đó để ngăn shop của tài khoản bị khóa xuất hiện.

Hai change đã hoàn thành `enforce-single-shop-seller-account` và `simplify-seller-registration-approval` vẫn ở thư mục changes; spec identity/registration của chúng chưa được đồng bộ vào main specs. Change này giữ quy tắc một shop và duyệt hồ sơ, thay thế quy tắc khóa/mở khóa đồng thời. Chỉ `admin-entity-administration` hiện có main spec tương ứng để sửa. Khi sync/archive sau này phải đối chiếu phần chồng lấn để không đưa lại quy tắc cũ.

## Mục tiêu và ngoài phạm vi

**Mục tiêu:** trạng thái tài khoản/shop độc lập; cấp quyền người bán qua duyệt hồ sơ; quyền hiển thị và nhận giao dịch phụ thuộc chủ shop; thông báo riêng tư rõ nguyên nhân; chuyển đổi dữ liệu cũ mà không tự gỡ hạn chế.

**Ngoài phạm vi:** redesign Figma, refactor frontend tổng thể, nhiều shop, chuyển chủ sở hữu, chọn danh tính cá nhân/shop trong chat, tự hủy đơn/hoàn tiền, mở rộng quyền seller đang bị hạn chế, triển khai production trong giai đoạn proposal hoặc tự chạy E2E.

## Quyết định

### 1. Giữ bản ghi hồ sơ hiện có, tách trách nhiệm trạng thái

Giữ `User.status`, role assignments, `Shop.status`, `Shop.onboardingStatus` và tính duy nhất của `Shop.ownerId`. Bản ghi Shop trước duyệt là hồ sơ riêng tư, chưa phải shop hoạt động công khai. Duyệt sẽ kích hoạt chính bản ghi đó. Tách bảng hồ sơ mới sẽ phát sinh migration và thay đổi endpoint mà chưa cải thiện trải nghiệm được yêu cầu; chỉ xét lại khi có nhu cầu lịch sử hồ sơ độc lập thực tế. Audit lưu lịch sử quyết định.

Role seller vẫn gắn với một shop đã duyệt, chưa xóa mềm, dù tài khoản hoặc shop đang bị tạm ngưng. Giữ bảo vệ quan hệ này trong quản trị role. Cặp user ACTIVE/shop SUSPENDED là hợp lệ. Không nới ràng buộc sở hữu hay cho tạo shop mới khi còn bản ghi đã xóa mềm.

### 2. Tách lệnh và tính điều kiện hoạt động thực tế

| Lệnh | Trạng thái tài khoản | Trạng thái shop | Phiên đăng nhập |
| --- | --- | --- | --- |
| Duyệt hồ sơ chờ xét | Phải ACTIVE; giữ nguyên | APPROVED + ACTIVE | Giữ; làm mới thông tin quyền |
| Tạm ngưng shop, gồm kiểm duyệt | Giữ nguyên | SUSPENDED | Giữ nguyên |
| Khôi phục shop đã duyệt đang tạm ngưng | Giữ nguyên | ACTIVE | Giữ nguyên |
| Khóa tài khoản | SUSPENDED | Giữ nguyên | Thu hồi |
| Mở khóa tài khoản | ACTIVE | Giữ nguyên | Không phục hồi phiên đã thu hồi |

Shop chỉ khả dụng khi chủ chưa xóa và ACTIVE, shop chưa xóa và APPROVED/ACTIVE; sản phẩm còn phải thỏa điều kiện sản phẩm/danh mục/biến thể hiện có. Khóa tài khoản làm shop ẩn mà không ghi đè shop sang tạm ngưng, nhờ đó giữ được hạn chế độc lập. Mở khóa chủ chỉ làm shop hiển thị lại nếu shop vẫn đủ điều kiện. Cho khôi phục shop khi chủ vẫn bị khóa nhưng phải thông báo rõ shop vẫn bị ẩn.

Giữ kiểm tra lý do, quyền admin hiện hành, chống tự khóa và bảo vệ admin cuối cùng ở nơi áp dụng, xử lý lặp không đổi trạng thái và audit trong transaction. Chỉ ghi chuyển trạng thái thực sự xảy ra; trạng thái thực thể liên quan là ngữ cảnh, không tạo audit giả rằng chủ bị khóa khi chỉ khóa shop. Admin và moderation phải dùng cùng ý nghĩa mới, loại bỏ fallback còn gắn hai trạng thái và thông báo xác thực gây hiểu nhầm.

### 3. Tuần tự hóa duyệt hồ sơ, hạn chế và tạo giao dịch mới

Dùng transaction PostgreSQL và thứ tự khóa nhất quán: các chủ shop theo ID ổn định, tiếp đến các shop theo ID ổn định, rồi các tài nguyên giao dịch phía sau hiện có. Đọc lại trạng thái sau khi lấy khóa; không dùng kết quả đọc hồ sơ trước khóa làm căn cứ quyết định. Request approve/reject mang `expectedUpdatedAt` của hồ sơ admin đã xem; so sánh trong khóa và trả conflict dạng Problem Details khi có chỉnh sửa/quyết định khác. Gửi lại quyết định đã hoàn tất chỉ là no-op nếu khớp phiên bản hồ sơ và payload đã áp dụng; trường hợp khác trả conflict. Lưu dấu phiên bản đã xét trong audit metadata bền vững; chỉ thêm cột nếu audit hiện có không thể lưu an toàn.

Khóa chủ shop và tạo giao dịch mới phải dùng chung ranh giới tuần tự hóa. Nếu khóa tài khoản commit trước, giao dịch mới không được thông qua bằng quote cũ. Không giữ khóa khi gọi dịch vụ ngoài. Duyệt chủ bị khóa/đã xóa không được đổi role. Lỗi ghi role/trạng thái/phiên/audit phải rollback toàn bộ. Callback thanh toán của giao dịch đã tạo vẫn giữ vòng đời idempotent hiện có.

### 4. Một chính sách backend dựa trên dữ liệu có thẩm quyền

Thêm điều kiện trạng thái/xóa chủ shop vào `sellableShopWhere`. Đầu vào `isSellableShop` phải có dữ liệu chủ và từ chối nếu thiếu; cập nhật mọi projection và đường SQL liên quan. Giữ `shopCanSell` dùng chung có phạm vi rõ là trường của shop, hoặc mở rộng input nhất quán; không coi nó là quyết định quyền backend đầy đủ khi thiếu dữ liệu chủ.

Kiểm kê catalog, chi tiết, shop storefront/following, homepage, search hydration/projection, recommendations, campaign/banner, favorites/recently viewed, cart, quote và tạo giao dịch. Khi dựng response công khai, kiểm tra điều kiện theo lô từ dữ liệu có thẩm quyền; không tin document Elasticsearch hoặc `canSell` trong cache. Vô hiệu hóa cache/reindex các ứng viên liên quan bằng cơ chế sẵn có để cập nhật số lượng và xếp hạng; lọc ứng viên cũ ngay cả trước khi reindex xong. Cache ID ứng viên thay vì trả response bán hàng cũ hoàn chỉnh mà không kiểm tra lại; rà Next route/data cache và API cache để request sau khóa không lấy nội dung công khai cũ. Không thêm polling/push để gỡ nội dung đã vẽ trong trình duyệt.

Snapshot đơn/trả hàng và trao đổi lịch sử giữ quyền truy cập hiện có. Tham chiếu đã lưu/đang theo dõi dùng trạng thái không khả dụng hoặc được bỏ khỏi danh sách, không có liên kết bán hàng đang hoạt động. Không xóa sản phẩm, lịch sử giỏ hay snapshot giao dịch chỉ để ẩn shop.

### 5. Tách xác thực, role seller và quyền bán hàng

Auth từ chối user bị khóa/đã xóa và phiên đã thu hồi độc lập với trạng thái shop. Chủ ACTIVE của shop tạm ngưng vẫn có phiên cá nhân và vào các trang mua hàng. Cho phép phạm vi hẹp gồm đọc workspace của mình và thông báo kiểm duyệt dù bán hàng bị chặn. Các endpoint vận hành seller phải kiểm tra trạng thái shop tại backend, gồm ghi sản phẩm/media/tồn kho/khuyến mãi và hồ sơ/trạng thái shop. Không được lách qua `PATCH /seller/shop` hay gọi API trực tiếp. Giữ thao tác active/inactive cho shop đã duyệt chưa bị tạm ngưng và các hạn chế đơn/trả hàng hiện có; không vô tình mở rộng quyền chat/xử lý đơn.

Giữ route hiện có, bổ sung projection riêng tư an toàn: admin shop summary thêm `ownerStatus`, `canSell`, mã lý do không khả dụng; workspace của chủ có thông tin tương đương. Mã lý do gồm `owner_suspended`, `owner_deleted`, `shop_suspended`, `shop_inactive`, `onboarding_pending`, `onboarding_rejected`, `shop_deleted`; biểu diễn được nhiều hạn chế đồng thời. Route công khai vẫn báo không khả dụng chung. Contracts, guard, OpenAPI và cập nhật quyền trong UI phải thống nhất; trạng thái tính tại frontend không phải kiểm tra quyền.

### 6. Kiểm chứng theo phạm vi; E2E chỉ khi yêu cầu

Khi triển khai, chạy Jest service/API integration, Vitest/Testing Library, contract checks cùng lint/typecheck liên quan. Trọng tâm là race duyệt/sửa hồ sơ, ma trận khôi phục, giữ/thu hồi phiên, race/rollback với PostgreSQL thật, lọc search/cache cũ, chặn giao dịch mới và phân quyền API trực tiếp.

Theo yêu cầu người dùng, không tự chạy quick/full E2E, hành trình Playwright hoặc cập nhật snapshot cho change này, kể cả workflow chung yêu cầu E2E khi sửa UI. Có thể chuẩn bị/cập nhật scenario nhưng chưa thực thi. Chỉ sau yêu cầu rõ ràng mới chạy quick suite được chọn bằng script hiện có như `pnpm test:e2e:seller:quick`, `pnpm test:e2e:auth:quick`, `pnpm test:e2e:shop:quick`, `pnpm test:e2e:checkout:quick`; không mặc định chạy hết hay tự bịa script admin quick. Đọc lại scripts trước khi chạy. E2E chưa chạy là giới hạn kiểm chứng phải báo cáo, không phải pass và không chặn công việc triển khai độc lập.

## Rủi ro và đánh đổi

- Hạn chế cũ thiếu nguồn gốc rõ ràng → giữ cả hai trạng thái, xuất báo cáo dry-run; chỉ kích hoạt lại dữ liệu khi có danh sách sửa đã được xem xét rõ ràng, không suy ra quyền mở khóa chỉ từ audit cũ.
- Thiếu trường chủ hoặc cache cũ lộ sản phẩm → bắt buộc projection, thiếu dữ liệu thì từ chối, kiểm kê cache và integration test với ứng viên cũ.
- Join/khóa chủ làm tăng độ trễ hoặc deadlock → đọc theo lô, dùng index hiện có, một thứ tự khóa và cơ chế retry transaction có giới hạn hiện hành; tránh N+1.
- Khóa shop giờ vẫn để tài khoản dùng được → kiểm tra mọi API vận hành, phân biệt đọc trạng thái được phép với ghi bị cấm.
- Spec cũ và các thay đổi frontend song song xung đột → đọc lại diff khi apply, giữ công việc khác và xử lý ưu tiên spec khi sync/archive; không áp dụng theo số dòng cũ.
- E2E tùy chọn khiến hành trình trình duyệt chưa được xác minh → báo phạm vi trì hoãn và chỉ chạy quick suite được yêu cầu.

## Kế hoạch chuyển đổi

1. Kiểm kê caller, consumer điều kiện hoạt động và cache; phân loại chỉ đọc các cặp trạng thái, role không khớp và tham chiếu đã xóa. Giữ ID shop đã duyệt và hồ sơ đang chờ.
2. Làm điều kiện hiển thị theo chủ và kiểm tra giao dịch trước khi bỏ cascade từ tài khoản sang shop. Cập nhật backend/contracts/frontend tương thích cùng nhau ở local; không để writer cũ/mới chạy lẫn lúc chuyển.
3. Giữ schema trừ khi lưu phiên bản xét duyệt hoặc nhu cầu đối soát rõ ràng cần migration bổ sung. Dry-run công cụ dữ liệu, không mở khóa hàng loạt. Script sửa cũ không được coi trạng thái hỗn hợp hợp lệ là lỗi.
4. Làm mới cache/search và kiểm chứng bằng kiểm tra tự động theo phạm vi. E2E trì hoãn nếu chưa được yêu cầu; production ngoài quyền thực hiện hiện tại.
5. Rollback: giữ dữ liệu/audit, dừng ghi lifecycle mới, hoàn tác ứng dụng thành bộ tương thích sau khi xét trạng thái hỗn hợp. Không dùng job cũ ép hai trạng thái bằng nhau; giữ kiểm tra hiển thị theo chủ và từ chối khi thiếu dữ liệu đến khi rollback được xem xét bảo toàn mọi hạn chế. Không reset database phá hủy dữ liệu.

## Ma trận API cần kiểm chứng

Các đường dẫn dùng tiền tố `/api/v1`. Endpoint của consumer lân cận được xác định từ controller khi triển khai.

| API | Request/response | Biên và phân quyền |
| --- | --- | --- |
| `GET /seller/shop/workspace` | Hồ sơ/shop của mình, quyền hiện tại, thông tin khả dụng an toàn | Buyer trước duyệt; chủ shop tạm ngưng vẫn đọc được; không lộ hồ sơ người khác |
| `POST /seller/shop` | Form đầy đủ → hồ sơ pending/inactive | Dữ liệu sai, trùng owner/slug đồng thời, user khóa, slot xóa mềm |
| `PATCH /seller/shop/registration` | Sửa/gửi lại → cùng bản ghi pending/inactive | Race với duyệt, cấm trường trạng thái, gửi lại hồ sơ từ chối, khác chủ |
| `POST /admin/shops/:shopId/approval` | Decision, reason, `expectedUpdatedAt` → duyệt/cấp role hoặc từ chối | Admin active; chủ khóa; phiên bản cũ; retry giống hệt; race từ chối; rollback |
| `POST /admin/shops/:shopId/actions` | SUSPEND/RESTORE + reason → trạng thái shop độc lập | Giữ tài khoản/phiên; cấm restore chưa duyệt; không mở khóa chủ |
| `POST /admin/users/:userId/actions` | SUSPEND/RESTORE + reason → trạng thái user độc lập | Thu hồi phiên; tự khóa/admin cuối; giữ hạn chế shop; no-op audit |
| `GET /admin/shops`, `GET /admin/shops/:shopId` | Summary an toàn + trạng thái chủ/khả dụng | Chỉ admin; không lộ liên hệ riêng tư/phiên; hiển thị hai hạn chế |
| `PATCH /seller/shop` và API vận hành seller | Payload hiện có → kết quả thường hoặc từ chối ổn định | Chủ active/shop suspended không tự mở lại/ghi; giữ toggle inactive |
| Auth login/refresh/access | Chứng minh danh tính → phiên hoặc lỗi | Khóa shop vẫn login; khóa user chặn token cũ; mở khóa phải đăng nhập mới |
| `GET /shops/:shopSlug`, `GET /shops/:shopSlug/products` và API công khai sản phẩm/discovery | Response hiện có lọc theo đủ điều kiện | Chủ khóa/đã xóa, index/cache cũ, thông báo không khả dụng chung |
| Cart, quote, checkout/purchase | Dạng dữ liệu hiện có | Chủ đổi sau quote; race khóa; không reservation dở; giữ callback thanh toán cũ |
| API quyết định kiểm duyệt hiện có | Decision/reason → kết quả và audit | Target shop chỉ đổi shop; giữ hành vi target product |

Đây là mục tiêu unit/integration mặc định, không phải yêu cầu chạy browser E2E. Danh sách công việc thực hiện nằm tại [tasks.md](tasks.md), chia theo kiểm kê → contracts/khả dụng → duyệt/lifecycle → quyền/giao dịch → UI → kiểm chứng → tài liệu.

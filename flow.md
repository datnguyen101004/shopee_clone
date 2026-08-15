# Flow các tính năng đã triển khai

Tài liệu này mô tả trạng thái hiện tại của Shopee Clone sau TS01 và các task đến T20. Các sơ đồ tập trung vào luồng đang hoạt động trong code; checkout COD, order history và hủy đơn đã có, còn thanh toán online, chat và vận chuyển thật chưa được triển khai.

## 1. Tổng quan phạm vi

| Nhóm               | Màn hình hoặc điểm vào                                                      | Chức năng hiện có                                                                            |
| ------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Nền tảng giao diện | `/`, `/design-system`, layout storefront                                    | Design system, header dùng chung, tìm kiếm, điều hướng danh mục, responsive và accessibility |
| Trang chủ          | `/`                                                                         | Banner chiến dịch, danh mục, flash sale, bán chạy, Mall và gợi ý hằng ngày từ API            |
| Khám phá sản phẩm  | `/search`                                                                   | Tìm kiếm, lọc, sắp xếp, phân trang và URL có thể chia sẻ                                     |
| Chi tiết sản phẩm  | `/products/{productId}`                                                     | Gallery, biến thể, giá, tồn kho, số lượng, shop, sản phẩm liên quan và purchase intent       |
| Tài khoản          | `/login`, `/register`, `/forgot-password`, `/reset-password`                | Email/password, Google OIDC, refresh session, logout và khôi phục mật khẩu                   |
| Phân quyền         | `/seller`, `/admin` và API tương ứng                                        | Buyer mặc định, seller theo quyền và ownership, admin quản lý role và audit                  |
| Hồ sơ giao hàng    | `/account/profile`, `/account/addresses`                                    | Hồ sơ, số điện thoại, CRUD địa chỉ và địa chỉ mặc định                                       |
| Tương tác buyer    | `/account/favorites`, `/account/recently-viewed`, `/account/followed-shops` | Yêu thích, lịch sử xem gần đây và danh sách shop đang theo dõi riêng theo tài khoản          |
| Gian hàng          | `/shops/{shopSlug}`                                                         | Hồ sơ shop, catalog riêng, tìm kiếm/lọc/sắp xếp/phân trang và theo dõi shop                  |
| Dữ liệu            | `asserts/*.json`, PostgreSQL                                                | Import 1.377 sản phẩm chuẩn hóa, idempotent, có provenance và dữ liệu sinh xác định          |

## 2. Kiến trúc chạy ứng dụng

```mermaid
flowchart LR
    subgraph client ["Client"]
        browser["Trình duyệt người mua"]
    end

    subgraph gateway ["Frontend"]
        nextWeb["Next.js storefront"]
    end

    subgraph service ["Backend"]
        nestApi["NestJS API"]
    end

    subgraph datastore ["Persistence"]
        postgres["PostgreSQL"]
    end

    subgraph external ["Dịch vụ ngoài"]
        googleOidc["Google OpenID Connect"]
    end

    browser -->|"HTTP"| nextWeb
    nextWeb -->|"REST /api/v1"| nestApi
    nestApi -->|"Prisma read/write"| postgres
    nestApi -.->|"Google: OAuth/OIDC"| googleOidc
```

`@shopee-clone/contracts` giữ kiểu dữ liệu và parser dùng chung giữa frontend và backend. Dữ liệu riêng tư và mọi phản hồi phụ thuộc phiên đều dùng `Cache-Control: no-store`.

## 3. Hành trình khám phá sản phẩm công khai

```mermaid
flowchart LR
    visitor(["Người mua truy cập"])
    homepage["Trang chủ / "]
    homeModules["Banner, danh mục, module sản phẩm"]
    searchPage["Tìm kiếm /search"]
    discovery["Lọc, sắp xếp, phân trang"]
    productGrid["Danh sách sản phẩm"]
    productDetail["Chi tiết /products/{id}"]
    variant["Chọn biến thể và số lượng"]
    shopPage["Gian hàng /shops/{slug}"]
    shopCatalog["Catalog riêng của shop"]
    purchaseIntent{"Mua ngay hoặc thêm giỏ?"}
    loginHandoff["Chuyển đến /login với intent an toàn"]
    persistentCart["Giỏ hàng server-side /cart"]
    currentBoundary(["Chưa tạo đơn hàng"])

    visitor --> homepage
    homepage -->|"GET /homepage"| homeModules
    homepage --> searchPage
    homeModules --> productDetail
    searchPage -->|"GET /catalog/products"| discovery
    discovery --> productGrid
    productGrid --> productDetail
    productDetail --> variant
    productDetail -->|"Chọn tên shop"| shopPage
    shopPage --> shopCatalog
    shopCatalog --> productDetail
    variant --> purchaseIntent
    purchaseIntent -->|"Thêm vào giỏ"| persistentCart
    purchaseIntent -->|"Mua ngay khi là khách"| loginHandoff
    loginHandoff --> persistentCart
    persistentCart --> currentBoundary
```

Catalog chỉ trả sản phẩm đủ điều kiện hiển thị. Search hỗ trợ `q`, danh mục, khoảng giá, rating, vị trí shop, còn hàng, đang giảm giá và năm kiểu sắp xếp. Trang chi tiết ghi lựa chọn biến thể/số lượng vào giỏ server-side; chưa giữ tồn kho hoặc tạo đơn.

## 4. Vòng đời xác thực và session

```mermaid
stateDiagram-v2
    direction LR

    state "Khách" as guest
    state "Xác thực email" as emailAuth
    state "Xác thực Google" as googleAuth
    state "Đã đăng nhập" as authenticated
    state "Đang refresh" as refreshing
    state "Khôi phục mật khẩu" as recovering

    [*] --> guest
    guest --> emailAuth: đăng ký hoặc đăng nhập
    guest --> googleAuth: tiếp tục với Google
    emailAuth --> authenticated: hợp lệ
    emailAuth --> guest: thất bại
    googleAuth --> authenticated: hợp lệ
    googleAuth --> guest: hủy hoặc thất bại
    authenticated --> refreshing: access token hết hạn
    refreshing --> authenticated: rotate thành công
    refreshing --> guest: cookie lỗi hoặc reuse
    authenticated --> guest: đăng xuất
    guest --> recovering: quên mật khẩu
    recovering --> guest: reset hoàn tất
```

- Access token chỉ nằm trong React runtime memory.
- Refresh token chỉ nằm trong cookie `HttpOnly`, được lưu ở database dưới dạng digest và rotate theo từng lần refresh.
- Logout là idempotent; reset mật khẩu thu hồi các refresh session hiện có.
- Browser không lưu token trong local storage hoặc session storage.

### Đăng nhập Google và tạo session nội bộ

```mermaid
sequenceDiagram
    title Đăng nhập Google OIDC
    participant NguoiMua
    participant WebApp
    participant API
    participant Google
    participant PostgreSQL

    NguoiMua->>WebApp: Chọn đăng nhập Google
    WebApp->>API: GET /api/v1/auth/google/start
    API->>PostgreSQL: Lưu transaction một lần
    API-->>NguoiMua: 302 đến Google
    NguoiMua->>Google: Đăng nhập và đồng ý
    Google-->>NguoiMua: 302 callback với code và state
    NguoiMua->>API: GET callback đã đăng ký
    API->>Google: Đổi code và xác minh ID token
    API->>PostgreSQL: Tìm hoặc tạo external identity
    API->>PostgreSQL: Tạo refresh session nội bộ
    API-->>NguoiMua: 302 /login/google/complete
    NguoiMua->>WebApp: Mở trang hoàn tất
    WebApp->>API: POST /api/v1/auth/refresh
    API-->>WebApp: Access token runtime
    WebApp-->>NguoiMua: Trở về returnTo an toàn
```

Google `sub` là định danh bên ngoài. Google access token, refresh token và ID token chỉ tồn tại tạm thời ở backend trong lúc xác minh rồi bị loại bỏ; ứng dụng chỉ duy trì session nội bộ. Email đã thuộc một tài khoản local nhưng chưa liên kết sẽ không được tự động gộp.

## 5. Phân quyền buyer, seller và admin

```mermaid
flowchart LR
    request(["Request được bảo vệ"])
    validSession{"Session hợp lệ?"}
    unauthorized(["401"])
    loadAuthority["Đọc user và role hiện tại"]
    scope{"Phạm vi request?"}
    buyerAccess["Tài nguyên của buyer"]
    sellerRole{"Có role seller?"}
    shopOwnership{"Sở hữu shop hợp lệ?"}
    sellerAccess["Trả shop an toàn"]
    adminRole{"Có role admin?"}
    adminAccess["Quản lý role và audit"]
    forbidden(["403"])

    request --> validSession
    validSession -->|"Không"| unauthorized
    validSession -->|"Có"| loadAuthority
    loadAuthority --> scope
    scope -->|"Account"| buyerAccess
    scope -->|"Seller"| sellerRole
    sellerRole -->|"Không"| forbidden
    sellerRole -->|"Có"| shopOwnership
    shopOwnership -->|"Không"| forbidden
    shopOwnership -->|"Có"| sellerAccess
    scope -->|"Admin"| adminRole
    adminRole -->|"Không"| forbidden
    adminRole -->|"Có"| adminAccess
```

JWT chỉ mang identity (`sub`, `sid`). Backend luôn đọc role và ownership mới nhất từ PostgreSQL, vì vậy thu hồi role có hiệu lực ngay ở request tiếp theo. Admin không tự động có quyền seller và hệ thống không nhận `ownerId` do browser gửi lên.

## 6. Hồ sơ và địa chỉ giao hàng

```mermaid
flowchart LR
    signedIn(["Buyer đã đăng nhập"])
    profilePage["Trang hồ sơ"]
    profileApi["GET hoặc PATCH /account/profile"]
    addressPage["Trang địa chỉ"]
    provincePopup["Popup 63 tỉnh/thành cũ"]
    districtPopup["Popup quận/huyện phụ thuộc"]
    wardKind{"Quận/huyện có tổ chức cấp xã?"}
    wardChunk["Tải lười snapshot 10.035 phường/xã"]
    wardPopup["Popup phường/xã phụ thuộc"]
    noWardSentinel["Tự chọn sentinel không có cấp xã"]
    addressAction{"Thao tác địa chỉ?"}
    accountApi["Account API"]
    userLock["Khóa user FOR UPDATE"]
    ownerCheck["Kiểm tra ownership"]
    mutation["Create, update, delete hoặc set default"]
    defaultInvariant["Duy trì đúng một default"]
    database[("PostgreSQL")]

    signedIn --> profilePage
    profilePage --> profileApi
    profileApi --> database
    signedIn --> addressPage
    addressPage --> provincePopup
    provincePopup --> districtPopup
    districtPopup --> wardKind
    wardKind -->|"Có"| wardChunk
    wardChunk --> wardPopup
    wardPopup --> addressAction
    wardKind -->|"Không: 5 huyện đặc thù"| noWardSentinel
    noWardSentinel --> addressAction
    addressAction --> accountApi
    accountApi --> userLock
    userLock --> ownerCheck
    ownerCheck --> mutation
    mutation --> defaultInvariant
    defaultInvariant --> database
```

Khi đổi tỉnh, cả district và ward không tương thích bị xóa; khi đổi district, ward bị xóa. Chọn lại cùng cấp cha giữ lựa chọn con, còn giá trị cũ ngoài snapshot được bảo toàn cho tới khi người dùng chủ động đổi cấp cha. Ward snapshot chỉ được tải từ asset nội bộ sau khi nhận diện district; browser không gọi NSO ở runtime. Năm huyện `Bạch Long Vĩ`, `Cồn Cỏ`, `Hoàng Sa`, `Lý Sơn` và `Côn Đảo` tự dùng sentinel `Không có đơn vị hành chính cấp xã`. API tiếp tục lưu province/district/ward dạng chuỗi.

Địa chỉ đầu tiên tự trở thành mặc định; xóa địa chỉ mặc định sẽ chọn địa chỉ cũ nhất còn hoạt động. ID không tồn tại, đã xóa hoặc thuộc user khác đều trả cùng một lỗi `404` đã làm sạch.

## 7. Yêu thích, xem gần đây và theo dõi shop

```mermaid
flowchart LR
    surface(["Homepage, search, product hoặc shop"])
    signedIn{"Đã đăng nhập?"}
    login["/login với returnTo nội bộ"]
    action{"Hành động?"}
    favorite["PUT hoặc DELETE favorites"]
    favoriteRule["Idempotent, giữ favoritedAt đầu tiên"]
    favoritePage["/account/favorites"]
    recent["PUT recently-viewed"]
    recentRule["Đẩy lên mới nhất, giữ tối đa 100"]
    recentPage["/account/recently-viewed"]
    follow["PUT hoặc DELETE followed-shops"]
    followRule["Idempotent và cập nhật follower count"]
    shopView["Hiển thị trạng thái theo dõi"]
    postgres[("PostgreSQL")]

    surface --> signedIn
    signedIn -->|"Không"| login
    signedIn -->|"Có"| action
    action -->|"Yêu thích"| favorite
    favorite --> favoriteRule
    favoriteRule --> postgres
    favoriteRule --> favoritePage
    action -->|"Mở chi tiết"| recent
    recent --> recentRule
    recentRule --> postgres
    recentRule --> recentPage
    action -->|"Theo dõi shop"| follow
    follow --> followRule
    followRule --> postgres
    followRule --> shopView
```

Favorites vẫn giữ một projection tối thiểu cho sản phẩm về sau không còn công khai để buyer có thể xóa. Recently viewed loại sản phẩm không còn hiển thị khỏi items và totals. Mọi quan hệ đều được truy vấn theo user đang xác thực.

### Trạng thái nút theo dõi shop

```mermaid
stateDiagram-v2
    direction LR

    state "Khôi phục session" as restoring
    state "Khách" as guest
    state "Đọc trạng thái" as loadingStatus
    state "Chưa theo dõi" as unfollowed
    state "Đã theo dõi" as followed
    state "Đang follow" as pendingFollow
    state "Đang unfollow" as pendingUnfollow
    state "Bị chặn" as blocked

    [*] --> restoring
    restoring --> guest: không có session
    restoring --> loadingStatus: đã xác thực
    guest --> [*]: chuyển login an toàn
    loadingStatus --> unfollowed: false
    loadingStatus --> followed: true
    unfollowed --> pendingFollow: nhấn theo dõi
    pendingFollow --> followed: API thành công
    pendingFollow --> unfollowed: lỗi và rollback
    pendingFollow --> blocked: shop lỗi hoặc tự follow
    followed --> pendingUnfollow: nhấn bỏ theo dõi
    pendingUnfollow --> unfollowed: API thành công
    pendingUnfollow --> followed: lỗi và rollback
    blocked --> [*]
```

Nút follow trên storefront cập nhật lạc quan nhưng khóa thao tác lặp trong lúc request đang chạy. `404` chặn shop không công khai; `409` chặn owner tự theo dõi shop. Unfollow vẫn idempotent khi shop đã unavailable và không làm lộ follower count riêng tư.

### Danh sách shop đang theo dõi

```mermaid
flowchart TD
    openList["Tài khoản → Shop đang theo dõi"]
    session{"Session đã khôi phục?"}
    login["/login với returnTo an toàn"]
    listApi["GET /api/v1/account/followed-shops"]
    relationshipRows["Đọc quan hệ theo followedAt DESC, shopId ASC"]
    availability{"Shop còn công khai?"}
    publicCard["Card có link, vị trí và follower count hiện tại"]
    unavailableCard["Card tối thiểu: tên và trạng thái unavailable"]
    action{"Bỏ theo dõi?"}
    deleteApi["DELETE /api/v1/account/followed-shops/{shopId}"]
    confirmed{"API xác nhận?"}
    retain["Giữ card và thông báo thử lại"]
    refetch["Refetch danh sách chuẩn từ server"]
    pageFallback{"Trang hiện tại bị rỗng?"}
    previousPage["Đi đến trang hợp lệ liền trước"]
    restoreFocus["Khôi phục focus hợp lý"]

    openList --> session
    session -->|Không| login
    session -->|Có| listApi
    listApi --> relationshipRows
    relationshipRows --> availability
    availability -->|Có| publicCard
    availability -->|Không| unavailableCard
    publicCard --> action
    unavailableCard --> action
    action -->|Có| deleteApi
    deleteApi --> confirmed
    confirmed -->|Không| retain
    confirmed -->|Có| refetch
    refetch --> pageFallback
    pageFallback -->|Có| previousPage
    pageFallback -->|Không| restoreFocus
```

Danh sách được phân trang theo owner đang đăng nhập và luôn `no-store`. Shop inactive hoặc soft-deleted vẫn xuất hiện ở dạng tối thiểu để buyer có thể bỏ theo dõi; hard-delete dùng cascade nên quan hệ biến mất. Card chỉ bị loại sau khi DELETE thành công và frontend đã đọc lại dữ liệu có thẩm quyền từ backend.

## 8. Luồng tải public shop storefront

```mermaid
sequenceDiagram
    title Mở gian hàng từ chi tiết sản phẩm
    participant NguoiMua
    participant TrangSanPham
    participant TrangShop
    participant PublicAPI
    participant Catalog
    participant PostgreSQL

    NguoiMua->>TrangSanPham: Mở chi tiết sản phẩm
    TrangSanPham-->>NguoiMua: Hiển thị link shop
    NguoiMua->>TrangShop: GET /shops/{shopSlug}
    TrangShop->>PublicAPI: GET /api/v1/shops/{shopSlug}
    PublicAPI->>PostgreSQL: Đọc shop và aggregate
    PostgreSQL-->>PublicAPI: Profile công khai
    PublicAPI-->>TrangShop: 200 no-store
    TrangShop->>PublicAPI: GET /shops/{shopSlug}/products
    PublicAPI->>Catalog: Áp displayability và query
    Catalog->>PostgreSQL: Đọc sản phẩm và facets
    PostgreSQL-->>Catalog: Catalog của shop
    Catalog-->>PublicAPI: Page chuẩn hóa
    PublicAPI-->>TrangShop: 200 no-store
    TrangShop-->>NguoiMua: Render profile và sản phẩm
```

Shop không tồn tại, inactive, deleted hoặc slug không chuẩn đều dùng cùng presentation not-found. Rating shop được tính theo rating-count-weighted; danh mục và tổng sản phẩm chỉ tính sản phẩm công khai đủ điều kiện.

## 9. Luồng import dataset và chạy local

```mermaid
flowchart LR
    developer(["Developer"])
    install["pnpm install"]
    infrastructure["infra:up"]
    migrate["db:migrate:deploy"]
    seed["db:seed"]
    sourceDocs["6 file asserts/*.json"]
    validate["Validate manifest và checksum"]
    validData{"Dataset hợp lệ?"}
    reject(["Dừng trước khi ghi DB"])
    normalize["Chuẩn hóa dataset-v1"]
    transaction["Transactional upsert"]
    provenance["Lưu provenance và fallback metadata"]
    database[("PostgreSQL local")]
    verify["db:verify và quick E2E"]

    developer --> install
    install --> infrastructure
    infrastructure --> migrate
    migrate --> seed
    sourceDocs --> validate
    seed --> validate
    validate --> validData
    validData -->|"Không"| reject
    validData -->|"Có"| normalize
    normalize --> transaction
    transaction --> provenance
    provenance --> database
    database --> verify
```

Importer chạy local, không crawl mạng, không dùng dữ liệu ngẫu nhiên và an toàn khi chạy lặp. Ba giá thiếu và 952 rating thiếu được sinh xác định theo policy `dataset-v1`. Automatic GitHub Actions trigger hiện vẫn tạm tắt; các quality gate được chạy local hoặc manual dispatch.

## 10. Các ranh giới chưa triển khai

- Báo giá giỏ hàng dùng phí vận chuyển mô phỏng và preview voucher; không giữ tồn kho, giữ lượt voucher, cam kết cước cuối cùng hoặc tạo đơn.
- Purchase intent ở trang sản phẩm chưa báo checkout thành công.
- Đã có checkout COD, order history theo shop, timeline và hủy đơn chờ xác nhận; chưa có thanh toán online, shipment thật, seller fulfillment, return/refund workflow, review body, chat hoặc notification realtime.
- Seller mới có role/ownership boundary và safe shop projection, chưa có bộ công cụ quản lý gian hàng hoàn chỉnh.
- Admin hiện tập trung vào role assignment/revocation và role audit, chưa phải dashboard vận hành marketplace đầy đủ.

## 11. Giỏ hàng đa shop yêu cầu đăng nhập

### Đăng nhập trước khi thêm hoặc quản lý giỏ hàng

```mermaid
flowchart LR
    buyer(["Người mua"])
    entry["Chi tiết sản phẩm hoặc /cart"]
    auth{"Đã đăng nhập?"}
    login["/login + safe returnTo"]
    restore["Khôi phục session email/Google"]
    api["Cart API + bearer token"]
    cart[("User Cart + CartLine PostgreSQL")]
    projection["Projection giá/tồn kho/shop hiện tại"]
    screen["Header count + /cart đa shop"]
    mutate["Quantity, select line/shop/all, remove"]
    conflict{"Version còn mới?"}
    reload["GET /api/v1/cart"]

    buyer --> entry --> auth
    auth -->|"Chưa"| login --> restore --> entry
    auth -->|"Rồi"| api --> cart --> projection --> screen --> mutate --> conflict
    conflict -->|"Có"| cart
    conflict -->|"409 stale"| reload --> projection
```

Mọi endpoint `/api/v1/cart/**` yêu cầu bearer session hợp lệ và chỉ lấy owner từ tài khoản đã xác
thực. Khách không gọi Cart API, header hiển thị 0 và `/cart` cung cấp login handoff. Không có guest
cookie, guest cart, merge endpoint hoặc cleanup job. Khi đăng xuất, `CartProvider` xóa ngay projection
riêng tư khỏi bộ nhớ. Mọi mutation trả lại toàn bộ projection đã xác nhận và các điều chỉnh số
lượng/giá có kiểu rõ ràng.

### Chính sách xác thực cho các phase tiếp theo

```mermaid
flowchart TD
    feature["Tính năng mới"] --> private{"Có lưu/đọc state riêng của user hoặc thực hiện private action?"}
    private -->|"Không"| public["Cho phép public: home, search, category, product, shop"]
    private -->|"Có"| require["Bắt đăng nhập mặc định"]
    require --> scoped["Resolve owner từ session + authorization theo resource"]
    scoped --> protected["Cart, checkout, order, address, voucher riêng, review, follow, chat, seller/admin"]
```

Một task sau chỉ được mở hành động user-scoped cho khách khi OpenSpec của task đó định nghĩa rõ mô
hình identity, privacy, abuse và CSRF riêng.

### Bảo vệ mutation toàn ứng dụng

```mermaid
flowchart TD
    request["Unsafe browser request"]
    origin{"Origin khớp allowlist tuyệt đối?"}
    media{"Không override method; JSON hợp lệ; body <= 100 KiB?"}
    class{"Security class của route?"}
    ordinary["Chạy guard rồi mới vào domain service"]
    oauth["Google callback có state/OIDC verifier"]
    webhook["Provider webhook có signature verifier"]
    deny["403/413/415 Problem Details đã làm sạch"]

    request --> origin
    origin -->|"Không"| deny
    origin -->|"Có"| media
    media -->|"Không"| deny
    media -->|"Có"| class
    class -->|"Ordinary"| ordinary
    class -->|"Google OAuth"| oauth
    class -->|"Signed webhook"| webhook
```

Rate limiter tổng quát chưa nằm trong T16; auth limiter hiện có được giữ nguyên.

## 12. Báo giá có thẩm quyền và vận chuyển mô phỏng T17

```mermaid
flowchart TD
    buyer(["Buyer đã đăng nhập mở /cart"])
    cart["CartProvider tải cart và ETag"]
    addresses["Tải địa chỉ thuộc tài khoản"]
    hasAddress{"Có địa chỉ mặc định hoặc đã chọn?"}
    addressHandoff["Thông báo cần địa chỉ → /account/addresses"]
    services["Mặc định STANDARD cho từng shop được chọn"]
    request["POST /api/v1/cart/quote<br/>address + services + If-Match"]
    origin["Origin/media guard toàn ứng dụng"]
    auth["AuthGuard resolve owner từ session"]
    snapshot["Repeatable-read: kiểm tra address owner + cart version"]
    version{"ETag còn hiện hành?"}
    conflict["409 Problem Details"]
    refresh["Reload cart và requote"]
    facts["Đọc lại price, compare-at, stock, weight, shop hiện tại"]
    eligibility["Loại line unavailable hoặc thiếu stock"]
    grouping["Gộp 1 shipment cho mỗi shop"]
    calculator["Pricing-v2 + voucher-v1 + mock-v1<br/>integer VND, zone, weight, ETA"]
    validate["Web kiểm tra toàn bộ contract và phép cộng"]
    display["Hiển thị line/shop/ship/discount/payable đã xác nhận"]
    changed{"Address, service hoặc cart thay đổi?"}
    stale["Đánh dấu stale + abort/sequence request cũ"]
    checkoutBoundary["Display-only; checkout tương lai phải tính lại"]

    buyer --> cart --> addresses --> hasAddress
    hasAddress -->|"Không"| addressHandoff
    hasAddress -->|"Có"| services --> request --> origin --> auth --> snapshot --> version
    version -->|"Không"| conflict --> refresh --> request
    version -->|"Có"| facts --> eligibility --> grouping --> calculator --> validate --> display --> changed
    changed -->|"Có"| stale --> request
    changed -->|"Không"| checkoutBoundary
```

Browser không gửi giá, số lượng, phí hoặc tổng tiền vào quote. Backend tính lại từ PostgreSQL bằng
số nguyên VND và không ghi dữ liệu. Mỗi shop có một shipment `MOCK` với `ECONOMY`, `STANDARD` hoặc
`EXPRESS`; surcharge dựa trên tỉnh/thành cũ và tổng trọng lượng variant. Response cũ không được ghi
đè lựa chọn mới; đăng xuất xóa quote riêng tư khỏi bộ nhớ.

## 13. Preview voucher T18 và transaction checkout tương lai T19

```mermaid
flowchart TD
    buyer(["Buyer đã đăng nhập ở /cart"])
    select["Nhập mã shop, Shopee hoặc miễn phí vận chuyển"]
    apply["Bấm Áp dụng"]
    quote["POST /api/v1/cart/quote<br/>address + services + vouchers + If-Match"]
    snapshot["Repeatable-read snapshot<br/>cart, catalog, address, shipping, voucher, usage"]
    normalize["Chuẩn hóa code uppercase và kiểm tra cấu trúc"]
    eligibility["Enabled + [startsAt, endsAt) + scope<br/>minimum spend + global/buyer limits"]
    rejected["REJECTED + lý do ổn định<br/>không tạo discount"]
    stack["Shop theo thứ tự → platform → free shipping"]
    allocation["Integer VND + largest remainder<br/>đối soát line/shop/summary"]
    display["Web validate pricing-v2/voucher-v1<br/>hiển thị số tiền từ server"]
    previewBoundary["Preview read-only<br/>không reserve hoặc consume"]
    t19["T19 checkout transaction"]
    recalc["Tính lại và khóa usage theo voucher ID"]
    consume["consumeInTransaction<br/>purchase reference idempotent"]
    commit{"Order và mọi redemption cùng commit?"}
    success["Commit order + counters + audit"]
    rollback["Rollback toàn bộ"]

    buyer --> select --> apply --> quote --> normalize --> snapshot --> eligibility
    eligibility -->|"Không hợp lệ"| rejected --> display
    eligibility -->|"Hợp lệ"| stack --> allocation --> display --> previewBoundary
    previewBoundary -.->|"Consumer tương lai, không phải màn hình T18"| t19
    t19 --> recalc --> consume --> commit
    commit -->|"Có"| success
    commit -->|"Không"| rollback
```

Mã hợp lệ về cấu trúc nhưng không đủ điều kiện vẫn trả quote `200` cùng lý do an toàn; request có
field tiền, mã trùng hoặc slot trùng bị từ chối ở contract/DTO. T18 chỉ cung cấp preview và seam nội
bộ cho T19. Không có endpoint consume công khai; checkout phải sở hữu transaction và dùng cùng kết
quả tính lại có thẩm quyền trước khi ghi order, usage counter và redemption audit.

## 14. Checkout COD đa shop và purchase snapshot T19

```mermaid
flowchart TD
    buyer(["Buyer đã đăng nhập"])
    cart["/cart có quote hiện hành"]
    draft["sessionStorage draft v1<br/>chỉ ID, service và voucher code"]
    checkout["/checkout tải cart + address"]
    preview["POST /api/v1/checkout/preview<br/>If-Match cart version"]
    recalc["RepeatableRead: pricing-v2 + voucher-v1 + mock-v1"]
    blockers{"Có blocker?"}
    review["Hiển thị snapshot, ETA, voucher và tổng từ server"]
    edit{"Đổi address/service/note?"}
    stale["Đánh dấu stale + hủy response cũ"]
    key["Tạo/reuse UUID idempotency theo submit intent"]
    confirm["POST /api/v1/checkout/cod<br/>fingerprint + If-Match + Idempotency-Key"]
    lock["Serializable + advisory intent lock + cart FOR UPDATE"]
    replay{"Đã có buyer + key?"}
    digest{"Request digest giống?"}
    existing["200 replay purchase cũ"]
    keyConflict["409 idempotency conflict"]
    rebuild["Tính lại checkout và so fingerprint"]
    changed{"Preview còn khớp?"}
    reviewAgain["409 preview changed<br/>buyer xem tổng mới"]
    write["Ghi Purchase + 1 ShopOrder/shop + OrderLine snapshots"]
    voucher["Consume voucher + usage/redemption"]
    cleanup["Xóa đúng line đã mua + tăng cart version một lần"]
    commit{"Commit thành công?"}
    rollback["Rollback toàn bộ graph, voucher và cart"]
    success["201 purchaseReference"]
    result["/checkout/success/:reference"]
    ownerGet["GET owner-scoped committed snapshot"]
    missing["404 giống nhau cho missing/foreign"]

    buyer --> cart --> draft --> checkout --> preview --> recalc --> blockers
    blockers -->|"Có"| review
    blockers -->|"Không"| review --> edit
    edit -->|"Có"| stale --> preview
    edit -->|"Không"| key --> confirm --> lock --> replay
    replay -->|"Có"| digest
    digest -->|"Giống"| existing --> result
    digest -->|"Khác"| keyConflict
    replay -->|"Chưa"| rebuild --> changed
    changed -->|"Không"| reviewAgain --> review
    changed -->|"Có"| write --> voucher --> cleanup --> commit
    commit -->|"Không"| rollback
    commit -->|"Có"| success --> result --> ownerGet
    ownerGet -->|"Không thuộc buyer"| missing
```

Fingerprint loại `evaluatedAt` nhưng bao gồm cart version, full address, line/product/variant snapshot,
service, shipping, note, voucher allocations và toàn bộ phép cộng tiền. Hai request đồng thời cùng intent
hội tụ về một purchase; serialization conflict PostgreSQL `40001` được retry có giới hạn. Trang kết quả
chỉ đọc snapshot đã commit nên catalog thay đổi sau đó không làm đổi nội dung đơn. T19 kiểm tra tồn kho
lúc confirm nhưng chưa reserve hoặc decrement tồn kho; no-oversell giữa nhiều buyer thuộc T24.

## 15. Order history, lifecycle timeline và hủy đơn T20

```mermaid
flowchart TD
    buyer(["Buyer đã đăng nhập"])
    list["/account/orders + status filter"]
    listApi["GET /api/v1/account/orders<br/>opaque cursor + owner SQL"]
    snapshots["ShopOrder + committed snapshots"]
    cards["Order cards theo từng shop"]
    detail["/account/orders/:orderReference"]
    detailApi["GET owner detail + ETag + timeline"]
    allowed{"Server cho phép hủy?"}
    modal["Chọn reason + giữ một UUID retry"]
    cancel["POST /cancel<br/>If-Match + Idempotency-Key"]
    guard["Origin + Auth + strict parser"]
    lock["Lock ShopOrder thuộc buyer"]
    replay{"Key đã tồn tại?"}
    digest{"Digest giống?"}
    original["200 kết quả đã commit"]
    keyConflict["409 idempotency conflict"]
    version{"Version hiện hành<br/>và còn pending?"}
    stale["409 + web refresh detail"]
    update["CANCELLED + version increment"]
    event["Append BUYER timeline event"]
    commit["Atomic commit + updated detail"]

    buyer --> list --> listApi --> snapshots --> cards --> detail --> detailApi --> allowed
    allowed -->|"Không"| detail
    allowed -->|"Có"| modal --> cancel --> guard --> lock --> replay
    replay -->|"Có"| digest
    digest -->|"Giống"| original --> detail
    digest -->|"Khác"| keyConflict
    replay -->|"Chưa"| version
    version -->|"Không"| stale --> detailApi
    version -->|"Có"| update --> event --> commit --> detail
```

## 16. Đánh giá xác thực T21

```mermaid
flowchart TD
    buyer["Buyer mở đơn DELIVERED"] --> capability["GET order detail: review capability theo từng line"]
    capability --> eligible{"Line chưa được review?"}
    eligible -->|Không| existing["Hiện trạng đã đánh giá, không tạo bản ghi thứ hai"]
    eligible -->|Có| stage["POST review-media multipart: xác thực ảnh, owner, hạn 24 giờ"]
    stage --> create["POST review với Idempotency-Key"]
    create --> ownership["Transaction kiểm tra buyer + order line + DELIVERED"]
    ownership --> attach["Attach media STAGED của chính buyer"]
    attach --> aggregate["Tính lại rating product và shop từ VISIBLE reviews"]
    aggregate --> public["GET public review list: cursor + filter sao"]
    public --> edit["PATCH author review với If-Match review version"]
    edit --> stale{"ETag còn mới?"}
    stale -->|Không| reload["409, tải canonical review rồi giữ form để retry"]
    stale -->|Có| aggregate
```

Review chỉ gắn với một `OrderLine` đã giao và không public dữ liệu đơn hàng, email, địa chỉ, storage key hay trạng thái staging. Ảnh chỉ public sau khi được attach; ảnh staged hết hạn có cleanup command ở local storage. `HIDDEN` đã có persistence/audit boundary cho moderation sau này, vì thế không xuất hiện trong list public hay aggregate.

```mermaid
stateDiagram-v2
    [*] --> PENDING_CONFIRMATION
    PENDING_CONFIRMATION --> AWAITING_PICKUP
    PENDING_CONFIRMATION --> CANCELLED: Buyer hoặc internal actor
    AWAITING_PICKUP --> SHIPPING
    AWAITING_PICKUP --> CANCELLED: Internal actor tương lai
    SHIPPING --> DELIVERED
    DELIVERED --> RETURN_REQUESTED
    RETURN_REQUESTED --> RETURNED
    RETURN_REQUESTED --> REFUNDED
    RETURNED --> REFUNDED
    CANCELLED --> [*]
    REFUNDED --> [*]
```

Mỗi transition tăng `ShopOrder.version` đúng một lần và ghi một `OrderTimelineEvent` trong cùng
transaction. Buyer chỉ có command hủy ở `PENDING_CONFIRMATION`; các cạnh seller/return được lưu trong
state machine để task sau tái sử dụng nhưng T20 chưa mở endpoint tương ứng. List/detail chỉ dùng snapshot
T19 và filter ownership trong PostgreSQL, nên reference missing và foreign cùng trả `404` không liệt kê.

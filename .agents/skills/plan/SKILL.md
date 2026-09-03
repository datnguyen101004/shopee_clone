---
name: resolve-issue
description: "Workflow 3 bước giải quyết vấn đề với OpenSpec trên Codex: (1) Tạo UI/UX Spec bằng tiếng Việt, (2) Tạo OpenSpec planning artifacts và bản Việt hóa design, (3) Apply Change, tạo flow nghiệp vụ dễ hiểu và kiểm thử. Dùng khi tạo hoặc áp dụng proposal/change OpenSpec và khi cần đặc tả UI/UX trước implementation."
---

# Codex OpenSpec Workflow

Quy trình chuẩn 3 bước khi giải quyết vấn đề và làm việc với OpenSpec trên Codex.

---

## Bước 1 — Tạo UI Spec / UX Spec

Trước khi đi vào kỹ thuật hay viết code, bước đầu tiên là xác định và mô tả chi tiết giao diện và trải nghiệm người dùng (UI/UX Spec):

1. **UI sẽ trông như thế nào**:
   - Bố cục (Layout), vị trí các thành phần, phân cấp thị giác (Visual Hierarchy), màu sắc, kích thước, typography.
2. **Tương tác của người dùng (User Interaction)**:
   - Khi user click, tap, hover, focus thì xảy ra hiện tượng/phản hồi gì (đổi màu, viền sáng, nâng nhẹ, tooltip...).
3. **Các trạng thái của giao diện (UI States)**:
   - **Loading state**: Hiển thị skeleton loader, spinner, thanh tiến trình ra sao.
   - **Empty state**: Khi chưa có dữ liệu thì hiển thị hình ảnh, thông điệp và nút hành động gì.
   - **Success state**: Thông báo thành công, hiệu ứng chúc mừng hoặc cập nhật trực tiếp trên giao diện.
4. **Xử lý lỗi (Error Handling & Feedback)**:
   - Lỗi nhập liệu hoặc lỗi hệ thống thì hiện thông báo gì (inline message, toast banner, modal cảnh báo).
   - Hướng dẫn người dùng cách xử lý hoặc nút thử lại (Retry).
5. **Animation & Transition**:
   - Hiệu ứng chuyển động (Fade, Slide, Scale), thời gian diễn ra (duration) và độ mượt (easing).

> [!NOTE]
> **Nguyên tắc Bước 1**: Chỉ tập trung 100% vào **hành vi và trải nghiệm người dùng (UX/UI Behavior)**. Hoàn toàn không đề cập đến code, architecture, database, API... ở bước này.
>
> **Ngôn ngữ Bước 1**: Mọi tài liệu UI/UX được tạo trong bước này MUST viết bằng **tiếng Việt**.

---

## Bước 2 — Tạo Proposal (OpenSpec Proposal)

> [!IMPORTANT]
> **Ngôn ngữ Bước 2**: Các OpenSpec planning artifact chính được tạo hoặc cập nhật trong bước này MUST viết bằng **tiếng Anh**, bao gồm `proposal.md`, `design.md`, `specs/**/*.md` và `tasks.md`. Riêng `design.vi.md` MUST viết bằng **tiếng Việt**. Giữ nguyên tên kỹ thuật, endpoint và định danh code theo convention của repository.

1. Dùng OpenSpec để tạo proposal (slash command `/openspec-proposal` hoặc `/opsx:propose` / `openspec new change` + generate artifacts).
2. Sau khi proposal và các artifact (`proposal.md`, `design.md`, `tasks.md`, `specs`) được tạo xong:
   - Tạo thêm `<changeRoot>/design.vi.md` là bản Việt hóa đầy đủ, dễ đọc của `design.md`.
   - `design.md` là bản tiếng Anh chuẩn để OpenSpec sử dụng; `design.vi.md` phải đồng bộ nội dung và quyết định với bản tiếng Anh, không tự thêm hoặc lược bỏ quyết định kỹ thuật.
   - Giữ nguyên endpoint, tên thành phần, tên định danh và thuật ngữ kỹ thuật cần thiết trong `design.vi.md`; diễn giải phần còn lại bằng tiếng Việt tự nhiên.
   - Liệt kê rõ ràng **danh sách công việc (tasks)** từ `tasks.md`.
   - Liệt kê rõ ràng các công nghệ và kiến trúc được sử dụng (từ `design.md`).
   - Liệt kê rõ ràng **các API cần kiểm thử** (endpoints, request/response, edge cases, auth...).
3. Xác định các task hoặc nhóm task quan trọng. Một task được xem là quan trọng khi có ít nhất một trong các đặc điểm sau:
   - Concurrency, idempotency, locking hoặc race condition;
   - Transaction nhiều bước, rollback hoặc exactly-once;
   - State machine, transition hoặc reversal;
   - Authorization, security, privacy hoặc dữ liệu nhạy cảm;
   - Ảnh hưởng xuyên nhiều module/API hoặc có nguy cơ làm trạng thái hệ thống không nhất quán.
4. Không tạo hoặc cập nhật `flow.md` trong Bước 2. Flow chỉ được viết ở Bước 3 sau khi implementation thực tế đã rõ ràng.
5. Báo cáo vị trí proposal, `design.md`, `design.vi.md`, tasks, specs, kiến trúc và API cần test.
6. **Dừng lại. Không implement code.** Chờ user review và xác nhận trước khi sang Bước 3.

---

## Bước 3 — Apply Change + Flow dễ hiểu & Testing

1. Khi user yêu cầu apply (`/openspec-apply` / `/opsx:apply` hoặc tương đương):
   - Thực hiện apply change theo tasks đã liệt kê.
   - Implement code theo đúng UI/UX Spec, design và specs.
2. Khi hoàn thành toàn bộ tasks, tạo hoặc cập nhật `<changeRoot>/flow.md`, thông thường là `openspec/changes/<change-name>/flow.md`:
   - Viết bằng tiếng Việt, dùng cách diễn đạt đơn giản để cả người không làm kỹ thuật cũng hiểu được tính năng vận hành như thế nào.
   - Mở đầu bằng mục đích của flow, người tham gia, điều kiện bắt đầu và kết quả mong đợi.
   - Trình bày tuần tự hành động của người dùng, phản hồi nhìn thấy được, nhánh thành công, nhánh lỗi và cách thử lại hoặc khôi phục.
   - Kèm ít nhất một ví dụ thực tế có dữ liệu minh họa cụ thể nhưng không chứa dữ liệu nhạy cảm.
   - Có thể dùng sơ đồ luồng nếu nó giúp dễ hiểu hơn, nhưng sơ đồ chỉ mô tả hành vi nghiệp vụ và trải nghiệm người dùng.
   - Không chèn source code, pseudocode, tên class/module nội bộ, database schema hoặc sơ đồ kiến trúc phần mềm.
   - Flow phải phản ánh hành vi đã implement và đã kiểm thử, không mô tả kế hoạch chưa thực hiện.

   Ví dụ cách giải thích một flow thông báo:

   > Khi quản trị viên có 1 thông báo chưa đọc, biểu tượng chuông hiển thị số 1. Quản trị viên mở danh sách thông báo và thấy nội dung tương ứng. Sau khi mở thông báo, số đếm trở về 0. Nếu tải danh sách thất bại, giao diện giữ nguyên trạng thái chưa đọc, hiển thị thông báo lỗi và cung cấp nút “Thử lại”.
3. Thực hiện kiểm thử:
   - Chạy Unit tests / Integration tests cho các component, services và API liên quan.
   - Chạy E2E tests (Playwright) trên các breakpoint (Mobile, Tablet, Desktop) nếu có thay đổi UI.
4. Báo cáo hoàn thành: liệt kê tasks đã xong + vị trí và nội dung chính của `<changeRoot>/flow.md` + kết quả kiểm thử.

---

## Quy tắc bắt buộc

- Luôn tuân thủ tuần tự: **Bước 1 (UI/UX Spec) ➔ Bước 2 (Proposal & Planning) ➔ Bước 3 (Apply & Testing)**.
- Không skip bước UI/UX Spec khi có can thiệp giao diện và không skip bước liệt kê tasks + API cần test.
- Mỗi change phải có file `flow.md` riêng tại root của change: `openspec/changes/<change-name>/flow.md`.
- Không tạo `flow.md` trong Bước 2. Chỉ tạo hoặc cập nhật file này ở Bước 3 sau khi đã có implementation và kết quả kiểm thử thực tế.
- `flow.md` phải tập trung vào hành vi nghiệp vụ, trải nghiệm người dùng và ví dụ thực tế; không chứa code hoặc mô tả kiến trúc.
- Bước 2 phải có cả `design.md` tiếng Anh và bản Việt hóa đồng bộ `design.vi.md`.
- Không tạo file `technical-solutions.md`; các quyết định kỹ thuật cần thiết được trình bày trong `design.md` và `design.vi.md`.
- Dùng tiếng Việt khi giao tiếp với user trừ khi user yêu cầu khác.
- Quy tắc giao tiếp không thay đổi ngôn ngữ artifact: **Bước 1 viết tài liệu UI/UX bằng tiếng Việt; Bước 2 viết planning artifact chính bằng tiếng Anh và viết thêm `design.vi.md` bằng tiếng Việt; Bước 3 viết `flow.md` bằng tiếng Việt**.
- Mặc định thực thi và cấu hình trên môi trường **local**; chỉ thao tác hoặc đụng đến môi trường **production** khi có yêu cầu rõ ràng từ user.

---

## Khi nào kích hoạt

- User nói "tạo proposal", "openspec propose", "bắt đầu change", "list tasks và api test", "vẽ task quan trọng".
- User muốn mô tả UI/UX trước khi code một tính năng hay sửa lỗi giao diện.
- User nói "apply change", "implement", "tạo flow.md", "cập nhật flow của change".
- Bất kỳ request nào liên quan đến workflow OpenSpec trên Codex.

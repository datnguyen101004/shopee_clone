---
name: resolve-issue
description: Workflow 3 bước giải quyết vấn đề với OpenSpec trên Codex: (1) Tạo UI/UX Spec (hành vi, tương tác, trạng thái, animation), (2) Tạo Proposal OpenSpec + flow.md + list tasks/API test, (3) Apply Change + cập nhật diagram và kiểm thử.
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

---

## Bước 2 — Tạo Proposal (OpenSpec Proposal)

1. Dùng OpenSpec để tạo proposal (slash command `/openspec-proposal` hoặc `/opsx:propose` / `openspec new change` + generate artifacts).
2. Sau khi proposal và các artifact (proposal.md, design.md, tasks.md, specs) được tạo xong:
   - Liệt kê rõ ràng **danh sách công việc (tasks)** từ `tasks.md`.
   - Liệt kê rõ ràng các công nghệ và kiến trúc được sử dụng (từ `design.md`).
   - Liệt kê rõ ràng **các API cần kiểm thử** (endpoints, request/response, edge cases, auth...).
3. Xác định các task hoặc nhóm task quan trọng. Một task được xem là quan trọng khi có ít nhất một trong các đặc điểm sau:
   - Concurrency, idempotency, locking hoặc race condition;
   - Transaction nhiều bước, rollback hoặc exactly-once;
   - State machine, transition hoặc reversal;
   - Authorization, security, privacy hoặc dữ liệu nhạy cảm;
   - Ảnh hưởng xuyên nhiều module/API hoặc có nguy cơ làm trạng thái hệ thống không nhất quán.
4. Tạo hoặc cập nhật `<changeRoot>/flow.md`, thông thường là `openspec/changes/<change-name>/flow.md`:
   - Dùng Mermaid nếu có thể; dùng ASCII khi Mermaid không diễn đạt rõ hơn.
   - Vẽ một sơ đồ cho mỗi flow quan trọng hoặc nhóm task liên quan, không cần vẽ task CRUD/boilerplate đơn giản.
   - Ghi rõ task ID liên quan, happy path, các nhánh lỗi/race/rollback quan trọng và boundary dữ liệu khi có yếu tố privacy.
   - Ở bước proposal, ghi rõ sơ đồ mô tả **planned flow**, chưa khẳng định đây là implementation thực tế.
5. Báo cáo vị trí `flow.md` cùng với proposal, tasks, kiến trúc và API cần test.
6. **Dừng lại. Không implement code.** Chờ user review và xác nhận trước khi sang Bước 3.

---

## Bước 3 — Apply Change + Diagram & Testing

1. Khi user yêu cầu apply (`/openspec-apply` / `/opsx:apply` hoặc tương đương):
   - Thực hiện apply change theo tasks đã liệt kê.
   - Implement code theo đúng UI/UX Spec, design và specs.
2. Khi hoàn thành toàn bộ tasks:
   - Cập nhật chính file `<changeRoot>/flow.md` đã tạo ở Bước 2.
   - Đối chiếu từng sơ đồ planned với code và test đã hoàn thành; sửa node, nhánh, state, transaction boundary và task mapping để phản ánh luồng thực tế.
   - Đánh dấu sơ đồ là **implemented flow**. Không giữ mô tả planned đã lỗi thời.
3. Thực hiện kiểm thử:
   - Chạy Unit tests / Integration tests cho các component, services và API liên quan.
   - Chạy E2E tests (Playwright) trên các breakpoint (Mobile, Tablet, Desktop) nếu có thay đổi UI.
4. Báo cáo hoàn thành: liệt kê tasks đã xong + vị trí diagram trong `<changeRoot>/flow.md` + kết quả kiểm thử.

---

## Quy tắc bắt buộc

- Luôn tuân thủ tuần tự: **Bước 1 (UI/UX Spec) ➔ Bước 2 (Proposal & Planning) ➔ Bước 3 (Apply & Testing)**.
- Không skip bước UI/UX Spec khi có can thiệp giao diện và không skip bước liệt kê tasks + API cần test.
- Mỗi change phải có file `flow.md` riêng tại root của change: `openspec/changes/<change-name>/flow.md`.
- Tạo `flow.md` ngay trong Bước 2 cho các task quan trọng và cập nhật lại sau Bước 3; không chờ đến cuối apply mới tạo.
- Không vẽ sơ đồ cho mọi checkbox một cách máy móc; gom các task cùng một critical flow và ưu tiên sơ đồ giúp nhìn thấy dependency, state, concurrency, transaction hoặc privacy boundary.
- Dùng tiếng Việt khi giao tiếp với user trừ khi user yêu cầu khác.
- Mặc định thực thi và cấu hình trên môi trường **local**; chỉ thao tác hoặc đụng đến môi trường **production** khi có yêu cầu rõ ràng từ user.

---

## Khi nào kích hoạt

- User nói "tạo proposal", "openspec propose", "bắt đầu change", "list tasks và api test", "vẽ task quan trọng".
- User muốn mô tả UI/UX trước khi code một tính năng hay sửa lỗi giao diện.
- User nói "apply change", "implement", "thêm diagram vào flow.md", "cập nhật flow của change".
- Bất kỳ request nào liên quan đến workflow OpenSpec trên Codex.

---
name: resolve-issue
description: Workflow 2 bước dùng OpenSpec với Codex. Trigger khi user muốn tạo proposal OpenSpec, apply change, liệt kê tasks/API cần test, hoặc tạo diagram cho các task quan trọng. Dùng cho quy trình propose rồi apply có kiểm thử và flow.md riêng trong thư mục change.
---

# Codex OpenSpec Workflow

Quy trình 2 bước bắt buộc khi làm việc với OpenSpec trên Codex.

## Bước 1 — Tạo Proposal

1. Dùng OpenSpec để tạo proposal (slash command `/openspec-proposal` hoặc `/opsx:propose` / `openspec new change` + generate artifacts).
2. Sau khi proposal và các artifact (proposal.md, design.md, tasks.md, specs) được tạo xong:
   - Liệt kê rõ ràng **danh sách công việc (tasks)** từ `tasks.md`.
   - Liệt kê rõ ràng các công nghệ và kiến trúc được sử dụng (từ `design.md`).
   - Liệt kê rõ ràng **các API cần kiểm thử** (endpoints, request/response, edge cases, auth...).
3. Xác định các task hoặc nhóm task quan trọng. Một task được xem là quan trọng khi có ít nhất một trong các đặc điểm sau:
   - concurrency, idempotency, locking hoặc race condition;
   - transaction nhiều bước, rollback hoặc exactly-once;
   - state machine, transition hoặc reversal;
   - authorization, security, privacy hoặc dữ liệu nhạy cảm;
   - ảnh hưởng xuyên nhiều module/API hoặc có nguy cơ làm trạng thái hệ thống không nhất quán.
4. Tạo hoặc cập nhật `<changeRoot>/flow.md`, thông thường là `openspec/changes/<change-name>/flow.md`:
   - Dùng Mermaid nếu có thể; dùng ASCII khi Mermaid không diễn đạt rõ hơn.
   - Vẽ một sơ đồ cho mỗi flow quan trọng hoặc nhóm task liên quan, không cần vẽ task CRUD/boilerplate đơn giản.
   - Ghi rõ task ID liên quan, happy path, các nhánh lỗi/race/rollback quan trọng và boundary dữ liệu khi có yếu tố privacy.
   - Ở bước proposal, ghi rõ sơ đồ mô tả **planned flow**, chưa khẳng định đây là implementation thực tế.
5. Báo cáo vị trí `flow.md` cùng với proposal, tasks, kiến trúc và API cần test.
6. Dừng lại. Không implement code. Chờ user review và xác nhận trước khi sang Bước 2.

## Bước 2 — Apply Change + Diagram

1. Khi user yêu cầu apply (`/openspec-apply` / `/opsx:apply` hoặc tương đương):
   - Thực hiện apply change theo tasks đã liệt kê.
   - Implement code theo đúng design và specs.
2. Khi hoàn thành toàn bộ tasks:
   - Cập nhật chính file `<changeRoot>/flow.md` đã tạo ở Bước 1.
   - Đối chiếu từng sơ đồ planned với code và test đã hoàn thành; sửa node, nhánh, state, transaction boundary và task mapping để phản ánh luồng thực tế.
   - Đánh dấu sơ đồ là **implemented flow**. Không giữ mô tả planned đã lỗi thời.
3. Báo cáo hoàn thành: liệt kê tasks đã xong + vị trí diagram trong `<changeRoot>/flow.md`.

## Quy tắc bắt buộc

- Luôn tách rõ Bước 1 (planning only) và Bước 2 (implementation).
- Không skip bước liệt kê tasks + API cần test.
- Mỗi change phải có file `flow.md` riêng tại root của change: `openspec/changes/<change-name>/flow.md`.
- Tạo `flow.md` ngay trong Bước 1 cho các task quan trọng và cập nhật lại sau Bước 2; không chờ đến cuối apply mới tạo.
- Không dùng `flow.md` ở root repository làm nơi mặc định. Chỉ cập nhật thêm file root nếu user yêu cầu rõ hoặc convention khác của repository bắt buộc, nhưng change-local `flow.md` vẫn phải tồn tại.
- Không vẽ sơ đồ cho mọi checkbox một cách máy móc; gom các task cùng một critical flow và ưu tiên sơ đồ giúp nhìn thấy dependency, state, concurrency, transaction hoặc privacy boundary.
- Nếu `<changeRoot>/flow.md` chưa tồn tại thì tạo mới; nếu đã tồn tại thì giữ nội dung còn đúng và cập nhật có chọn lọc.
- Dùng tiếng Việt khi giao tiếp với user trừ khi user yêu cầu khác.
- Ưu tiên dùng lệnh OpenSpec native của Codex nếu có (`/openspec-proposal`, `/openspec-apply`...).

## Khi nào kích hoạt

- User nói "tạo proposal", "openspec propose", "bắt đầu change", "list tasks và api test", "vẽ task quan trọng".
- User nói "apply change", "implement", "thêm diagram vào flow.md", "cập nhật flow của change".
- Bất kỳ request nào liên quan đến workflow OpenSpec 2 bước trên Codex.

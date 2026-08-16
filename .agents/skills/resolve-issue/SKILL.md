---
name: resolve-issue
description: Workflow 2 bước dùng OpenSpec với Codex. Trigger khi user muốn tạo proposal OpenSpec, apply change, liệt kê tasks/API cần test, hoặc thêm diagram vào flow.md. Dùng cho quy trình propose rồi apply có kiểm thử và sơ đồ.
---

# Codex OpenSpec Workflow

Quy trình 2 bước bắt buộc khi làm việc với OpenSpec trên Codex.

## Bước 1 — Tạo Proposal

1. Dùng OpenSpec để tạo proposal (slash command `/openspec-proposal` hoặc `/opsx:propose` / `openspec new change` + generate artifacts).
2. Sau khi proposal và các artifact (proposal.md, design.md, tasks.md, specs) được tạo xong:
   - Liệt kê rõ ràng **danh sách công việc (tasks)** từ `tasks.md`.
   - Liệt kê rõ ràng **các API cần kiểm thử** (endpoints, request/response, edge cases, auth...).
3. Dừng lại. Không implement code. Chờ user review và xác nhận trước khi sang Bước 2.

## Bước 2 — Apply Change + Diagram

1. Khi user yêu cầu apply (`/openspec-apply` / `/opsx:apply` hoặc tương đương):
   - Thực hiện apply change theo tasks đã liệt kê.
   - Implement code theo đúng design và specs.
2. Khi hoàn thành toàn bộ tasks:
   - Thêm hoặc cập nhật **diagram** vào file `flow.md` (Mermaid hoặc ASCII diagram mô tả flow mới / thay đổi).
   - Diagram phải phản ánh luồng thực tế sau khi apply (request flow, state transitions, component interaction...).
3. Báo cáo hoàn thành: liệt kê tasks đã xong + vị trí diagram trong `flow.md`.

## Quy tắc bắt buộc

- Luôn tách rõ Bước 1 (planning only) và Bước 2 (implementation).
- Không skip bước liệt kê tasks + API cần test.
- Không bỏ qua việc thêm diagram vào `flow.md` khi apply xong.
- Nếu `flow.md` chưa tồn tại thì tạo mới.
- Dùng tiếng Việt khi giao tiếp với user trừ khi user yêu cầu khác.
- Ưu tiên dùng lệnh OpenSpec native của Codex nếu có (`/openspec-proposal`, `/openspec-apply`...).

## Khi nào kích hoạt

- User nói "tạo proposal", "openspec propose", "bắt đầu change", "list tasks và api test".
- User nói "apply change", "implement", "thêm diagram vào flow.md".
- Bất kỳ request nào liên quan đến workflow OpenSpec 2 bước trên Codex.
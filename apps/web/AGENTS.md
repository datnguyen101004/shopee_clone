<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Seller Workspace UI

Khi sửa giao diện `/seller/**` theo mẫu Sản phẩm, đọc [chuẩn giao diện Seller](../../docs/ui-ux/seller-workspace/UI-SPEC.md) và [bài học từ phản hồi](../../docs/ui-ux/seller-workspace/CORRECTIONS.md) trước khi sửa. Áp dụng cả cho agent không dùng skill/MCP. Prompt chỉ refactor code không tự cho phép redesign.

Phản hồi sai mẫu cần được ghi thành quy tắc có phạm vi trong tài liệu trên. Không dùng typecheck/unit tests để khẳng định đã khớp UI; báo riêng phần triển khai, hành vi và thị giác chưa xác minh.

Skill UI của project: [seller-workspace-ui](../../.agents/skills/frontend/seller-workspace-ui/SKILL.md). Đặc tả áp dụng cả cho Voucher và Chat trong Seller; không tự áp dụng mẫu Seller cho Buyer/Admin ngoài phạm vi yêu cầu.

## Admin Workspace UI

Khi sửa giao diện `/admin/**` theo chuẩn xanh dương–trắng, đọc [đặc tả Admin Workspace](../../docs/ui-ux/admin-workspace/UI-SPEC.md) cùng [chuẩn Seller](../../docs/ui-ux/seller-workspace/UI-SPEC.md) và `CORRECTIONS.md`. Giữ menu, quyền, API, validation và workflow riêng của Admin; chỉ dùng variant Admin trong scope `.admin-workspace` để không làm thay đổi Seller hoặc Buyer. Kiểm chứng hành vi và thị giác riêng; chỉ chạy E2E khi người dùng yêu cầu.

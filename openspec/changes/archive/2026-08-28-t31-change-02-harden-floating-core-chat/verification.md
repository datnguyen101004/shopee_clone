# Nhật ký xác minh T31 Change 2

Ngày chạy: 2026-08-28 (Asia/Ho_Chi_Minh)

## Đã chạy thành công

| Nhóm                                    | Kết quả                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| API Jest toàn bộ                        | 103 suite pass, 21 suite PostgreSQL opt-in skip; 445 pass, 84 skip / 529 test                |
| API chat + health + repair mục tiêu     | 6 suite pass; gồm OpenAPI, presence, outbox readiness và hard-delete guard                   |
| Contracts Vitest toàn bộ                | 25 file pass; 129 test pass                                                                  |
| Web Vitest toàn bộ                      | 81 file pass; 311 test pass                                                                  |
| API typecheck                           | pass                                                                                         |
| Workspace typecheck                     | 6 task pass                                                                                  |
| API lint + workspace lint               | pass; chỉ còn warning không chặn build                                                       |
| Production build                        | pass (API Nest + Web Next.js)                                                                |
| Prisma migration status                 | 45 migration, schema up to date                                                              |
| Applied migration checksum verification | 45 migration pass sau khi reconcile có kiểm soát                                             |
| Chat preflight sau repair               | hợp lệ, không còn invalid membership                                                         |
| Repair lần hai                          | thành công, mọi bảng còn 0 dòng thuộc conversation mục tiêu                                  |
| CI definition validation                | pass                                                                                         |
| PostgreSQL chat release gate            | 1 suite pass, 1 test pass trên database cô lập mới deploy đủ 45 migration                    |
| Real Socket.IO Playwright               | 21 pass tại mobile 360×800, tablet 768×1024, desktop 1440×900; không mock; gồm multi-tab     |
| Chat release verification theo thứ tự   | pass: migration status → checksum → preflight → repair lần hai → preflight → PostgreSQL gate |

## Kết quả cần theo dõi

Không còn test fail trong lần xác minh cuối. Lint vẫn phát hiện 39 warning hiện hữu (không có error), chủ yếu là cảnh báo `<img>` và một số hook/a11y warning ngoài phạm vi thay đổi chat.

Playwright mocked HTTP chat được gắn nhãn `[mocked-http]` và liệt kê đủ 12 test ở ba breakpoint. Playwright real PostgreSQL/Socket.IO dùng project `chat-real`, không mock ticket hoặc chặn Socket.IO; fixture tạo refresh token riêng cho từng breakpoint để refresh rotation không làm project kế tiếp bị 401. Job CI chạy project này với `CHAT_E2E_PREPARE=1`.

Lần chạy release gate cuối dùng database chính `shopee_clone` cho migration/checksum/preflight/repair
và database cô lập `shopee_chat_local_20260827` cho PostgreSQL suite. Repair lần hai chỉ báo cáo
0 dòng ở toàn bộ bảng liên quan, nên không có thay đổi dữ liệu bổ sung.

Sau khi có xác nhận xử lý database test, đã tạo backup
`shopee_clone_test-before-rerun-20260827-232956.sql`, xóa đúng shop soft-delete `Original shop`
không có bản ghi phụ thuộc, reconcile checksum compatibility migration và deploy thành công các
migration còn thiếu. `shopee_clone_test` hiện 45/45 migration, checksum pass, chat preflight hợp lệ
và PostgreSQL chat suite pass 1/1. Guarded repair conversation mục tiêu cũng đã chạy hai lần
trên database này; cả hai lần đều báo cáo 0 dòng trước/sau.

Lần chạy cuối ngày 2026-08-28 xác nhận web 81/81 file và 311/311 test, API 103/124 suite
(21 suite PostgreSQL được skip khi không bật opt-in) với 445/529 test pass (84 skip),
PostgreSQL opt-in 1/1, real Playwright 21/21, contracts 25/25 file và 129/129 test.
Real Playwright đã build production với `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3001`
để cookie refresh và Socket.IO dùng cùng origin kiểm thử; fixture được cleanup theo phạm vi.

## Lệnh release đã thêm

- `pnpm db:migration:checksums`
- `pnpm test:chat:database` với `RUN_CHAT_DATABASE_TESTS=1`
- `pnpm test:chat:real` với fixture refresh token thật hoặc `CHAT_E2E_PREPARE=1`
- `pnpm chat:release:verify` với `CHAT_REPAIR_CONFIRM` đúng conversation ID đã được phê duyệt

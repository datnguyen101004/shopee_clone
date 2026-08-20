## 1. Admin Contracts

- [x] 1.1 Add framework-neutral admin dashboard, list-query, user/shop/category/banner/module summaries, status-action, category-write, banner-write, module-settings, privileged-audit page, and Problem Details contracts in `@shopee-clone/contracts`.
- [x] 1.2 Parse and reject unknown keys, unsafe integers, malformed cursors, short reasons, external banner destinations, and non-admin-facing secret fields.
- [x] 1.3 Export parsers/guards from the contracts package and add contract tests for exact keys, pagination bounds, status enums, and redacted projections.

## 2. Persistence and Privileged Audit

- [x] 2.1 Add Prisma enums and `PrivilegedAuditEvent` with append-only relations, reason length checks, and list/filter indexes.
- [x] 2.2 Create one additive migration; do not alter T12 `RoleAuditEvent` shape.
- [x] 2.3 Add a transactional `recordPrivilegedAudit` helper that writes exactly one event with actor, target, action, reason, and safe before/after summaries.
- [x] 2.4 Prove database verification rejects blank reasons, missing actors, and mutation of existing audit rows.

## 3. Admin API Module

- [x] 3.1 Add `apps/api/src/admin` module, exception filter, and register it in `AppModule`.
- [x] 3.2 Implement `GET /api/v1/admin/dashboard` with bounded counts and `Cache-Control: private, no-store`.
- [x] 3.3 Implement cursor-paginated `GET /api/v1/admin/users` and `GET /api/v1/admin/users/:userId` safe summaries (id, displayName, email, status, roles, timestamps).
- [x] 3.4 Implement `POST /api/v1/admin/users/:userId/actions` for `SUSPEND`/`RESTORE` with reason, self-suspend denial, last-admin conflict, session revocation on suspend, and idempotent same-status behavior.
- [x] 3.5 Implement cursor-paginated `GET /api/v1/admin/shops` and `GET /api/v1/admin/shops/:shopId` plus `POST /api/v1/admin/shops/:shopId/actions` for suspend/restore; restore only if onboarding is `APPROVED`.
- [x] 3.6 Hook existing shop approval to also append a privileged-audit `APPROVE`/`REJECT` event without changing approval semantics.
- [x] 3.7 Keep existing `/api/v1/admin/users/:userId/roles*` and `/api/v1/admin/role-audit` unchanged.

## 4. Category and Homepage Configuration APIs

- [x] 4.1 Implement admin category list/tree, create, update, activate/deactivate, reorder, and delete with cycle detection and referential-integrity conflicts.
- [x] 4.2 Implement admin banner list/create/update/reorder/delete with same-origin destination and trusted media URL validation.
- [x] 4.3 Implement homepage-module settings list/update for enable, sort, title/subtitle, and UTC windows; `key`/`type` remain immutable.
- [x] 4.4 Confirm public `/api/v1/homepage` and catalog category reads honor the new operator-authored order and enablement with no contract-shape break.

## 5. Authorization, Audit Listing, and API Tests

- [x] 5.1 Apply `@RequireRoles('admin')`, AuthGuard, RolesGuard, and trusted-origin mutation rules to every new write route.
- [x] 5.2 Implement `GET /api/v1/admin/audit` newest-first cursor page with target/actor/action filters and no update/delete routes.
- [x] 5.3 Add Supertest matrix: guest 401, buyer/seller 403, admin success, origin denial, and no persistence on denied writes.
- [x] 5.4 Add service tests for last-admin, self-suspend, shop restore-without-approval, category product conflict, banner destination rejection, idempotent suspend, and audit event count = 1 per real change.

## 6. Admin Console UI

- [x] 6.1 Replace `/admin` placeholder with an admin shell (dashboard + nav) gated by `OperationalRoleGate role="admin"`.
- [x] 6.2 Add `/admin/users` list/detail with search, status filter, suspend/restore confirmation+reason, and existing grant/revoke controls.
- [x] 6.3 Add `/admin/shops` list/detail with onboarding approval and suspend/restore confirmation.
- [x] 6.4 Add `/admin/categories` hierarchy editor with reorder and delete/deactivate guards.
- [x] 6.5 Add `/admin/homepage` for banners and module settings.
- [x] 6.6 Add `/admin/audit` privileged-audit list; keep role-audit visible from user/roles context.
- [x] 6.7 Add frontend API helpers, component tests for confirmation/forbidden/empty states, and Playwright coverage for admin suspend plus buyer forbidden `/admin`.

## 7. Documentation and Quality Gates

- [x] 7.1 Document admin routes, status rules, last-admin protection, audit fields, and out-of-scope impersonation in `docs/` and `flow.md` (diagram during apply).
- [x] 7.2 Run contracts, API, web, and focused e2e suites for the admin journeys.
- [x] 7.3 Validate the OpenSpec change with `openspec validate build-admin-console --strict` before apply completion.

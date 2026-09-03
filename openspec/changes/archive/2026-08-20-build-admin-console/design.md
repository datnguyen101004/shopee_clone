## Context

See `proposal.md` for motivation. `/admin` currently renders a T12 role-audit teaser and a shop-approval form that requires a raw shop id. Existing admin APIs are only `POST /api/v1/admin/users/:userId/roles`, revoke, `GET /api/v1/admin/role-audit`, and `POST /api/v1/admin/shops/:shopId/approval`. Users already have `ACTIVE|SUSPENDED`; shops already have `ACTIVE|INACTIVE|SUSPENDED` plus onboarding. Categories, homepage modules, and banners are seed-managed and publicly read through `/api/v1/homepage`. Auth already fails closed for suspended users. T12 last-admin protection exists for role revoke and MUST be reused for user suspend.

## Goals / Non-Goals

**Goals:**

- Introduce one Nest `admin` capability module for dashboard, lists, status commands, catalog configuration, and privileged audit.
- Keep T12 role APIs and T22 shop approval as-is; compose them in the UI rather than duplicating command semantics.
- Make suspend/restore and catalog writes transactional with exactly one audit event on real change.
- Reuse Seller Center layout patterns for an admin shell under `/admin/*`.

**Non-Goals:**

- Impersonation cookies, "login as user", or dual-session switching.
- Multi-admin approval or maker-checker.
- Product moderation queues, reports, or review takedowns (T28).
- New global key-value feature-flag store; homepage modules are the selected platform settings.
- Changing public homepage contract shape beyond reflecting operator-authored data.

## Decisions

### 1. One admin module, existing role controllers stay

Add `apps/api/src/admin/` with dashboard, users, shops (status), categories, homepage-config, and privileged-audit controllers, all `@RequireRoles('admin')`, `AuthGuard`, `RolesGuard`, trusted-origin mutations, and a dedicated exception filter mapping to Problem Details.

Leave `AdminRoleController` and `AdminShopApprovalController` in their current modules. The console UI calls those existing routes for grant/revoke and onboarding decisions.

A single mega-controller was rejected because role and onboarding already have tested filters and DTOs. Splitting a new module keeps T12/T22 regressions isolated.

### 2. Privileged audit is a separate append-only table

Add `PrivilegedAuditEvent`:

| Field | Rule |
| --- | --- |
| `id` | UUID |
| `actorUserId` | authenticated admin; required |
| `targetType` | `USER`, `SHOP`, `CATEGORY`, `BANNER`, `HOMEPAGE_MODULE` |
| `targetId` | UUID |
| `action` | `SUSPEND`, `RESTORE`, `CREATE`, `UPDATE`, `DELETE`, `REORDER`, `APPROVE`, `REJECT` |
| `reason` | 8–240 trimmed characters |
| `beforeSummary` / `afterSummary` | bounded JSON object of safe fields only |
| `createdAt` | timestamptz |

No update/delete Prisma APIs are exposed. Indexes: `(createdAt, id)`, `(targetType, targetId, createdAt)`, `(actorUserId, createdAt)`, `(action, createdAt)`.

Writing into `RoleAuditEvent` for shop suspend was rejected because that table is role-shaped (`role`, `GRANT|REVOKE`). Dual-writing role events plus privileged events is the default: the audit screen shows privileged events; the existing role-audit list remains on a Roles subsection.

Shop approval SHOULD also write a privileged-audit row from the onboarding service so operators see approve/reject next to suspend. That is an additive hook, not a replacement of onboarding audit fields (`onboardingReason`).

### 3. Status commands are explicit actions with If-Match optional version

Use `POST /api/v1/admin/users/:userId/actions` and `POST /api/v1/admin/shops/:shopId/actions` with body `{ action: "SUSPEND" | "RESTORE", reason }`. User `updatedAt` plus shop `version`-less optimistic concurrency: compare `updatedAt` if the client sends `If-Match` as a weak timestamp ETag; if omitted, last-write-wins inside a transaction with row lock.

Self-suspend is rejected. Last active admin: count active users who currently hold `ADMIN` and whose status is `ACTIVE`; if the target is the last such user, return `409 LAST_ADMIN`. Suspend sets user status and revokes all unexpired sessions in the same transaction (existing `AuthSession.revokedAt`). Restore does not mint sessions.

Shop `RESTORE` is allowed only when `onboardingStatus === APPROVED`. `INACTIVE` / `REJECTED` shops stay on the approval endpoint.

Idempotent same-status commands return the current summary without a second audit event.

### 4. Category writes lock the subtree

Category create/update/delete/reorder run in a transaction that locks the target and parent rows. Cycle detection walks parents. Delete pre-checks `Product`, child `Category`, and `HomepageModuleCategory` counts. Soft-delete (`deletedAt`) is used only if a future restore is needed; T27 default is hard-delete when the integrity checks pass, matching current `deletedAt` optional column but avoiding mixed visibility. Prefer hard-delete of unused categories and deactivate (`isActive=false`) for categories that must remain as historical product parents.

Public catalog already filters active categories; admin lists include inactive ones.

### 5. Banners and modules are admin writes over existing tables

Do not introduce a parallel CMS. `HomepageBanner` and `HomepageModule` remain the source of public homepage assembly. Destination validation: must start with `/` and MUST NOT contain `://` or `//`. Image URL: relative `/media/...` or already-allowlisted marketplace media hosts used by seller products.

Module settings PATCH accepts only `title`, `subtitle`, `isEnabled`, `sortOrder`, `activeFrom`, `activeUntil`. Module `type` and `key` are immutable so seed identity stays stable.

### 6. List queries are keyset-paginated

Default limit 20, max 50. User list order `(createdAt DESC, id DESC)` with optional `status`, `role`, and `q` (email/displayName prefix or exact id). Shop list order `(updatedAt DESC, id DESC)` with `status`, `onboardingStatus`, `q` (slug/name). Category list may return a tree for the editor (bounded depth 3, matching current catalog) plus a flat paginated fallback. Email in user summaries is returned because admins must identify accounts; passwords and session hashes never appear.

### 7. Admin UI mirrors Seller Center

Routes:

- `/admin` dashboard
- `/admin/users`
- `/admin/shops`
- `/admin/categories`
- `/admin/homepage` banners + module settings
- `/admin/audit` privileged audit
- Keep grant/revoke on user detail; keep approval on shop detail

Reuse `OperationalRoleGate role="admin"`, `authenticatedFetch`, confirmation dialogs already used for seller product hide/delete, and toast for success/failure. Guest/forbidden states stay identical to the current gate.

### 8. Authorization matrix is the primary test

Every new route is asserted for guest 401, buyer/seller 403 (no body leakage), admin 200/201, and mutation origin denial. Category integrity, last-admin, self-suspend, shop restore-without-approval, banner destination, audit append-only, and pagination cursors have dedicated service/e2e coverage. Playwright covers admin list + suspend confirmation + forbidden buyer path without calling private APIs as a buyer.

## Risks / Trade-offs

- **[Risk] Suspended shop with open orders** → Mitigation: T27 only changes `ShopStatus`; existing fulfillment and catalog filters already hide suspended shops. Do not auto-cancel orders (T29/T25 remain owners).
- **[Risk] Duplicate audit from approval hook + future writers** → Mitigation: one helper `recordPrivilegedAudit(tx, ...)` used by all admin mutations; tests assert event count = 1 per successful change.
- **[Risk] Email in admin lists vs privacy** → Mitigation: lists are admin-only, no-store, and omit emails from dashboard aggregates; T27 needs email to operate accounts.
- **[Risk] Homepage cache** → Mitigation: public homepage already `Cache-Control: no-store`; admin writes take effect on next read.
- **[Risk] Category deactivate vs product category_id Restrict** → Mitigation: deactivation hides from public browse; products keep the FK; delete remains blocked while products exist.

## Migration Plan

1. Additive Prisma migration for `privileged_audit_events` and enums.
2. Deploy API with new admin routes; existing role/approval routes unchanged.
3. Ship admin UI replacing the placeholder page; header link stays `/admin`.
4. Seed unchanged homepage modules; operators can then edit.
5. Rollback: drop UI first; API routes are unused; migration rollback drops only the new audit table.

## Open Questions

None that block specs or tasks. Image upload for banners reuses existing marketplace media URL rules; T27 does not add a new S3 admin uploader unless current relative `/media` paths are insufficient, in which case banners keep URL-string fields like seed data.

## Context

See [proposal.md](proposal.md) for motivation and [Vietnamese UI/UX specification](../../../docs/ui-ux/separate-seller-onboarding-and-shop-lifecycle.md) for presentation behavior.

The project uses TypeScript, pnpm/Turborepo, Next.js App Router/React, NestJS REST under `/api/v1`, Prisma/PostgreSQL, shared contracts and UI primitives. Current `SellerOnboardingService` already stores applications as `Shop(INACTIVE, PENDING_APPROVAL)` and grants `SELLER` on approval. `Shop.ownerId` is unique. `SellerIdentityLifecycleService` instead couples both entities' suspension/restoration and session revocation. `sellableShopWhere` and `isSellableShop` currently check shop fields without requiring owner status, relying on that coupling.

Completed changes `enforce-single-shop-seller-account` and `simplify-seller-registration-approval` remain in the changes directory; their identity/registration specs are not yet in main specs. This change preserves their one-shop/approval rules and supersedes their coordinated suspension/restoration rules. Only `admin-entity-administration` currently has a matching main spec to modify. Reconcile overlapping specs during later sync/archive so older coordinated rules are not reintroduced.

## Goals / Non-Goals

**Goals:** independent stored account/shop states; approval-only seller elevation; owner-aware public and purchase eligibility; explicit private availability feedback; conservative transition of existing data.

**Non-Goals:** Figma redesign, general frontend refactoring, multiple shops, ownership transfer, a personal/shop chat identity selector, new automatic order cancellations/refunds, broader rights for suspended sellers, production rollout during planning, or automatic E2E execution.

## Decisions

### 1. Keep the existing application record and separate state ownership

Retain `User.status`, role assignments, `Shop.status`, `Shop.onboardingStatus` and unique `Shop.ownerId`. The pre-approval Shop row remains a private application, not a publicly active shop. Approval activates that same record. A new application table would require migration and endpoint churn without changing the requested experience; defer it unless an actual independent application-history requirement emerges. Audit events retain decision history.

Seller membership remains tied to one approved non-deleted shop, regardless of whether its owner or shop is suspended. Generic role actions must retain invariant protections. A valid ACTIVE-user/SUSPENDED-shop pair is no longer inconsistent. Do not weaken unique ownership or allow new registrations over soft-deleted records.

### 2. Separate commands and derive effective availability

| Command | Account status | Shop status | Sessions |
| --- | --- | --- | --- |
| Approve pending application | Require ACTIVE; preserve | APPROVED + ACTIVE | Preserve; refresh authorization projection |
| Suspend shop, including moderation | Preserve | SUSPENDED | Preserve |
| Restore approved suspended shop | Preserve | ACTIVE | Preserve |
| Suspend account | SUSPENDED | Preserve | Revoke |
| Restore account | ACTIVE | Preserve | Never recreate revoked sessions |

Effective availability requires non-deleted owner ACTIVE and non-deleted shop APPROVED/ACTIVE, plus existing product/category/variant conditions where relevant. Account suspension hides the shop without writing a synthetic shop suspension; this preserves the reason for independent restrictions. Restoring an owner automatically restores effective visibility only when the shop was otherwise eligible. Restoring a shop while its owner remains suspended is allowed but must explicitly report that it stays hidden.

Keep reason validation, current-admin/self/last-admin protections where applicable, no-op idempotency and transaction-local audit persistence. Audit only actual entity transitions, with the related entity's observed status as context; do not emit a fake owner transition for a shop-only action. Both admin and moderation callers must use the same new semantics, including removal of obsolete fallback coupled behavior and misleading auth text.

### 3. Serialize approval, restrictions and new purchase admission

Use existing PostgreSQL transactions and a consistent lock order: affected owner users in stable ID order, then shops in stable ID order, then the existing downstream purchase resources. Re-read current rows after acquiring locks; the existing approval lookup before the owner lock cannot remain the decision source. Admin approve/reject requests carry the application `expectedUpdatedAt` observed during review; compare it under lock and return a Problem Details conflict when another edit/decision changed it. An exact retry of a matching terminal decision remains a no-op only if it represents the already-applied review version and payload; otherwise return conflict. Keep a durable review-version marker in audit metadata, adding a column only if existing audit storage cannot represent it safely.

Owner suspension and purchase creation must participate in the same serialization boundary. When suspension commits first, no later new purchase can pass an earlier quote's eligibility check. Do not hold locks during external calls. Approval with a suspended/deleted owner fails without role changes. Failed role/status/session/audit writes roll back as one unit. Existing payment callbacks for already-created purchases keep their current idempotent lifecycle.

### 4. One backend eligibility policy with authoritative reads

Extend the existing `sellableShopWhere` relation filter with owner status/deletion. Make the in-memory `isSellableShop` input require owner eligibility and reject missing fields; update every query projection and SQL path that uses it. Keep shared `shopCanSell` semantics clearly scoped to shop-only fields or extend its input consistently; it must never be treated as the full backend authorization decision without owner data.

Inventory catalog, detail, shop storefront/following, homepage, search hydration/projections, recommendations, campaign/banner listings, favorites/recently viewed, cart, price quotes and purchase creation. Apply a batched authoritative eligibility read at public response hydration; never use an Elasticsearch document or cached `canSell` as the authority. Invalidate/reindex affected owner/shop candidates through existing mechanisms to keep counts and ranking current; stale candidates are filtered even before reindex completes. Cache candidate IDs rather than serving stale complete sellable responses without revalidation; audit Next route/data caching and API caches so post-suspension requests cannot return old public content. Do not add polling/push removal of already-rendered browser content.

Historical order/return snapshots and communications keep existing access rules. Saved/followed references use existing unavailable placeholders or omission, never active selling links. No lifecycle mutation deletes product records, cart history or transaction snapshots merely to hide the shop.

### 5. Separate authentication, seller membership and selling permission

Auth rejects suspended/deleted users and revoked sessions independently of shop status. Active owners of suspended shops retain personal sessions and buyer routes. Permit a narrowly defined own-shop workspace and moderation-notice read path, even though selling access is blocked. Seller operational endpoints must check shop eligibility on the backend, including product/media/inventory/promotion writes and profile/status changes. An authenticated suspended-shop owner must not bypass suspension with `PATCH /seller/shop` or direct API calls. Retain existing active/inactive controls for approved, non-suspended shops and existing restrictions on order/return operations. Do not expand chat or fulfillment permissions as a side effect.

Preserve existing routes and enhance safe private projections: admin shop summaries add `ownerStatus`, `canSell` and availability reason codes; owner workspace provides equivalent context. Reasons can include `owner_suspended`, `owner_deleted`, `shop_suspended`, `shop_inactive`, `onboarding_pending`, `onboarding_rejected`, `shop_deleted`; multiple restrictions must be representable. Public routes keep generic unavailable responses. Contracts, guards, OpenAPI and UI refresh behavior must agree; frontend-derived status is not authorization.

### 6. Focused validation; E2E is explicitly opt-in

Run scoped Jest service/API integration tests, Vitest/Testing Library and contract checks, plus relevant lint/typecheck during implementation. Critical cases are approval/review concurrency, account/shop restoration matrix, session preservation/revocation, real PostgreSQL transaction races/rollback, stale search/cache suppression, purchase admission and direct API authorization.

Per user instruction, do not automatically run any quick or full E2E, Playwright journey, or snapshot update for this change, even if a general workflow suggests E2E for UI changes. Prepare/update relevant scenarios without executing them. Only after an explicit user request, run the selected quick suites using existing commands such as `pnpm test:e2e:seller:quick`, `pnpm test:e2e:auth:quick`, `pnpm test:e2e:shop:quick` or `pnpm test:e2e:checkout:quick`; do not run every suite by default or invent an admin quick script. Check the current scripts before execution. Deferred E2E is a reported validation limitation, not a pass and not a reason to block unrelated implementation tasks.

## Risks / Trade-offs

- Legacy coupled sanctions have ambiguous provenance → preserve both restrictions, provide a dry-run report, and require an explicit reviewed repair list for any data reactivation; never infer authorization from an old audit action alone.
- Missing owner fields or stale caches could expose a locked owner's products → required projections, fail-closed checks, cache-path inventory and representative integration tests with stale candidates.
- Additional owner joins and locks affect latency/deadlocks → batch lookups, reuse indexes, use one documented lock order and existing bounded transaction retry behavior; avoid N+1 queries.
- Shop-only suspension now leaves a usable account → test all operational API entry points and distinguish allowed status reads from denied mutations.
- Older completed specs or parallel frontend changes may conflict → re-read current diffs when applying, preserve unrelated work, and reconcile spec precedence at sync/archive. Read current code rather than applying stale line numbers.
- Optional E2E leaves browser journeys unverified → report deferred scope and run only the requested quick suites when authorized.

## Migration Plan

1. Inventory existing lifecycle callers, eligibility consumers and caches; produce a read-only classification of account/shop status pairs, approval/role mismatches and deleted references. Preserve existing approved shop IDs and pending registration records.
2. Implement owner-aware visibility and purchase admission before removing account-to-shop cascades. Deploy compatible backend/contracts/frontend together locally; mixed old/new writers must not remain active during the switch.
3. Keep the existing schema unless review-version persistence or an explicit reconciliation need requires an additive migration. Dry-run any data tool; do not bulk unlock legacy pairs. New valid mixed states must not trigger older repair scripts.
4. Refresh affected cache/search projections and verify independent transitions with focused automated checks. Leave E2E deferred unless requested. Production rollout is outside this authorization.
5. Rollback: retain data and audits, stop new lifecycle writes, and roll back application changes as a compatible unit after reviewing mixed states. Do not use old coupled repair jobs to force equality; retain owner-aware fail-closed visibility until a reviewed rollback preserves all restrictions. No destructive database reset.

## API Verification Matrix

Paths below use the existing `/api/v1` prefix. Endpoint names for adjacent consumers are resolved from their controllers during implementation.

| API | Request/response focus | Edge/auth cases |
| --- | --- | --- |
| `GET /seller/shop/workspace` | Own application/shop, current roles and safe availability projection | Active buyer pre-approval; suspended shop owner can read; other owner denied |
| `POST /seller/shop` | Existing complete registration payload → pending inactive profile | Invalid fields, duplicate/concurrent owner or slug, suspended user, soft-deleted slot |
| `PATCH /seller/shop/registration` | Correct/resubmit profile → same record pending/inactive | Pending edit vs approval, forbidden status input, rejected retry, cross-owner |
| `POST /admin/shops/:shopId/approval` | Decision, reason, `expectedUpdatedAt` → approved profile/role or rejection | Active admin; locked owner; stale version; identical retry; concurrent reject; full rollback |
| `POST /admin/shops/:shopId/actions` | SUSPEND/RESTORE + reason → independent shop status | Owner/session preserved; unapproved restore denied; locked owner remains locked |
| `POST /admin/users/:userId/actions` | SUSPEND/RESTORE + reason → independent user status | Session revocation; self/last admin; shop restriction preserved; no-op audit |
| `GET /admin/shops`, `GET /admin/shops/:shopId` | Safe summary + separate owner status/effective availability | Admin-only, no private contact/session leakage, both restrictions visible |
| `PATCH /seller/shop` and seller operational APIs | Existing payloads → normal result or stable denial | Active owner + suspended shop cannot self-restore or mutate; inactive toggle preserved |
| Auth login/refresh/access | Existing identity proof → session or auth failure | Shop suspension keeps login; user suspension rejects old tokens; restore requires fresh login |
| `GET /shops/:shopSlug`, `GET /shops/:shopSlug/products` and public product/discovery APIs | Existing public responses filtered by effective eligibility | Owner suspended, owner deleted, stale index/cache, generic unavailable response |
| Cart, quote and checkout/purchase APIs | Existing cart/quote/purchase shapes | Owner changes after quote; concurrent suspension; no partial reservation; old payment callback preserved |
| Existing admin moderation decision API | Existing decision/reason → outcome and audits | Shop target affects only shop; product target behavior unchanged |

These are unit/integration verification targets by default, not authorization to execute browser E2E.

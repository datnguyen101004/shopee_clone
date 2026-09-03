# Marketplace role authorization (T12)

T12 adds durable, additive marketplace roles and backend authorization for operational entry points. The only recognized roles are `buyer`, `seller`, and `admin`, always returned in that canonical order. Every active account is a buyer; seller and admin are explicit assignments.

## Permission matrix

| Caller | Public storefront | `GET /api/v1/seller/shop` | `/api/v1/admin/*` |
| --- | --- | --- | --- |
| Guest / invalid session | Allowed | `401` | `401` |
| Buyer | Allowed | `403` | `403` |
| Buyer + seller owning a shop | Allowed | Own safe shop projection | `403` |
| Buyer + seller without a qualifying owned shop | Allowed | `403` | `403` |
| Buyer + admin | Allowed | `403` unless seller is also assigned and ownership passes | Allowed |

Authentication and authorization remain distinct: missing, invalid, expired, or unavailable identity returns sanitized `401` Problem Details; a current authenticated user without the required role or persisted ownership returns sanitized `403`. A conflict such as removing the last active admin returns `409`.

The access JWT remains identity-only (`sub` and local session `sid`). Every protected request loads the active user and current role assignments from PostgreSQL. Revoking seller/admin therefore affects the next request even when its access token has not expired.

## Ownership rule

Seller authority alone is insufficient for shop-sensitive operations. The backend derives ownership from `shops.owner_id`, active user state, and non-deleted persistence records. It never accepts browser-supplied `ownerId`, actor identity, or role authority. Admin does not implicitly pass seller checks.

The initial seller endpoint is:

```text
GET /api/v1/seller/shop
```

It returns only `id`, `slug`, `name`, and `status` for the caller's persisted shop. Unknown and non-owned targets use the same denial category to avoid revealing existence.

## First-admin bootstrap

There is no HTTP bootstrap endpoint and no seeded admin. An authorized operator must select an existing active account and provide a bounded reason through runtime-only environment values:

```text
RBAC_BOOTSTRAP_ADMIN_EMAIL=<normalized existing account email>
RBAC_BOOTSTRAP_REASON=<8-240 character operational reason>
```

Then run:

```bash
pnpm auth:roles:bootstrap-admin
```

The command uses a PostgreSQL transaction advisory lock. Exactly one attempt can create the first active admin; once an active admin exists, later attempts fail closed. Output contains only `created`, `already-configured`, `target-unavailable`, `invalid-configuration`, or `unavailable`. It never prints the target, reason, database error, environment value, credential, token, or cookie.

## Admin workflow

All admin routes require a current persisted admin role. Mutation requests also pass the trusted browser-origin boundary.

| Method | Endpoint | Strict input |
| --- | --- | --- |
| `POST` | `/api/v1/admin/users/:userId/roles` | `{ "role": "seller" \| "admin", "reason": string }` |
| `POST` | `/api/v1/admin/users/:userId/roles/:role/revoke` | `{ "reason": string }` |
| `GET` | `/api/v1/admin/role-audit?limit=25&cursor=...` | Bounded newest-first safe audit page |

Grant and revoke commands derive the actor from the authenticated request. Repeating an already-applied transition is idempotent and adds no audit event. Assignment and audit event commit in one transaction. Admin revocations serialize and cannot remove the last active admin; self-revocation is allowed only while another active admin remains.

Audit events are append-only at PostgreSQL level and expose only event ID, target ID, role, action, source, optional actor ID, bounded reason, and UTC timestamp. No API supports updating or deleting audit history.

## Future integration obligations

- T22 seller product operations must require current seller plus persisted shop ownership.
- T23 seller order operations must resolve orders through their stored shop relationship before work.
- T25 admin console may call the T12 grant/revoke/audit APIs but must not create alternate authority rules or browser-owned actor fields.

Hiding `/seller` or `/admin` links is only UX. Every future protected API must declare authentication, role, and ownership policy at the backend boundary.

## Focused verification

```bash
pnpm db:verify
$env:RUN_AUTH_DATABASE_TESTS='1'; pnpm --filter @shopee-clone/api exec jest --runInBand test/auth.postgres.e2e.spec.ts
$env:RUN_ROLE_DATABASE_TESTS='1'; pnpm --filter @shopee-clone/api exec jest --runInBand test/role-authorization.postgres.e2e.spec.ts
pnpm test:e2e:auth:quick
pnpm test:e2e:homepage:quick
```

`db:verify` is destructive only to the guarded `TEST_DATABASE_URL`. The quick browser suites use already-running services and do not perform role mutations or call the real Google provider.

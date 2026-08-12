# Verification Evidence

Verified on 2026-08-12 for GitHub issue #4 (T03).

## Toolchain

- Node.js 22.12.0
- pnpm 10.34.5
- Prisma CLI and client 7.9.1
- PostgreSQL 18.4 in the isolated `shopee_clone_test` database

## Database Verification

`pnpm db:verify` completed successfully against an isolated PostgreSQL container.
The workflow recreated only the guarded test schema, deployed the committed
migration from empty, confirmed a second deployment was a no-op, and executed
the deterministic seed twice.

Verified entity counts:

```json
{
  "users": 2,
  "shops": 2,
  "categories": 4,
  "products": 4,
  "variants": 6,
  "images": 4,
  "inventory": 6
}
```

The verification also proved stable identifiers and relations, UUID and UTC
timestamp conventions, unique business keys, foreign keys, non-negative price
and quantity checks, and the `reserved <= on_hand` inventory constraint.

The unsafe-target smoke test rejected a database without the `_test` suffix
before mutation. The existing user count remained `2`, the command returned a
non-zero exit code, and the emitted error contained no credentials.

## Application and Repository Verification

- The production NestJS build connected to PostgreSQL and returned HTTP 200
  from `GET /api/v1/health`.
- Frozen install passed with pnpm 10.34.5.
- Prisma format, validate, and generate passed.
- Repository format check, lint, typecheck, tests, and production build passed.
- All 9 database-independent repository tests passed.
- Strict OpenSpec validation passed for
  `add-marketplace-persistence-foundation`.

The temporary PostgreSQL verification container was removed after the checks.

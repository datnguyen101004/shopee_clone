# Verification Evidence

Verified locally on 2026-08-12 for GitHub issue #5 (T04).

## Toolchain

- Node.js 22.12.0
- pnpm 10.34.5
- Docker Compose 2.29.7
- PostgreSQL image `postgres:18.4-alpine`
- Prisma CLI and client 7.9.1

## Compose and Configuration

- The example environment rendered `compose.yaml` successfully.
- Removing `POSTGRES_PASSWORD` from the validation fixture made Compose exit
  before startup with code 15 and named only the missing variable.
- `.env`, `.env.local`, and application `.env` files are ignored; only the
  documented example and the credential-free missing-variable fixture exist.
- Repeated startup reused the same healthy PostgreSQL service.
- Normal shutdown preserved a marker table in the named volume across restart.
- The explicit reset removed the isolated lifecycle container, network, and
  volume.

## Isolated Infrastructure Smoke

`pnpm infra:smoke` generated a runtime-only project name, password, PostgreSQL
port, and API port. It completed the following checks:

- PostgreSQL reached its health check.
- The committed migration deployed from an empty development database.
- The deterministic development seed completed.
- Guarded test verification deployed migrations twice, seeded twice, and
  validated relations and PostgreSQL constraints.
- Persistence counts converged to 2 users, 2 shops, 4 categories, 4 products,
  6 variants, 4 images, and 6 inventory rows.
- The production NestJS build connected to PostgreSQL and returned HTTP 200
  from `GET /api/v1/health`.
- The API process stopped and the exact isolated Compose container, network,
  and volume were removed.

The smoke helper's five database-independent tests cover project-name
isolation, exact cleanup targets, destructive command construction, distinct
development/test URLs, and output redaction.

## CI and Repository Gates

- The CI validator confirmed pull request, `main`, `development`, and manual
  triggers; read-only permissions; concurrency cancellation; SHA-pinned
  actions; pinned Node/pnpm versions; complete command parity; cleanup checks;
  and absence of embedded database credentials.
- Frozen install, Compose config validation, Prisma format/validate/generate,
  repository format check, lint, typecheck, all 16 tests, production build, and
  strict OpenSpec validation passed.
- Production deployment, production secrets, and observability remain outside
  T04 scope.

The GitHub-hosted run created by the direct `development` push is recorded in
the issue completion comment after both CI jobs succeed.

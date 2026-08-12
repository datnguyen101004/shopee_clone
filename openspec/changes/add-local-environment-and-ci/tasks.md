## 1. Safe Local Configuration and Compose

- [x] 1.1 Add a root `.env.example` with complete local-only Compose, API, development database, and `_test` database variables; verify real environment variants stay ignored and document that example values are not deployment secrets.
- [x] 1.2 Add a pinned PostgreSQL 18 `compose.yaml` with required-variable interpolation, loopback-only configurable port publishing, a health check, a named development volume, and deterministic project labels/names.
- [x] 1.3 Add an idempotent PostgreSQL initialization asset that creates the configured isolated `_test` database on first volume creation without embedding credentials.
- [x] 1.4 Validate the rendered Compose configuration with the example environment and verify missing required variables fail before containers start without leaking connection credentials.

## 2. Infrastructure Lifecycle and Smoke Automation

- [x] 2.1 Add root `infra:up`, `infra:down`, `infra:status`, `infra:logs`, and explicitly destructive `infra:reset` scripts whose normal shutdown preserves the development volume.
- [x] 2.2 Implement a cross-platform Node.js smoke orchestrator that selects free ports, generates runtime-only credentials and a unique Compose project name, validates exact cleanup targets, and redacts credentials from child-process errors.
- [x] 2.3 Make the smoke workflow start an ephemeral PostgreSQL project, wait for health, run the existing guarded migration and deterministic seed verification, build/start the API on a free port, and assert the live `/api/v1/health` response.
- [x] 2.4 Add focused tests for smoke isolation, target validation, output redaction, and cleanup behavior without requiring Docker for ordinary repository tests.
- [x] 2.5 Exercise repeated daily startup and normal shutdown against an isolated project to prove idempotency and volume preservation, then exercise the reset path and remove every temporary resource created by verification.

## 3. Contributor Documentation

- [x] 3.1 Rewrite the root clean-machine setup flow to cover prerequisites, environment-file creation, infrastructure startup, migration/seed, application startup, health URLs, and normal shutdown.
- [x] 3.2 Document status/log commands, the destructive reset warning, isolated smoke verification, local-only credential policy, and common Docker, port, missing-variable, and stale-volume recovery steps.
- [x] 3.3 Update persistence documentation to replace the T04 deferral with the Compose workflow while preserving the guarded `DATABASE_URL` and `TEST_DATABASE_URL` safety boundary.

## 4. GitHub Actions CI

- [x] 4.1 Add a least-privilege GitHub Actions workflow triggered by pull requests to and pushes on `main` and `development`, plus manual dispatch and concurrency cancellation for superseded runs.
- [x] 4.2 Pin reviewed action revisions and configure the exact Node.js 22.12.x and pnpm 10.34.5 toolchain, pnpm caching, and frozen lockfile installation in each required job.
- [x] 4.3 Add the repository job for Prisma format/validate/generate, format check, lint, typecheck, database-independent tests, and production build, with every command acting as a required gate.
- [x] 4.4 Add the persistence job that runs the isolated Compose smoke workflow and always verifies no smoke containers, networks, or volumes remain.
- [x] 4.5 Validate workflow YAML, triggers, permissions, concurrency, pinned actions, command parity, and absence of deployable secrets through automated or deterministic local checks.

## 5. End-to-End Verification and Delivery

- [x] 5.1 From an empty isolated Docker state, run the clean-machine smoke command and record evidence for PostgreSQL health, empty migration, repeated deploy/seed, constraints, live API health, redaction, and cleanup.
- [x] 5.2 Run frozen install, Compose config validation, Prisma format/validate/generate, repository format check, lint, typecheck, database-independent tests, production build, and strict OpenSpec validation; fix every failure.
- [x] 5.3 Confirm only safe templates and runtime-generated smoke credentials are used, no real environment file or generated credential is tracked, and production deployment/observability remain out of scope.
- [x] 5.4 Record verification evidence for issue #5, commit and push the completed T04 change directly to `development`, wait for its GitHub Actions workflow to succeed, close the issue as completed, and confirm no issue branch remains.

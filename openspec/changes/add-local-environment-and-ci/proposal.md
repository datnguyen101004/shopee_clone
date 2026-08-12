## Why

The application and persistence layers now exist, but contributors still have to provision PostgreSQL and reproduce quality checks manually. T04 establishes a safe, repeatable local environment and automated CI gates before product feature development begins.

## What Changes

- Add a Docker Compose definition for the required local PostgreSQL development and isolated test databases, with health checks and persistent development data.
- Add committed environment templates containing documented local-only placeholders while keeping real environment files and credentials ignored.
- Add root commands and an isolated smoke workflow for starting, inspecting, stopping, resetting, and validating local infrastructure without mutating a contributor's normal development database.
- Add GitHub Actions CI for pull requests and pushes to `main` and `development`, covering frozen install, Prisma checks, formatting, linting, type checking, database-independent tests, production builds, and PostgreSQL persistence verification.
- Document clean-machine setup, normal lifecycle commands, destructive reset behavior, troubleshooting, and the boundary that excludes production deployment and observability.

## Capabilities

### New Capabilities

- `local-development-environment`: Reproducible, health-checked local PostgreSQL infrastructure, safe configuration templates, lifecycle commands, and an isolated clean-machine smoke test.
- `continuous-integration`: Automated repository and persistence quality gates for pull requests and protected long-lived branch pushes.

### Modified Capabilities

None.

## Impact

- Adds root infrastructure files, environment templates, lifecycle/smoke scripts, and contributor documentation.
- Adds a GitHub Actions workflow and uses the existing pinned Node.js, pnpm, Prisma, and PostgreSQL toolchain.
- Extends root package scripts but does not change public application APIs, database schema, or production deployment behavior.
- Requires Docker Compose for local infrastructure and for the persistence smoke verification job in CI.

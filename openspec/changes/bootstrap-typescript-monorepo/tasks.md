## 1. Root Workspace Foundation

- [x] 1.1 Create the root `package.json`, pin Node.js and pnpm versions, and add canonical install/development/quality/build scripts.
- [x] 1.2 Add `pnpm-workspace.yaml`, `turbo.json`, repository-wide Prettier settings, and ignore rules for dependencies, builds, coverage, logs, and local environments.
- [x] 1.3 Add contributor setup documentation covering package boundaries and every root command required by the workspace-bootstrap spec.

## 2. Shared Packages

- [x] 2.1 Create `packages/config` with strict reusable TypeScript bases and ESLint flat-config helpers for Node and React packages.
- [x] 2.2 Create `packages/contracts` with the framework-neutral `HealthResponse` export and package-level build, lint, typecheck, and test scripts.
- [x] 2.3 Add a contracts test that verifies valid health data and prove the package has no framework or runtime dependencies.

## 3. Frontend Application

- [x] 3.1 Scaffold `apps/web` with Next.js App Router, React, strict TypeScript, shared lint/config consumption, and workspace contract dependency.
- [x] 3.2 Implement the server-rendered `/health` page using the shared health contract without requiring the backend.
- [x] 3.3 Configure Vitest and Testing Library and add a smoke test for the health page identifier and healthy status.

## 4. Backend Application

- [x] 4.1 Scaffold `apps/api` with NestJS, strict TypeScript, shared lint/config consumption, and workspace contract dependency.
- [x] 4.2 Configure the `/api/v1` prefix and implement public `GET /api/v1/health` with status `ok`, service `api`, and ISO 8601 timestamp.
- [x] 4.3 Configure Jest and Supertest and add an HTTP smoke test that validates the shared health response contract.

## 5. Dependency Graph and Verification

- [x] 5.1 Generate and commit the pnpm lockfile using the pinned package manager, then verify `pnpm install --frozen-lockfile` from the repository root.
- [x] 5.2 Verify `dev:web` and `dev:api` start independently and the root `dev` command starts both applications with distinguishable logs.
- [x] 5.3 Run root formatting check, lint, typecheck, unit tests, and production build; fix every workspace failure.
- [x] 5.4 Perform HTTP smoke checks against the built/running frontend health page and backend health endpoint and record the verification in the pull request.

  HTTP smoke checks are complete and documented in `verification.md` and pull request #41.

## Context

The repository contains OpenSpec guidance and the accepted architecture decision, but it has no package manifests or runnable applications. See `proposal.md` for motivation and `specs/workspace-bootstrap/spec.md` for the observable developer and health-check contracts.

The implementation machine has Node.js 22.12.0. The bootstrap must remain compatible with that runtime, so it cannot adopt current packages whose minimum engine has already advanced beyond Node 22.12. Exact dependency versions will be committed rather than expressed as floating ranges.

## Goals / Non-Goals

**Goals:**

- Produce a clean pnpm/Turborepo dependency graph with independent frontend and backend packages.
- Make root commands the canonical interface for install, development, quality checks, tests, and builds.
- Prove shared-package consumption in real frontend and backend code.
- Keep the initial applications deliberately small while exercising their real frameworks and test runners.
- Make the scaffold compatible with Windows and CI shells.

**Non-Goals:**

- Add PostgreSQL, Prisma, Docker Compose services, or migrations; T03 and T04 own those concerns.
- Add authentication, marketplace modules, persistence, UI design systems, or external integrations.
- Generate an OpenAPI client before the API contains domain endpoints.
- Add `packages/ui` before T05 introduces reusable visual primitives.

## Decisions

### 1. Pin a Node-compatible toolchain

Use Node.js `>=22.12.0 <23`, pnpm `10.34.5`, TypeScript `5.9.3`, Turborepo `2.10.9`, Next.js `16.3.0`, React `19.2.8`, and NestJS `11.1.29`. The repository `packageManager` field and Corepack provide the pnpm version independently of an older global pnpm installation.

Rationale: pnpm 11 and ESLint 10 require Node 22.13 or later, while this project machine provides 22.12. Pinning pnpm 10 and ESLint 9 avoids an unnecessary runtime upgrade and keeps the bootstrap reproducible. TypeScript 5.9 is chosen over the newly published TypeScript 7 line until the framework toolchains declare compatible support.

Alternative considered: upgrade Node immediately and use every latest major. Rejected because T02 should scaffold the repository, not mutate the developer's machine runtime, and the current LTS-class runtime satisfies Next.js and NestJS requirements.

### 2. Use four initial workspace packages

Create:

```text
apps/web
apps/api
packages/contracts
packages/config
```

`packages/config` exports shared TypeScript bases plus ESLint flat-config helpers. Prettier remains configured at the root because formatting policy is repository-wide. `packages/contracts` publishes source TypeScript through an explicit export and has its own typecheck/test/build lifecycle.

Alternative considered: add `packages/ui` immediately. Rejected because T02 has no reusable visual primitives and an empty UI package would create a false boundary.

### 3. Use source-consumed workspace contracts

Both applications depend on `@shopee-clone/contracts` through `workspace:*`. The package exports its TypeScript source for development and produces declarations/build output for validation. Next.js transpiles the workspace package; NestJS compiles it through the normal TypeScript project graph.

Rationale: this proves actual cross-application reuse now while avoiding a separate watch/build process during development.

Alternative considered: publish contracts to a registry or generate them only from OpenAPI. Rejected for bootstrap because no stable domain API exists yet; OpenAPI generation can become authoritative once domain endpoints are introduced.

### 4. Keep health surfaces deterministic and minimal

The web exposes `/health` with a server-rendered heading and status. The API exposes `GET /api/v1/health` returning the shared `HealthResponse` contract:

```ts
type HealthResponse = {
  status: 'ok';
  service: 'api';
  timestamp: string;
};
```

The backend test validates the endpoint over HTTP and verifies that `timestamp` parses as ISO 8601. The endpoint deliberately excludes database health until T03 introduces persistence.

Alternative considered: have the web health page call the API. Rejected because the frontend smoke test and independent startup requirement must not depend on the backend being available.

### 5. Let Turborepo orchestrate package scripts

Root scripts delegate to Turbo tasks for `dev`, `build`, `lint`, `typecheck`, and `test`, with explicit filtered aliases `dev:web` and `dev:api`. Development tasks are persistent and uncached; build outputs and test coverage are declared in `turbo.json`.

Rationale: later packages can join quality commands by implementing the same script names, and failure propagation is handled consistently.

Alternative considered: shell-level concurrent commands. Rejected because they are less portable across Windows and CI and do not model task dependencies.

### 6. Keep framework-native test runners behind a uniform root command

- `apps/web`: Vitest, Testing Library, and a DOM environment compatible with Node 22.12.
- `apps/api`: Jest and Supertest using Nest's test module.
- `packages/contracts`: Vitest for runtime contract helpers if present, plus TypeScript checks.

Rationale: framework-native defaults reduce configuration risk, while Turbo hides runner differences from contributors.

Alternative considered: force one test runner everywhere. Rejected because NestJS tooling and ecosystem examples remain strongest with Jest, and uniform commands matter more than uniform internals.

### 7. Separate T02 from infrastructure work

T02 adds `.env.example` only if the minimal apps need environment variables; it does not add PostgreSQL or `compose.yaml`. The API default port and web API base URL use safe defaults with documented overrides.

Rationale: database and Docker acceptance criteria are already owned by T03/T04. Pulling them forward would enlarge the bootstrap and make health tests unnecessarily stateful.

## Risks / Trade-offs

- [Current package majors can require a newer Node patch release] → Pin exact compatible versions, declare engines, and let frozen-lockfile CI detect accidental drift.
- [Source-consumed contracts can leak framework-specific code over time] → Enforce a dependency-free contracts manifest and lint package boundaries during later hardening.
- [Next.js and NestJS use different test runners] → Standardize root commands and reporting rather than forcing an unnatural shared runner.
- [A minimal health page can be mistaken for product UI] → Keep it under `/health`; the public storefront begins in P1.
- [Skipping database readiness makes health less comprehensive] → Treat this endpoint as process readiness for T02 and extend it explicitly after T03.

## Migration Plan

1. Create the root manifests, workspace definition, Turbo pipeline, shared formatting/ignore rules, and contributor documentation.
2. Scaffold `packages/config` and `packages/contracts`, then verify their build and typecheck commands.
3. Scaffold the Next.js frontend and its health-page smoke test.
4. Scaffold the NestJS backend, global `/api/v1` prefix, health endpoint, and HTTP smoke test.
5. Generate and commit the pnpm lockfile with the pinned toolchain.
6. Run root formatting, lint, typecheck, test, and build commands from a clean install.

Rollback consists of reverting the bootstrap commit because the repository has no application data or prior package graph to migrate.

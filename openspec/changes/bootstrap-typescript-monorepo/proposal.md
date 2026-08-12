## Why

The repository currently contains planning artifacts but no runnable application foundation. T02 must establish a repeatable monorepo developer experience so frontend, backend, and shared-contract work can begin without every later feature redefining tooling, commands, or package boundaries.

## What Changes

- Create a pnpm workspace orchestrated by Turborepo with root commands for development, linting, type checking, testing, and building.
- Scaffold a Next.js App Router frontend in `apps/web` with a tested health page.
- Scaffold a NestJS backend in `apps/api` with a tested versioned health endpoint.
- Add framework-neutral shared contracts in `packages/contracts` and consume the same health contract from both applications.
- Add reusable TypeScript, ESLint, and formatting configuration under `packages/config`.
- Establish repository metadata for Node/pnpm version pinning, ignored generated files, and contributor setup.

## Capabilities

### New Capabilities

- `workspace-bootstrap`: Defines the install, development, quality-check, shared-contract, and health-check behavior of the monorepo foundation.

### Modified Capabilities

None.

## Impact

- Adds root workspace and Turborepo configuration.
- Adds `apps/web`, `apps/api`, `packages/contracts`, and `packages/config` packages.
- Introduces pinned Node/pnpm tooling and the initial Next.js, NestJS, test, lint, and formatting dependencies.
- Adds developer-facing commands and minimal HTTP/page surfaces, but no marketplace business features, authentication, or persistent data.
- Provides the build foundation required by T03 and all later roadmap tasks.

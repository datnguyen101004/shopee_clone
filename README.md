# Shopee Clone

Shopee Clone is a TypeScript monorepo for incrementally reproducing the core Shopee shopping experience. T02 provides the runnable foundation: a Next.js web application, a NestJS API, and framework-neutral shared contracts.

## Prerequisites

- Node.js 22.12.x (see `.nvmrc`)
- Corepack enabled: `corepack enable`
- pnpm 10.34.5 (Corepack reads the pinned version from `package.json`)

## Setup

```bash
pnpm install --frozen-lockfile
```

If the Corepack bundled with Node reports a stale package-signing key, run the same pinned package manager without changing the global installation:

```bash
npx --yes pnpm@10.34.5 install --frozen-lockfile
```

## Development

```bash
pnpm dev       # web and API together
pnpm dev:web   # Next.js at http://localhost:3000
pnpm dev:api   # NestJS at http://localhost:3001
```

Health checks:

- Web: `http://localhost:3000/health`
- API: `http://localhost:3001/api/v1/health`

## Quality gates

Run the same repository-wide commands from the root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Use `pnpm format` to apply the shared Prettier rules.

## Workspace boundaries

- `apps/web`: Next.js frontend and browser-facing presentation logic.
- `apps/api`: NestJS modular monolith and HTTP transport concerns.
- `packages/contracts`: framework-neutral TypeScript contracts consumed by both apps.
- `packages/config`: shared TypeScript and ESLint configuration.

Applications may depend on shared packages. Shared packages must not import application code, framework runtime code, database clients, or infrastructure adapters. Add future reusable packages only when at least two consumers need the same stable abstraction.

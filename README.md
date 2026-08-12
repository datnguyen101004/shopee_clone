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

## Database workflows

PostgreSQL persistence is owned by `apps/api`. Provide connection URLs through the shell or an uncommitted local `.env`; never commit credentials.

- `DATABASE_URL`: development/runtime PostgreSQL URL.
- `TEST_DATABASE_URL`: isolated database used only by destructive verification. Its database name must end in `_test` and must differ from `DATABASE_URL`.

Safe placeholder examples:

```text
DATABASE_URL=postgresql://user:password@127.0.0.1:5432/shopee_clone
TEST_DATABASE_URL=postgresql://user:password@127.0.0.1:5432/shopee_clone_test
```

Run database commands from the repository root:

```bash
pnpm db:generate          # regenerate the ignored Prisma client
pnpm db:format            # format prisma/schema.prisma
pnpm db:validate          # validate the Prisma schema without connecting
pnpm db:migrate -- --name <migration-name> # create/apply a development migration
pnpm db:migrate:deploy    # apply committed migrations non-interactively
pnpm db:seed              # upsert deterministic demo marketplace data
pnpm db:verify            # rebuild TEST_DATABASE_URL and verify migrations/seed/constraints
pnpm db:reset             # DESTRUCTIVE: reset DATABASE_URL in development
```

`db:verify` drops and recreates the `public` schema in `TEST_DATABASE_URL`. It refuses missing URLs, non-PostgreSQL URLs, targets without the `_test` suffix, and the same target as `DATABASE_URL`. It does not run as part of the ordinary database-independent `pnpm test` command.

### Persistence conventions

- Committed migrations are the source of truth; do not rewrite migrations after they have been shared.
- Prisma models use camelCase fields mapped to snake_case PostgreSQL names.
- Users, shops, categories, products, and variants use UUID identifiers, UTC-aware timestamps, and nullable soft-delete timestamps.
- Unique email, slug, and SKU values remain reserved after soft deletion.
- Prices use integer minor units stored as PostgreSQL `bigint`; inventory quantities are non-negative integers enforced by database checks.
- `apps/api/src/generated/prisma` is generated and ignored. Run `pnpm db:generate` after pulling schema changes; API build and typecheck also regenerate it.

The deterministic seed creates two users and shops, four hierarchical categories, four products, six variants with inventory, and four images using fixed UUIDs and business keys. Rerunning it converges on the same demo records without deleting unrelated development data.

Docker Compose, committed environment templates, and CI database services are intentionally deferred to T04.

## Workspace boundaries

- `apps/web`: Next.js frontend and browser-facing presentation logic.
- `apps/api`: NestJS modular monolith and HTTP transport concerns.
- `packages/contracts`: framework-neutral TypeScript contracts consumed by both apps.
- `packages/config`: shared TypeScript and ESLint configuration.

Applications may depend on shared packages. Shared packages must not import application code, framework runtime code, database clients, or infrastructure adapters. Add future reusable packages only when at least two consumers need the same stable abstraction.

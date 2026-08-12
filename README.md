# Shopee Clone

Shopee Clone is a TypeScript monorepo for incrementally reproducing the core Shopee shopping experience. T02 provides the runnable foundation: a Next.js web application, a NestJS API, and framework-neutral shared contracts.

## Prerequisites

- Node.js 22.12.x (see `.nvmrc`)
- Corepack enabled: `corepack enable`
- pnpm 10.34.5 (Corepack reads the pinned version from `package.json`)
- Docker Desktop or Docker Engine with Docker Compose v2

## Clean-machine setup

Install dependencies and create the ignored local configuration file:

```bash
pnpm install --frozen-lockfile
cp .env.example .env
```

PowerShell equivalent:

```powershell
Copy-Item .env.example .env
```

The committed values are conspicuous local-only examples. Change them in `.env` if needed and never reuse them for shared, staging, or production infrastructure. Real `.env` files are ignored.

If the Corepack bundled with Node reports a stale package-signing key, run the same pinned package manager without changing the global installation:

```bash
npx --yes pnpm@10.34.5 install --frozen-lockfile
```

Start PostgreSQL, apply committed migrations, and load deterministic demo data:

```bash
pnpm infra:up
pnpm db:migrate:deploy
pnpm db:seed
```

`infra:up` waits for PostgreSQL to become healthy. Running it again is safe and does not duplicate the service or erase the named development volume.

## Development

```bash
pnpm dev       # web and API together
pnpm dev:web   # Next.js at http://localhost:3000
pnpm dev:api   # NestJS at http://localhost:3001
```

Health checks:

- Web: `http://localhost:3000/health`
- API: `http://localhost:3001/api/v1/health`

Stop the applications with `Ctrl+C`, then stop infrastructure without deleting development data:

```bash
pnpm infra:down
```

See [Local Development](docs/local-development.md) for lifecycle commands, destructive reset behavior, smoke verification, and troubleshooting.

## Local infrastructure commands

```bash
pnpm infra:config          # validate the ignored .env configuration
pnpm infra:up              # start PostgreSQL and wait for health
pnpm infra:status          # show service state and published ports
pnpm infra:logs            # follow the last 100 PostgreSQL log lines
pnpm infra:down            # stop containers; preserve the named volume
pnpm infra:reset           # DESTRUCTIVE: remove containers, network, and database volume
pnpm infra:smoke           # isolated migration/seed/constraint/API verification
```

`infra:reset` permanently deletes the local Compose database volume. It is not an alias for normal shutdown. `infra:smoke` uses runtime-only credentials, free ports, an ephemeral volume, and an isolated Compose project; it cleans up those exact resources on success or failure.

## Quality gates

Run the same repository-wide commands from the root:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Use `pnpm format` to apply the shared Prettier rules. Ordinary `pnpm test` includes infrastructure helper unit tests but does not require Docker. GitHub Actions automatic triggers are temporarily disabled; the workflow can be started manually with `workflow_dispatch` when needed.

The reusable marketplace foundations live in `packages/ui`; browse the component showcase at `http://localhost:3000/design-system`. See [Marketplace design system](docs/design-system.md) for tokens, component usage, responsive boundaries, and accessibility guidance.

See [Product Detail](docs/product-detail.md) for the T10 public product endpoint, variant-media integrity, stock rules, anonymous login intent, and focused verification commands.

See [Account authentication](docs/authentication.md) for T11 email/password sessions and the T11.1 Google sign-in flow, exact local callback, safe environment preflight, and focused verification commands.

See [Account authentication](docs/authentication.md) for T11 endpoints, session/token lifecycle, password policy, local recovery delivery, environment requirements, and focused auth verification commands.

## Database workflows

PostgreSQL persistence is owned by `apps/api`. The API and Prisma commands load the ignored root `.env` (with `apps/api/.env` as an optional higher-priority override); never commit credentials.

- `DATABASE_URL`: development/runtime PostgreSQL URL.
- `TEST_DATABASE_URL`: isolated database used only by destructive verification. Its database name must end in `_test` and must differ from `DATABASE_URL`.

The root `.env.example` contains the complete local template. The connection URL shape is:

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

Docker Compose provisions both database targets locally, while CI uses the same guarded verification against an ephemeral Compose project.

## Workspace boundaries

- `apps/web`: Next.js frontend and browser-facing presentation logic.
- `apps/api`: NestJS modular monolith and HTTP transport concerns.
- `packages/contracts`: framework-neutral TypeScript contracts consumed by both apps.
- `packages/config`: shared TypeScript and ESLint configuration.
- `packages/ui`: shared design tokens, accessible UI primitives, feedback patterns, and responsive page shell.

Applications may depend on shared packages. Shared packages must not import application code, framework runtime code, database clients, or infrastructure adapters. Add future reusable packages only when at least two consumers need the same stable abstraction.

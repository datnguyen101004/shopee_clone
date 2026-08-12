# Local Development

Status: Implemented by T04 / issue #5.

## Prerequisites

- Node.js 22.12.x
- pnpm 10.34.5 through Corepack or the pinned `npx` fallback
- Docker Desktop or Docker Engine with Docker Compose v2
- Git

Confirm the tools before setup:

```bash
node --version
pnpm --version
docker version
docker compose version
```

## First-time setup

From the repository root:

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm infra:config
pnpm infra:up
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

On PowerShell use `Copy-Item .env.example .env` instead of `cp`. The example values are local-only placeholders, not deployable secrets. Change them only in the ignored `.env` file. Never reuse these values in staging or production.

The web health page is `http://localhost:3000/health`. The API health endpoint is `http://localhost:3001/api/v1/health`.

## Daily lifecycle

| Command | Behavior |
| --- | --- |
| `pnpm infra:config` | Validate Compose interpolation from `.env` without starting containers. |
| `pnpm infra:up` | Create/start PostgreSQL and wait for its health check. Safe to repeat. |
| `pnpm infra:status` | Show container health and the loopback host port. |
| `pnpm infra:logs` | Follow PostgreSQL logs; stop following with `Ctrl+C`. |
| `pnpm infra:down` | Stop containers and remove the network while preserving database data. |
| `pnpm infra:reset` | Permanently remove this Compose project's containers, network, and database volume. |

Use `infra:down` for normal shutdown. `infra:reset` is destructive and local database contents cannot be recovered from the deleted volume unless you created an external backup.

The PostgreSQL service is published only on `127.0.0.1`. `POSTGRES_PORT` can be changed in `.env` when port 5432 is unavailable. Keep `DATABASE_URL` and `TEST_DATABASE_URL` ports in sync with that value.

## Isolated smoke verification

Run the clean-machine infrastructure contract with:

```bash
pnpm infra:smoke
```

The smoke runner does not read or mutate the normal development databases. It generates a unique Compose project name, runtime-only password, free PostgreSQL/API ports, and ephemeral volume. It applies the development migration and seed, runs the guarded `_test` migration/seed/constraint verification, builds the API, checks the live health endpoint, and removes the exact temporary project in a `finally` path. Errors redact database URLs and credentials.

Ordinary `pnpm test` runs the smoke helper's isolation/redaction unit tests without starting Docker. The full Docker-backed smoke command is an explicit local/CI integration gate.

## Troubleshooting

### Docker is unavailable

Start Docker Desktop or the Docker daemon, then verify `docker version` reports both client and server information. `docker compose version` must report Compose v2.

### PostgreSQL port is occupied

Change `POSTGRES_PORT` in `.env`, for example to `55432`, and update both database URLs to use the same port. Run `pnpm infra:config` before retrying `pnpm infra:up`.

### A required variable is missing

Recreate or compare `.env` with `.env.example`. Compose fails during interpolation and names the missing variable before any container starts. API startup similarly names a missing `DATABASE_URL` without printing credentials.

### Credentials or database names changed after first startup

The official PostgreSQL initialization directory runs only when its data directory is empty. Normal `infra:down` intentionally preserves the existing volume, so new initialization values do not rewrite an initialized cluster. Preserve needed data first, then run the explicitly destructive `pnpm infra:reset` and `pnpm infra:up`.

### PostgreSQL is unhealthy

Run `pnpm infra:status` and `pnpm infra:logs`. Check port availability, required variables, and initialization errors. Use `infra:reset` only when discarding the current local volume is acceptable.

### Prisma cannot connect

Confirm `pnpm infra:status` reports PostgreSQL as healthy and that the URL host is `127.0.0.1`, its port matches `POSTGRES_PORT`, and the database name matches `POSTGRES_DB` or `POSTGRES_TEST_DB`. `TEST_DATABASE_URL` must end in `_test` and must not target the same database as `DATABASE_URL`.

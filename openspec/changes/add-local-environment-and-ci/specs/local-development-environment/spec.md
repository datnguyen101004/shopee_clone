## Purpose

Provide contributors with a reproducible and safely operated local PostgreSQL environment plus an isolated verification path that behaves consistently on a clean machine.

## ADDED Requirements

### Requirement: Reproducible local infrastructure startup

The repository SHALL provide a documented root command that starts every infrastructure dependency required by the current applications. PostgreSQL SHALL become healthy before the command reports readiness, SHALL expose only a configurable loopback port to the host, and SHALL provide distinct development and `_test` databases.

#### Scenario: Start infrastructure from a fresh checkout

- **WHEN** a contributor with the documented prerequisites creates a local environment file from the committed template and runs the startup command from a fresh checkout
- **THEN** PostgreSQL starts, reaches its health check, and both the development and isolated test database targets are available through the documented URLs

#### Scenario: Start infrastructure repeatedly

- **WHEN** the startup command is run while the Compose project is already healthy
- **THEN** it completes without creating duplicate services or losing existing development data

### Requirement: Safe environment configuration

The repository MUST commit templates that enumerate required local variables using clearly non-production placeholder values, MUST ignore real environment files, and MUST NOT commit deployable secrets or generated credentials. Application startup and destructive database workflows SHALL fail with useful errors that do not reveal credentials when required configuration is missing or unsafe.

#### Scenario: Configure a new local checkout

- **WHEN** a contributor copies the committed template to the documented ignored filename
- **THEN** the resulting variables are sufficient to start local infrastructure and connect the API after the contributor supplies local-only values

#### Scenario: Required runtime configuration is missing

- **WHEN** the API starts without a required database URL
- **THEN** startup fails before serving requests and the error identifies the missing variable without including any connection credentials

#### Scenario: Repository secret scan by inspection

- **WHEN** tracked environment and infrastructure files are reviewed
- **THEN** they contain only documented placeholders or local-only examples and no production-capable secret value

### Requirement: Explicit infrastructure lifecycle

The repository SHALL expose documented commands to start, stop, inspect, and view logs for local infrastructure. Normal shutdown SHALL preserve development data, while volume deletion SHALL require a separately named destructive reset command and an explicit warning.

#### Scenario: Stop normal development services

- **WHEN** a contributor runs the normal shutdown command
- **THEN** containers and networks stop while the Compose-owned development volume remains available for the next startup

#### Scenario: Reset local database state

- **WHEN** a contributor intentionally runs the documented destructive reset command
- **THEN** only resources owned by this Compose project are removed and the documentation states that local database data cannot be recovered from that volume

### Requirement: Isolated clean-machine smoke verification

The repository SHALL provide an automated smoke command that uses an isolated Compose project, ephemeral database storage, dynamically selected local ports, and runtime-only credentials. It SHALL verify startup health, migration deployment from an empty database, deterministic seed behavior, PostgreSQL constraints, and API connectivity, and SHALL clean up its own containers, network, and volumes on success or failure.

#### Scenario: Smoke verification succeeds

- **WHEN** the smoke command runs on a clean machine with Node.js, the pinned package manager, and Docker Compose
- **THEN** it verifies the persistence foundation and a live API health response without mutating the contributor's normal development database

#### Scenario: Smoke verification fails midway

- **WHEN** any startup, migration, seed, constraint, or API health assertion fails
- **THEN** the command exits non-zero, redacts credentials from diagnostics, and still attempts to remove only its isolated resources

### Requirement: Local operations documentation

Contributor documentation SHALL cover prerequisites, first-time setup, startup, migration, seed, application launch, shutdown, destructive reset, smoke verification, and common Docker, port, environment, and stale-volume failures.

#### Scenario: Contributor follows the happy path

- **WHEN** a contributor follows the documented clean-machine sequence in order
- **THEN** they can reach the web and API health endpoints with the API connected to the local PostgreSQL service

#### Scenario: Contributor encounters a known setup failure

- **WHEN** Docker is unavailable, a configured port is occupied, required variables are missing, or an initialized volume no longer matches configuration
- **THEN** the troubleshooting guide provides a diagnostic and recovery action that distinguishes normal shutdown from destructive reset

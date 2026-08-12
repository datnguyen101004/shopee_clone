## Purpose

Defines a repeatable developer foundation in which the frontend, backend, and shared contracts can be installed, run, checked, tested, and built from one repository.

## ADDED Requirements

### Requirement: Single workspace installation

The repository SHALL provide one root installation command that resolves every frontend, backend, and shared-package dependency from a committed lockfile.

#### Scenario: Clean workspace installation

- **WHEN** a developer checks out the repository with a supported Node.js runtime and runs `pnpm install --frozen-lockfile`
- **THEN** all workspace packages are installed without requiring separate application-level install commands

#### Scenario: Dependency graph is reproducible

- **WHEN** the committed manifests have not changed
- **THEN** the frozen-lockfile installation resolves the same dependency graph

### Requirement: Independent and combined development startup

The repository SHALL expose root commands that start the frontend independently, start the backend independently, or start both applications concurrently.

#### Scenario: Start only the frontend

- **WHEN** a developer runs the documented frontend development command
- **THEN** the frontend starts without also starting the backend process

#### Scenario: Start only the backend

- **WHEN** a developer runs the documented backend development command
- **THEN** the backend starts without also starting the frontend process

#### Scenario: Start the complete application shell

- **WHEN** a developer runs the root development command
- **THEN** both frontend and backend development processes start with distinguishable logs

### Requirement: Framework-neutral shared contracts

The workspace SHALL provide a shared contracts package whose exported types contain no Next.js, NestJS, Prisma, or browser-only implementation dependency and can be consumed by both applications.

#### Scenario: Backend consumes a shared contract

- **WHEN** the backend builds its health response
- **THEN** the response conforms to a type exported by the shared contracts package

#### Scenario: Frontend consumes the same shared contract

- **WHEN** the frontend represents backend health data
- **THEN** it imports the same exported contract without copying or redefining that type

### Requirement: Root quality commands

The repository SHALL expose root commands for formatting checks, linting, type checking, unit tests, and production builds across all applicable workspace packages.

#### Scenario: Quality checks succeed on the bootstrap repository

- **WHEN** a developer runs each documented root quality command after installation
- **THEN** every applicable workspace package is checked and all commands exit successfully

#### Scenario: Workspace failure propagates to the root

- **WHEN** any package fails a root-invoked quality task
- **THEN** the root command exits with a non-zero status

### Requirement: Frontend health surface

The frontend SHALL provide a minimal health page that identifies the Shopee Clone web application and renders successfully without marketplace data or authentication.

#### Scenario: Render frontend health page

- **WHEN** a user requests the frontend health route
- **THEN** the application returns a successful page containing a stable application identifier and healthy status

#### Scenario: Frontend smoke test

- **WHEN** the frontend unit-test command runs
- **THEN** an automated test verifies the health page's stable application identifier and status

### Requirement: Versioned backend health endpoint

The backend SHALL provide a public `GET /api/v1/health` endpoint that returns HTTP 200 and a response conforming to the shared health contract without requiring a database or authentication.

#### Scenario: Request backend health

- **WHEN** a client sends `GET /api/v1/health`
- **THEN** the backend returns HTTP 200 with status `ok`, service identifier `api`, and a valid ISO 8601 timestamp

#### Scenario: Backend health smoke test

- **WHEN** the backend test command runs
- **THEN** an automated HTTP test verifies the endpoint status code and shared response shape

### Requirement: Supported tooling is explicit

The repository SHALL declare and document the supported Node.js and pnpm versions, environment-safe setup, package boundaries, and root commands needed for development.

#### Scenario: Developer reviews setup instructions

- **WHEN** a new contributor opens the repository documentation
- **THEN** they can identify supported tooling, installation, startup, quality, test, and build commands without inspecting package internals

#### Scenario: Generated and secret files remain untracked

- **WHEN** applications generate dependency, build, coverage, local environment, or log files
- **THEN** repository ignore rules prevent those files from being tracked while allowing safe environment examples

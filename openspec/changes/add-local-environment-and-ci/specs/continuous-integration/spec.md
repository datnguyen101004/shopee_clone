## Purpose

Provide repeatable GitHub-hosted quality gates that reject invalid repository changes and verify the persistence stack before work reaches long-lived branches.

## ADDED Requirements

### Requirement: CI trigger coverage

GitHub Actions SHALL run the repository CI workflow for pull requests targeting long-lived branches, for pushes to `main` and `development`, and through an explicit manual trigger.

#### Scenario: Pull request updates application code

- **WHEN** a pull request targeting `main` or `development` is opened or updated
- **THEN** the complete CI workflow starts for the pull request commit

#### Scenario: Long-lived branch receives a direct push

- **WHEN** a commit is pushed directly to `main` or `development`
- **THEN** the complete CI workflow starts for that pushed commit

### Requirement: Reproducible CI toolchain

CI MUST use the repository-declared Node.js and pnpm versions, install from the committed lockfile without modification, and use dependency caching that does not replace lockfile verification.

#### Scenario: Lockfile and manifests disagree

- **WHEN** CI performs the frozen dependency installation with an outdated or inconsistent lockfile
- **THEN** the workflow fails before linting, tests, or builds run

#### Scenario: CI resolves the package manager

- **WHEN** a runner starts without a compatible global pnpm installation
- **THEN** the workflow installs the exact repository-pinned pnpm version without changing repository manifests

### Requirement: Repository quality gates

CI SHALL run Prisma schema validation and client generation, formatting checks, linting, TypeScript checking, database-independent tests, and production builds. Any failed gate MUST make the workflow unsuccessful.

#### Scenario: Every repository gate passes

- **WHEN** formatting, linting, type checking, tests, Prisma checks, and builds all complete successfully
- **THEN** the repository quality job reports success for the commit

#### Scenario: One repository gate fails

- **WHEN** any required command exits non-zero
- **THEN** the workflow reports failure and does not present the commit as having passed all merge gates

### Requirement: Persistence verification in CI

CI SHALL provision an isolated PostgreSQL service and execute the committed guarded database verification against an `_test` database. The check MUST cover migration deployment from empty, repeated deployment, repeated deterministic seed, relations, and database constraints.

#### Scenario: Persistence foundation is compatible

- **WHEN** CI runs database verification against a new PostgreSQL instance
- **THEN** committed migrations and both seed executions succeed and every persistence assertion passes

#### Scenario: Migration or constraint regresses

- **WHEN** a committed change makes an empty migration, repeated seed, relation, or constraint assertion fail
- **THEN** the persistence job fails and exposes a credential-redacted diagnostic

### Requirement: Safe and efficient workflow execution

The CI workflow MUST declare read-only repository permissions unless a job explicitly requires more, MUST avoid embedding credentials in tracked workflow files or logs, and SHALL cancel obsolete in-progress runs for the same pull request or branch.

#### Scenario: A newer commit supersedes an active run

- **WHEN** another commit is pushed to the same pull request or branch while its previous CI run is still active
- **THEN** the obsolete run is cancelled and the newest commit remains the authoritative result

#### Scenario: Workflow source is inspected

- **WHEN** a maintainer reviews the committed workflow
- **THEN** it contains no deployable secrets and its default token permissions are read-only

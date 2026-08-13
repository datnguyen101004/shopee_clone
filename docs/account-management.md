# Buyer profile and shipping addresses (T13)

T13 adds an authenticated account surface for buyer profile details and Vietnamese delivery addresses. Authentication credentials and session formats remain unchanged; phone and address values are never added to access tokens, refresh cookies, URLs, browser storage, or telemetry.

## API surface

All routes are rooted at `/api/v1/account`, require the bearer access token issued by T11, return `Cache-Control: no-store`, and derive ownership from the authenticated user:

- `GET /profile` and `PATCH /profile`
- `GET /addresses` and `POST /addresses`
- `PATCH /addresses/:addressId` and `DELETE /addresses/:addressId`
- `PUT /addresses/:addressId/default`

Browser mutations also use the existing trusted-Origin policy. Bodies are strict: unknown properties are rejected. Invalid, missing, soft-deleted, and foreign address IDs all return the same sanitized `404` Problem Details response. OpenAPI documentation is available locally at `http://localhost:3001/api/docs`.

## Vietnamese normalization

- Display and recipient names: trimmed, control-free, 2–120 characters.
- Phone: accepts a Vietnamese leading `0` or `+84` presentation with spaces, dots, or hyphens and stores canonical `0` plus nine digits.
- Province/city, district, and ward: trimmed, control-free, 2–100 characters.
- Detailed address line: trimmed, control-free, 5–255 characters.
- Optional label: null, or trimmed/control-free 1–50 characters.

The shared helpers give the web immediate guidance, but NestJS and PostgreSQL remain authoritative.

### Legacy province and district picker

The web form uses searchable popups for province/city and district. Its frontend-only snapshot comes from the National Statistics Office `DMDVHC` service for `2025-06-30`: 63 province-level units and 696 dependent district-level units immediately before the 2025 consolidation. Search is case- and accent-insensitive. Selecting a different province clears an incompatible district; ward/commune remains a validated text field.

Administrative codes are lookup metadata only. The unchanged account API and PostgreSQL model continue to store human-readable strings, so this legacy picker does not couple checkout data to the snapshot and can later coexist with a post-2025 address adapter. Existing abbreviated or unaccented values are resolved for editing but are not silently rewritten before the user submits the form.

## Default-address invariant and lock order

Every address mutation starts a database transaction and locks the owning `users` row with `SELECT ... FOR UPDATE` before reading or changing addresses. Future checkout code must preserve this lock order whenever it participates in address mutation.

- No active address means no default.
- One or more active addresses means exactly one default.
- The first address becomes default regardless of the submitted option.
- Explicit default selection is idempotent.
- Deleting the default promotes the oldest active address by `createdAt ASC, id ASC`.
- Deleting the final address returns to the valid no-default state.

A partial unique PostgreSQL index prevents more than one active default. Service assertions enforce the at-least-one side before commit.

## Privacy boundary and checkout responsibility

Successful owner responses contain the complete values needed for editing, but errors never echo values. Client account requests use only `authenticatedFetch`; account contact data remains component state and is discarded on logout/navigation. Logs may include only a coarse outcome, authenticated user ID, and opaque address ID.

Shipping addresses remain mutable and soft-deletable. A later checkout/order task must copy the selected recipient and address into an immutable order-owned snapshot; orders must not depend on the mutable account row for historical delivery data.

## Focused verification

Run commands from the repository root with the pinned package manager:

```powershell
npx --yes pnpm@10.34.5 db:migrate:deploy
npx --yes pnpm@10.34.5 db:migrate:deploy
npx --yes pnpm@10.34.5 db:seed
npx --yes pnpm@10.34.5 db:seed
npx --yes pnpm@10.34.5 db:verify

$env:RUN_ACCOUNT_DATABASE_TESTS='1'
npx --yes pnpm@10.34.5 --filter @shopee-clone/api test -- --runTestsByPath test/account.postgres.e2e.spec.ts
Remove-Item Env:RUN_ACCOUNT_DATABASE_TESTS

npx --yes pnpm@10.34.5 test:e2e:account:quick
npx --yes pnpm@10.34.5 test:e2e:auth:quick
npx --yes pnpm@10.34.5 test:e2e:homepage:quick
```

`db:verify` is destructive only to the guarded `TEST_DATABASE_URL` whose database name must end in `_test`. Account quick E2E stubs only non-mutating reads and never changes the local development database.

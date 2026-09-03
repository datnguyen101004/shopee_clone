## Why

The storefront currently treats every visitor as anonymous and `/login` is only an honest placeholder, which blocks every identity-dependent roadmap task. T11 establishes the secure account and session boundary required by role-based access control, profiles, favorites, carts, and checkout.

## What Changes

- Add buyer account registration and login using normalized email addresses and strongly hashed passwords, with stable validation and Problem Details errors.
- Add short-lived access tokens plus rotating, revocable refresh sessions stored as hashes, including logout and refresh-token reuse handling.
- Add account recovery with generic forgot-password responses and expiring, single-use reset tokens delivered through a replaceable mail adapter.
- Add configurable brute-force protection and safe authentication telemetry that does not expose credentials, raw tokens, or account existence.
- Replace the `/login` placeholder with responsive registration, login, forgot-password, and reset-password experiences; keep access tokens out of persistent browser storage and preserve only allowlisted purchase return intents.
- Add authenticated-session discovery so the storefront header and protected flows can distinguish a signed-in user from a guest.
- Extend Prisma migrations, deterministic seed/verification, shared API contracts, focused tests, and isolated browser/database gates for the new capability.

## Capabilities

### New Capabilities

- `account-authentication`: Account registration, credential verification, access and refresh session lifecycle, logout, password recovery, abuse controls, and frontend session behavior.

### Modified Capabilities

None.

## Impact

- `apps/api`: new authentication module, request validation, token/cookie handling, abuse controls, mail adapter, and sanitized error mapping under `/api/v1/auth`.
- `apps/api/prisma`: user credential fields plus refresh-session and password-reset-token persistence, migration, seed, and constraint verification.
- `apps/web`: real account routes, in-memory access-token/session client, authenticated header state, safe return-intent continuation, and recovery UX.
- `packages/contracts`: framework-neutral authentication requests, responses, session user types, and parsers.
- Repository configuration and documentation: authentication secrets, cookie/origin policy, local recovery-mail behavior, focused test commands, and operational notes.
- New security-focused dependencies are expected for password hashing, signed access tokens, cookie parsing, validation, and request throttling.

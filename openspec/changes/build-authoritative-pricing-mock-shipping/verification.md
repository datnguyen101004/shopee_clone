# T17 verification

## Result

The implementation matches the authoritative-pricing and mock-shipping delta specs. The cart quote
is authenticated, version-checked, read-only, calculated from current PostgreSQL facts, parsed at
the web boundary, and displayed as an informational quote that future checkout must recalculate.

## Automated gates

- `pnpm format:check` — passed.
- `pnpm lint` — passed with four existing Next.js `<img>` optimization warnings and no errors.
- `pnpm typecheck` — passed.
- `pnpm test` — passed: infrastructure 6, contracts 50, UI 10, web 130, and API 166 active tests.
- `pnpm build` — passed for contracts, UI, NestJS API, and the Next.js production application.
- `pnpm infra:smoke` — passed migration-from-empty, deterministic seed/import, repeat seed,
  PostgreSQL constraint verification, API build/health, and isolated cleanup.
- Guarded `cart-http.postgres.e2e.spec.ts` plus `cart.postgres.e2e.spec.ts` — 12 passed against
  `TEST_DATABASE_URL` after `pnpm db:verify`.
- `pnpm test:e2e:pricing:quick` — 12 passed at 360, 768, and 1440 pixel viewports.
- `openspec validate build-authoritative-pricing-mock-shipping --strict` — passed.

## Covered boundaries

- Exact request/response keys, safe-integer VND arithmetic, reconciliation invariants, overflow,
  service validation, and shared legacy-province normalization.
- Positive bounded variant weight migration plus deterministic 250–5,000 g dataset fallback and
  generated-field provenance.
- Authentication, global Origin/media precedence, private address ownership, stale/malformed ETag,
  current database price and stock, no-write quote behavior, multi-shop/service/zone itemization,
  and input-order reproducibility.
- Default/no-address flow, service and address changes, obsolete-response race protection, `409`
  reload, logout clearing, accessibility, touch targets, and no viewport overflow.

## Deferred by scope

Voucher application, real carrier rates, stock reservation, checkout, payment, and order creation
remain deferred. `pricing-v1`/`mock-v1` responses are display-only and are not trusted price tokens.

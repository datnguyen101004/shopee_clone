## 1. Shared pricing and geography contracts

- [x] 1.1 Add framework-neutral VND money, pricing version, shipping service, line/shop/quote, request, response, exclusion, and Problem Details types under `packages/contracts`.
- [x] 1.2 Implement exact-key request guards plus response parsers that verify safe integers and every line, shop, shipping, discount, and final-total equation.
- [x] 1.3 Add table-driven contract tests for valid zero/multi-shop quotes, malformed service selections, browser money injection, duplicate shops, overflow, and broken aggregate invariants.
- [x] 1.4 Add a shared legacy 63-province identity/region catalog and normalization helpers, then cross-check the existing web province/district snapshot against it.

## 2. Variant weight persistence and canonical data

- [x] 2.1 Extend Prisma `ProductVariant` with positive bounded `weightGrams` and add an additive migration that backfills existing rows to 500g before enforcing non-null/check constraints.
- [x] 2.2 Update handwritten seed data, cart/pricing fixtures, persistence assertions, and negative database checks to provide and validate variant weights.
- [x] 2.3 Extend canonical dataset types and normalization to accept valid source weight or generate the deterministic 250–5,000g fallback from stable identity while recording `weightGrams` in generated metadata.
- [x] 2.4 Update dataset import/upsert, idempotence tests, canonical dataset tests, and database verification to persist and prove stable positive weights.

## 3. Pure authoritative calculation core

- [x] 3.1 Implement checked non-negative integer VND conversion, add, subtract, multiply, and sum utilities that fail closed on unsafe input or overflow.
- [x] 3.2 Implement legacy-province normalization and the pure versioned mock shipping calculator for all service, zone, unknown-location, ETA, and started-weight-block rules.
- [x] 3.3 Implement the pure commerce pricing calculator for line list price, catalog markdown, merchandise payable, one shipment per shop, exclusions, and exact shop/quote totals.
- [x] 3.4 Add table-driven unit tests for price/compare-at combinations, safe-integer boundaries, three services, three zones, 500g edges, multi-line weights, multi-shop sums, and input-order reproducibility.
- [x] 3.5 Expose a stable snapshot-to-quote calculation seam and add a parity test proving cart and future checkout adapters receive identical results for identical authoritative inputs.

## 4. Authenticated cart quote API

- [x] 4.1 Add the NestJS pricing module, strict DTOs, domain errors, sanitized Problem Details filter, and dependency wiring without accepting owner, quantity, or monetary request fields.
- [x] 4.2 Implement repeatable-read quote orchestration that resolves the session-owned cart/address, validates `If-Match`, reloads current selected commerce facts, canonicalizes services, and performs no writes.
- [x] 4.3 Add `POST /api/v1/cart/quote` with AuthGuard, the global browser-mutation boundary, private/no-store headers, ETag/version metadata, and complete OpenAPI request/response/error documentation.
- [x] 4.4 Add service/controller tests for anonymous access, Origin precedence, strict money-field rejection, address ownership privacy, missing/deleted addresses, malformed/stale ETags, and sanitized persistence/arithmetic failures.

## 5. PostgreSQL quote verification

- [x] 5.1 Extend guarded PostgreSQL fixtures with owned/foreign addresses, multiple shops, discounted variants, distinct weights, stock changes, and deterministic cleanup.
- [x] 5.2 Add real HTTP tests proving current persisted prices override cart/browser snapshots, invalid selected lines are excluded, and quote requests leave cart/address/catalog rows unchanged.
- [x] 5.3 Add multi-shop/service/zone tests that reconcile all fee and discount components and verify stale cart concurrency returns `409` before a mixed-version quote can escape.

## 6. Web quote API and state coordination

- [x] 6.1 Add a typed cart quote API client that sends the current ETag, credentials, address, and service choices and accepts only fully validated quote/Problem Details responses.
- [x] 6.2 Add API-client tests for request shape, no client money, private auth failures, stale conflict parsing, malformed response rejection, and abort propagation.
- [x] 6.3 Add screen-local quote coordination that loads owned addresses, selects the default, defaults each current shop to `STANDARD`, marks obsolete quotes stale, and requotes after address/service/cart changes.
- [x] 6.4 Guard rapid requests with abort/sequence handling, reload cart on `409`, clear private quote state on logout, and add state tests proving late responses cannot overwrite newer choices.

## 7. Responsive cart pricing experience

- [x] 7.1 Add the owned-address selector, address-required empty state, and safe link to `/account/addresses` without exposing or logging unnecessary recipient details.
- [x] 7.2 Add accessible per-shop mock service controls showing service label, mock provider, ETA, and server-confirmed fee while preserving choices for shops still in the current cart.
- [x] 7.3 Render line list/selling price, catalog discount, shop merchandise/shipping/payable, and overall payable totals exclusively from the confirmed quote.
- [x] 7.4 Implement loading, visibly stale, zero-selection, retry, stale-version, and unavailable-total states with live announcements and duplicate-request protection.
- [x] 7.5 Add component and responsive CSS tests for keyboard order, focus, labels, 360/768/1440 layouts, practical touch targets, and no document-level horizontal overflow.

## 8. Focused browser coverage and documentation

- [x] 8.1 Add Playwright coverage for login-required quote access, default-address quote, no-address handoff, multi-shop itemization, service/address changes, race protection, and stale-cart recovery using intercepted contract-valid APIs.
- [x] 8.2 Add `test:e2e:pricing:quick` to the focused E2E runner so T17 browser verification runs only the pricing/cart journey at 360, 768, and 1440 widths.
- [x] 8.3 Document the quote endpoint, integer-VND rules, product markdown semantics, mock-v1 service/rate formula, generated weight policy, error behavior, and future checkout recalculation contract.
- [x] 8.4 Extend `flow.md` with the approved T17 diagram covering address/service choice, security/auth guards, repeatable-read quote calculation, `409` reload, and display-only totals.

## 9. Final validation

- [x] 9.1 Generate Prisma artifacts and run migration-from-empty, seed/import, verification, repeat-seed, and cleanup smoke checks without resetting unrelated developer data.
- [x] 9.2 Run formatting, lint, typecheck, contract/unit/component tests, and production builds across the workspace.
- [x] 9.3 Run focused pricing calculator/API tests and `pnpm test:e2e:pricing:quick` rather than unrelated E2E suites during iteration.
- [x] 9.4 Run the full root test suite and the guarded PostgreSQL pricing/cart suites as final regression gates.
- [x] 9.5 Run `openspec validate build-authoritative-pricing-mock-shipping --strict` and reconcile implementation, docs, specs, task checkboxes, and the T17 flow before handoff.

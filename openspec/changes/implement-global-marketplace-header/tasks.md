## 1. Storefront Shell Structure

- [x] 1.1 Create a typed, centralized buyer category/navigation configuration with stable labels and reserved catalogue query destinations.
- [x] 1.2 Create the `(storefront)` App Router route group and shared layout that composes `PageShell` without changing public URLs.
- [x] 1.3 Move the existing homepage into the storefront group and remove its local header/footer definitions while preserving T05 page content.
- [x] 1.4 Add shared storefront footer composition and verify `/health` and `/design-system` retain their independent shells.

## 2. Global Header and Navigation

- [x] 2.1 Implement the branded utility bar and logo area as one reusable marketplace banner using existing UI primitives and icon exports.
- [x] 2.2 Implement the native GET search form with named `q` input, whitespace trimming, accessible empty-query validation, and `/search` routing.
- [x] 2.3 Implement explicit anonymous account and zero-count cart entries with visible copy, accessible names, and stable `/login` and `/cart` links.
- [x] 2.4 Implement the desktop category navigation and compact mobile disclosure with accurate ARIA state, Escape handling, and focus restoration.
- [x] 2.5 Add responsive application styles for utility/header/search/action/navigation states, 44 px mobile targets, focus visibility, sticky positioning, and overflow safety.

## 3. Honest Placeholder Destinations

- [x] 3.1 Add a storefront `/search` placeholder that reads and displays the submitted `q` value without implementing catalogue data or relevance.
- [x] 3.2 Add storefront `/login` and `/cart` placeholder pages that clearly communicate anonymous and empty states without persistence.
- [x] 3.3 Verify all placeholder pages inherit the same global header/navigation ordering and expose exactly one main landmark.

## 4. Component and Route Tests

- [x] 4.1 Add Testing Library coverage for header landmarks, logo, category configuration, anonymous account copy, zero cart count, and accessible names.
- [x] 4.2 Add search tests for the native action/method contract, trimmed successful submission, whitespace-only prevention, validation association, and retained input.
- [x] 4.3 Add mobile disclosure tests for Enter/Space activation, `aria-expanded`, Escape close, focus restoration, and no hidden-link tab stops.
- [x] 4.4 Add route rendering tests proving buyer placeholders share the shell while health and design-system routes do not gain the buyer banner.

## 5. Browser, Accessibility, and Visual Gates

- [x] 5.1 Extend Playwright coverage to submit a real search, assert the encoded `/search?q=` URL, and verify the destination echoes the normalized query.
- [x] 5.2 Add browser keyboard assertions for header sequence and mobile category disclosure, plus 44 px target and zero-overflow checks at 360, 768, and 1440 px.
- [x] 5.3 Run axe against the buyer shell and placeholder destinations, fixing all serious or critical violations.
- [x] 5.4 Regenerate and manually review marketplace screenshot baselines at all reference widths after confirming intentional header changes.

## 6. Documentation, Verification, and Delivery

- [x] 6.1 Document the storefront route-group boundary, header extension props, reserved destinations, category configuration, and deferred authentication/cart/search ownership.
- [x] 6.2 Run frozen install, format, lint, typecheck, all unit/component tests, production build, Playwright suites, and strict OpenSpec validation; fix every failure.
- [x] 6.3 Manually inspect homepage and placeholder routes at 360, 768, and 1440 px for Shopee fidelity, Vietnamese copy, focus, contrast, disclosure behavior, sticky layout, and overflow.
- [x] 6.4 Record verification evidence for issue #7, commit and push T06 directly to `development`, wait for every GitHub Actions job to succeed, close the issue as completed, and confirm no issue branch remains.

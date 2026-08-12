# Verification evidence

Verified on 2026-08-12 for GitHub issue #7 (T06).

## Automated gates

- `npx --yes pnpm@10.34.5 install --frozen-lockfile` passed with the committed lockfile already current.
- `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` passed for every workspace.
- `pnpm test` passed: 5 infrastructure helper tests, 8 API tests, 2 contract tests, 10 UI tests, and 9 web unit/component tests.
- `pnpm build` passed for the NestJS API and Next.js application. The storefront generated `/`, `/login`, and `/cart` statically, with `/search` server-rendered for query parameters.
- `pnpm test:e2e` passed 21 browser tests across 360×800, 768×1024, and 1440×900 projects. Coverage includes real GET search routing, whitespace validation, keyboard order, mobile disclosure, 44 px buyer actions, horizontal overflow, axe checks, and screenshot comparisons.
- `openspec validate implement-global-marketplace-header --strict` passed.

## Manual review

Reviewed the regenerated homepage baselines and the `/search`, `/login`, and `/cart` placeholders at the three reference widths. The Shopee-inspired orange header, search-first hierarchy, anonymous account and zero-cart states, desktop category row, closed-by-default mobile disclosure, Vietnamese copy, sticky header, and single-main layout are coherent. Browser inspection reported no runtime warnings or errors, no document-level horizontal overflow, and the expected responsive navigation mode.

During review, two production-only defects were found and fixed: server-rendered enabled `ButtonLink` instances no longer receive an unnecessary event handler, and the closed mobile category panel now has an explicit `[hidden]` display rule. The final production build and browser suites include regression coverage for both behaviors.

## Delivery

- Implementation commit `d865336` was pushed directly to `development` without a pull request.
- GitHub Actions run `31587955314` completed successfully: Repository quality and PostgreSQL persistence smoke both passed.
- Verification evidence was posted to issue #7, which was closed with reason `completed`.
- Local and remote branch inspection found only `development` and `main`; no T06 issue branch exists.

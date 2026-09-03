## Context

The T05 homepage currently owns a visually complete but page-local header, while `PageShell` already provides skip navigation and semantic header/navigation slots. See `proposal.md` for motivation and `specs/marketplace-navigation-shell/spec.md` for the observable contract. T06 must establish a shared buyer shell without pulling forward T07 homepage data, T09 search relevance, T11 authentication, or cart persistence.

## Goals / Non-Goals

**Goals:**

- Make one storefront layout own header, category navigation, footer, and main-landmark composition for current and future buyer routes.
- Preserve native form navigation for search while adding concise client-side empty-query validation.
- Keep the mobile disclosure small, deterministic, keyboard-operable, and dependency-free.
- Provide honest placeholder destinations for features whose domain behavior arrives later.

**Non-Goals:**

- Reading a session, cart, category, or catalogue API.
- Implementing autocomplete, recent searches, search ranking, authentication, or cart mutations.
- Applying the buyer chrome to `/health` or `/design-system`.
- Reworking T05 tokens, product-card visuals, or homepage content modules.

## Decisions

### Use an App Router route group for buyer pages

Move the homepage under `app/(storefront)` and add a route-group layout that composes `PageShell` with the shared marketplace chrome. Add `/search`, `/login`, and `/cart` as lightweight routes in the same group. Route groups preserve public URLs and ensure future buyer pages opt into the shell by location rather than manually copying header props.

Alternative considered: wrap every route in the root layout. Rejected because operational and contributor routes intentionally use different shells, and conditional pathname checks in the root would introduce unnecessary client coupling.

### Keep storefront composition in the web app

Implement the branded header and navigation under `apps/web/components/marketplace-header`; use `packages/ui` only for existing generic layout primitives and exported icons. Product-specific copy, destinations, category configuration, and responsive styling remain application concerns.

Alternative considered: add a MarketplaceHeader to `packages/ui`. Rejected because the package is intended for reusable presentation primitives and must not own product routing or buyer state semantics.

### Use a native GET form with progressive validation

The search control submits to `/search` with a named `q` input, so non-empty searches work without JavaScript. A small client handler trims the value, blocks whitespace-only submissions, and displays an associated error. The search placeholder route reads `searchParams` server-side and echoes the normalized query safely.

Alternative considered: route exclusively through `useRouter`. Rejected because it removes progressive enhancement and adds client routing logic where standard form behavior is sufficient.

### Model future state explicitly through fixed placeholders

T06 supplies `Đăng nhập` and a zero-count cart state, linking to `/login` and `/cart` placeholder pages within the storefront shell. Component props define the future extension seam for authenticated display name and cart count, but T06 does not invent session or storage providers.

Alternative considered: disable the actions until later phases. Rejected because disabled navigation is less clear to users and cannot demonstrate the persistent shell across buyer routes.

### Implement mobile navigation as an owned disclosure

A client storefront-chrome component owns the disclosure boolean and trigger ref while passing header and navigation slots to `PageShell`. It maintains `aria-expanded`/`aria-controls`, listens for Escape only while open, restores focus, and relies on shared 480/768/1200 breakpoints for visibility.

Alternative considered: introduce a menu library. Rejected because the interaction is a single disclosure rather than a composite menu widget, and native button/link semantics cover the requirement with less dependency surface.

### Test behavior at component and browser boundaries

Testing Library covers the native form contract, empty validation, semantic names, supplied state, and disclosure focus lifecycle. Playwright covers real navigation URLs, sequential keyboard behavior, reference viewport visibility, mobile target size, overflow, axe checks, and updated versioned screenshots.

## Risks / Trade-offs

- [Reserved `/search`, `/login`, and `/cart` pages could look like finished features] → Label them clearly as placeholder states and avoid domain actions or mocked persistence.
- [A client wrapper around the shell increases the client boundary] → Keep category data and interaction state small; pass page content as server-rendered children and avoid global stores.
- [Static category links may diverge from later API taxonomy] → Centralize them in one typed configuration so T08/T09 can replace the source without changing header markup.
- [Mobile disclosure CSS and the HTML `hidden` state can drift] → Assert visibility and `aria-expanded` in component and Playwright tests at the reference widths.

## Migration Plan

1. Add the shared marketplace header, category configuration, storefront shell, and tests.
2. Move the root page into the `(storefront)` route group without changing `/`.
3. Add the three clearly marked placeholder destinations and remove the homepage-local header/footer definitions.
4. Regenerate screenshot baselines only after manual review at all reference viewports.
5. Roll back by restoring `app/page.tsx` and removing the route-group layout/components; no data or API migration is involved.

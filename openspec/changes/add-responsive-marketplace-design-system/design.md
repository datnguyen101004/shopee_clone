## Context

`apps/web` currently contains one global stylesheet and two simple pages with one-off classes. No shared UI package, icon system, modal/toast infrastructure, responsive contract, or browser testing exists. The accepted architecture reserves `packages/ui` for frontend-only reusable primitives and requires Vitest/Testing Library plus Playwright for browser journeys.

The current Shopee Vietnam storefront reinforces a dense commerce presentation with strong orange emphasis, neutral card surfaces, discount/status badges, image-first tiles, and Vietnamese shopping copy. T05 uses those observable characteristics as inspiration while creating original components and excluding Shopee logos, illustrations, proprietary icons, and feature-specific page composition. The capability specs define the behavior contract; this document fixes the implementation approach.

## Goals / Non-Goals

**Goals:**

- Introduce a stable frontend-only package boundary before multiple storefront features begin.
- Make accessible behavior the default for every primitive rather than a responsibility deferred to feature teams.
- Provide enough visual range for T06–T10 without prematurely encoding header, catalog, or product-detail business behavior.
- Produce deterministic component and responsive browser tests that run locally and in CI.
- Keep the initial bundle tree-shakeable and avoid a heavyweight styling runtime.

**Non-Goals:**

- Implementing the global Shopee-like header/navigation from T06 or homepage/catalog/product pages from T07–T10.
- Supporting dark mode in the first marketplace theme.
- Creating a native application design system or pixel-copying protected Shopee brand assets.
- Connecting showcase examples to backend APIs or introducing product business contracts.
- Adopting Storybook, a monolithic component framework, or a CSS-in-JS runtime in T05.

## Decisions

### 1. Create `@shopee-clone/ui` as source-consumed frontend package

`packages/ui` will own React primitives, token metadata, styles, tests, and public exports. It will expose typed source modules for Next.js transpilation plus one explicit stylesheet entry imported by the web root layout. React and React DOM remain peer dependencies, and the package cannot import Next.js, NestJS, Prisma, API contracts, or application code.

Source consumption keeps CSS and component development simple inside the monorepo and avoids a publish-oriented bundler before there is a second frontend. A copied `dist` stylesheet/build pipeline was rejected as unnecessary packaging overhead; placing everything in `apps/web` was rejected because later buyer, seller, and admin surfaces need an enforceable shared boundary.

### 2. Use layered vanilla CSS with prefixed classes and semantic tokens

The stylesheet will use cascade layers for reset, tokens, base, components, utilities, and motion. Public component classes use a `sc-` prefix. CSS custom properties provide semantic color, typography, spacing, radius, shadow, z-index, and duration values; documented TypeScript metadata mirrors token groups for the showcase. Reference layout breakpoints are mobile-first at 480 px, 768 px, and 1200 px, with a 1200 px maximum content container; smoke viewports are 360, 768, and 1440 px.

Vanilla CSS is chosen because the repository already uses it, it has no runtime cost, and the component set is bounded. Tailwind was rejected because introducing a utility compiler and repository-wide authoring convention is larger than this issue. CSS Modules were rejected for the shared stylesheet because composition primitives and state attributes need stable cross-package classes.

### 3. Build on native elements and focused accessible headless primitives

Buttons, links, fields, checkboxes, radio controls, select, cards, badges, skeletons, and layout primitives will wrap native semantics with `forwardRef`, explicit display names, and minimal prop extension. Icons will come from a tree-shakeable open-source icon package and an `Icon` wrapper will enforce decorative versus labelled use.

Dialog and toast behavior will use focused headless accessibility primitives rather than hand-implementing focus trapping, portals, dismissal, live regions, and focus restoration. A full component suite was rejected because its visual constraints would fight the marketplace theme; fully custom dialog/toast code was rejected due to accessibility and edge-case risk. Exact dependency versions will be pinned during apply after compatibility checks with React 19.

### 4. Separate primitives, composites, and page patterns

The public package surface will distinguish:

- foundation: tokens, icon rules, visually-hidden helper;
- primitives: button, field controls, badge, card, divider, skeleton;
- feedback: dialog and toast provider/hooks;
- layout: container, stack, cluster, responsive grid, section, page shell;
- patterns: loading, empty, and error states.

The package will not define product DTOs, fetch functions, routes, or navigation content. A neutral `MarketplacePreviewCard` may exist only in the showcase as composition example and will not be exported as a feature contract.

### 5. Turn the web root into a neutral design-system showcase shell

The current homepage will become a polished, static preview of the visual foundation: brand/token samples, component states, a marketplace-card composition example, async states, dialog demo, and toast demo. A dedicated `/design-system` route will contain the full contributor showcase, while `/` demonstrates only the shell and key primitives. Both work without the API. T06 can later replace page content and supply real header/navigation slots without changing the shell contract.

This gives reviewers a browser-visible artifact without committing Storybook infrastructure. A documentation-only Markdown catalog was rejected because interaction, responsive behavior, and accessibility cannot be verified there.

### 6. Test at three complementary layers

`packages/ui` will use Vitest, Testing Library, and user-event for rendering, roles, keyboard behavior, disabled/loading semantics, field associations, dialog focus, toast announcements, and async patterns. Automated accessibility checks will use axe in component tests and browser smoke.

Playwright will run Chromium projects at 360x800, 768x1024, and 1440x900. It will start the production Next.js server, assert landmarks/skip link/focus/no overflow/core visibility, scan the showcase for serious/critical accessibility violations, and compare versioned full-page screenshots. CI will install the pinned Chromium binary and run the responsive gate after the production build.

DOM-only responsive assertions were rejected because jsdom does not perform layout. Manual screenshots alone were rejected because acceptance requires a repeatable gate.

### 7. Accessibility policy is encoded in components and CSS

Interactive components use native semantics, visible `:focus-visible`, 44 px primary mobile hit targets, text plus icon/error cues, and contrast-checked semantic colors. Skeleton shimmer and overlay/toast motion are disabled under `prefers-reduced-motion`. Modal focus and toast live-region semantics are delegated to the selected headless primitives but verified through tests. The shell begins with a skip link and exposes exactly one main landmark.

The first theme is light-only because mixing unverified dark tokens into the initial scope would double the state matrix. Semantic names allow a later dark theme without component API changes.

## Risks / Trade-offs

- **[Source-exported workspace package can accidentally rely on Next.js behavior]** → Give `packages/ui` its own strict typecheck, lint, and unit tests; prohibit Next imports and verify public exports from a clean build.
- **[Headless primitive behavior or types may lag React 19]** → Pin current compatible versions, test portal/ref/focus behavior in React 19, and keep wrappers narrow enough to replace the dependency later.
- **[Global prefixed CSS can leak or be overridden]** → Use cascade layers, semantic attributes, and `sc-` class prefixes; keep application overrides in a later layer rather than increasing specificity.
- **[Screenshot tests become noisy across operating systems]** → Run visual baselines against one pinned Playwright Chromium/Linux CI environment, use a stable system-font stack, disable animations, and keep dynamic timestamps/data out of showcase markup.
- **[A showcase route can be mistaken for a production feature]** → Label it as a developer-facing component reference, use static data only, and exclude it from primary customer navigation.
- **[Shopee-inspired styling drifts into trademark copying]** → Use original name/logo treatment, open-source icons, generated geometric placeholders, and semantic orange/neutral cues without copying proprietary assets.
- **[T05 expands into T06 navigation work]** → Limit page shell to slots and landmarks; do not implement account/search/cart/category behavior or persistent header content.

## Migration Plan

1. Scaffold `packages/ui`, its strict configuration, styles entry, and token documentation; add it to `apps/web` and the workspace gates.
2. Implement and test foundation/primitives, then dialog/toast feedback, then layout and async patterns.
3. Replace the one-off web global styles with the design-system stylesheet and migrate existing home/health pages into the page shell without changing health behavior.
4. Add the showcase and deterministic component/accessibility tests.
5. Add Playwright responsive projects, approved baseline screenshots, and CI browser setup/gate.
6. Verify all repository and browser gates before pushing directly to `development`; rollback is a normal code revert because no backend API or database migration changes.

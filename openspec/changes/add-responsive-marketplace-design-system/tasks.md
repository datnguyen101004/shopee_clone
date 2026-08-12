## 1. UI Package and Token Foundation

- [x] 1.1 Verify React 19 compatibility and pin the minimal current dependencies for class composition, open-source icons, accessible dialog/toast behavior, user interaction tests, axe checks, and Playwright Chromium; regenerate the pnpm lockfile with pnpm 10.34.5.
- [x] 1.2 Scaffold the frontend-only `@shopee-clone/ui` workspace package with source exports, stylesheet export, React peer dependencies, strict TypeScript, shared ESLint, Vitest/jsdom setup, and build/typecheck/test scripts that prohibit application and backend imports.
- [x] 1.3 Define documented semantic token metadata and layered CSS custom properties for brand/neutral/feedback colors, Vietnamese-friendly typography, spacing, sizing, radius, elevation, z-index, breakpoints, and motion.
- [x] 1.4 Add the scoped reset/base styles, `sc-` class convention, visually-hidden helper, stable focus-visible treatment, 44 px mobile target policy, and reduced-motion overrides.
- [x] 1.5 Add package-boundary and token tests that verify public exports, semantic token coverage, stylesheet availability, and absence of Next.js, NestJS, Prisma, API contract, or application imports.

## 2. Core Marketplace Primitives

- [x] 2.1 Implement typed Button and button-like Link primitives with five emphasis variants, three sizes, icon slots, full-width mode, and accessible loading/disabled behavior.
- [x] 2.2 Implement labelled Input, Textarea, Select, Checkbox, and Radio primitives with description, required, disabled, invalid, error association, and native keyboard semantics.
- [x] 2.3 Implement Badge, Card, Divider, Icon, price/text presentation, and composition helpers with consistent dense marketplace states and correct decorative/meaningful icon handling.
- [x] 2.4 Implement text, media, and card Skeleton primitives plus an accessible loading-region pattern that preserves layout and disables shimmer for reduced motion.
- [x] 2.5 Add Testing Library/user-event/axe coverage for primitive variants, roles, accessible names, focus, activation, disabled/loading prevention, field relationships, keyboard behavior, and serious accessibility violations.

## 3. Feedback Components and Page Patterns

- [x] 3.1 Implement accessible Dialog composition with labelled title/description, portal/overlay, focus containment, Escape and backdrop policy, scroll locking, destructive confirmation layout, and trigger focus restoration.
- [x] 3.2 Implement a Toast provider and API for info/success/warning/error variants with live-region semantics, bounded stacking, action/dismiss controls, timeout pause/resume, and reduced-motion behavior.
- [x] 3.3 Implement reusable LoadingState, EmptyState, and ErrorState patterns with Vietnamese defaults, override slots, semantic status, optional icon, and keyboard-operable primary/secondary actions.
- [x] 3.4 Add focused tests for dialog keyboard/focus lifecycle, toast announcements/actions/stack limits/timers, persistent inline error guidance, and automated accessibility checks.

## 4. Responsive Layout and Web Integration

- [x] 4.1 Implement Container, Stack, Cluster, ResponsiveGrid, Section, and full-bleed composition primitives using shared mobile-first gutters, breakpoints, section rhythm, and the 1200 px content boundary.
- [x] 4.2 Implement PageShell with the first-focusable skip link, exactly one main landmark, optional header/navigation/footer slots, stable heading structure, and no spacing artifacts for omitted slots.
- [x] 4.3 Configure Next.js to consume `@shopee-clone/ui`, import the shared stylesheet once in the root layout, and replace one-off global styles while retaining only application-level overrides.
- [x] 4.4 Migrate the health page and root page into the shell without changing the health contract or adding backend dependencies; make the root a polished static marketplace-foundation preview rather than a T06 header implementation.
- [x] 4.5 Build a static `/design-system` contributor showcase covering token samples, every component variant/state, marketplace card composition, responsive layouts, async states, dialog, and toast interactions with realistic Vietnamese copy.
- [x] 4.6 Add web/component tests proving the shell works without the API, renders only supplied landmarks, supports skip navigation, has stable hydration, and exposes the complete showcase.

## 5. Responsive Visual and Accessibility Gates

- [x] 5.1 Configure pinned Playwright Chromium projects for 360x800 mobile, 768x1024 tablet, and 1440x900 desktop against the production Next.js server with deterministic animation/font/data settings.
- [x] 5.2 Add browser assertions for one main landmark, skip-link focus transfer, sequential keyboard operation, essential component visibility, 44 px primary mobile targets, centered desktop container, and zero horizontal overflow at every reference viewport.
- [x] 5.3 Add browser axe scans that fail on serious or critical violations and validate dialog focus containment/restoration and toast announcement/dismissal in a real browser.
- [x] 5.4 Capture and review versioned full-page screenshot baselines for the root shell and design-system showcase at all reference widths, then make visual comparison failures viewport-specific.
- [x] 5.5 Extend GitHub Actions with pinned Playwright browser installation, browser caching where safe, production server execution, responsive/accessibility tests, screenshot artifact upload on failure, and cleanup that always terminates the web server.

## 6. Documentation, Verification, and Delivery

- [x] 6.1 Document token intent, package boundaries, public component APIs, state/accessibility rules, responsive reference widths, showcase usage, and the process for approving intentional screenshot changes.
- [x] 6.2 Run frozen install, package-boundary/token checks, format, lint, typecheck, all component/unit tests, production build, Playwright accessibility/responsive/visual suites, and strict OpenSpec validation; fix every failure.
- [x] 6.3 Manually inspect the rendered root and showcase at 360, 768, and 1440 px for Shopee-inspired visual fidelity, Vietnamese copy, interaction polish, overflow, focus, contrast, and reduced motion while confirming T06+ feature behavior remains absent.
- [ ] 6.4 Record verification evidence for issue #6, commit and push the completed T05 change directly to `development`, wait for every GitHub Actions job to succeed, close the issue as completed, and confirm no issue branch remains.

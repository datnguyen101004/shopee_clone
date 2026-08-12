## Why

The web application still uses a one-off foundation page, so every upcoming storefront feature would otherwise invent its own styling, interaction states, and responsive behavior. T05 establishes a reusable, accessible visual language and page shell that can support the Shopee-like header, homepage, catalog, account, and commerce flows in later issues.

## What Changes

- Introduce a frontend-only `@shopee-clone/ui` workspace package containing documented design tokens and reusable primitives for icons, buttons, form controls, badges, product-ready cards, skeletons, dialogs, and toasts.
- Establish a Shopee-inspired visual foundation using a commerce-orange brand scale, warm neutral surfaces, dense marketplace spacing, clear elevation, Vietnamese-friendly typography, and consistent motion/focus behavior without copying protected Shopee assets.
- Add responsive layout primitives and an application page shell for mobile, tablet, and desktop, including skip navigation, content containers, section composition, and safe viewport behavior.
- Add reusable loading, empty, and error state patterns and a non-feature-specific component showcase page that documents supported variants and interaction states.
- Add component, accessibility, and responsive browser smoke coverage at agreed 360 px, 768 px, and 1440 px viewports.

## Capabilities

### New Capabilities

- `marketplace-design-system`: Design tokens, accessible UI primitives, interaction states, documentation, and component-level behavior for the web application.
- `responsive-page-shell`: Responsive containers, page structure, shared async states, and viewport/accessibility behavior used by future buyer, seller, and admin pages.

### Modified Capabilities

None.

## Impact

- Adds the frontend-only `packages/ui` workspace package and makes `apps/web` its first consumer.
- Replaces one-off global page styling with layered tokens, reset/base styles, reusable components, and a neutral marketplace shell.
- Adds carefully selected frontend dependencies for accessible primitives, icons, class composition, and browser accessibility checks where justified by the design.
- Extends frontend tests and CI with component and responsive visual/accessibility smoke coverage; backend APIs and persistence are unchanged.
- T06 and later storefront issues consume this foundation rather than reimplementing navigation, product, form, feedback, and layout patterns.

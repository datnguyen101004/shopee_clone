## Why

Buyer-facing pages currently embed a one-off header inside the homepage, so navigation, search, account, and cart entry points cannot remain consistent as the storefront expands. T06 establishes the persistent responsive shell required before data-driven homepage and catalogue work begins.

## What Changes

- Introduce a reusable global marketplace header for buyer-facing pages with the Shopee-inspired utility bar, brand link, search form, account entry, cart entry, and category navigation.
- Route non-empty search submissions to the reserved catalogue search URL with a normalized `q` query parameter while keeping search relevance and result data out of scope.
- Represent anonymous account and empty-cart states explicitly through visible copy, accessible names, and a zero-count cart indicator.
- Provide compact mobile behavior with a keyboard-operable navigation disclosure and layouts that remain usable at the established reference viewports.
- Replace the homepage-local header markup with the shared shell without adding authentication, cart persistence, catalogue APIs, or backend dependencies.
- Add component and browser coverage for navigation landmarks, search submission, anonymous states, keyboard behavior, responsive layout, and accessibility.

## Capabilities

### New Capabilities

- `marketplace-navigation-shell`: Defines the persistent buyer header, category navigation, search routing, anonymous account/cart states, and responsive keyboard-accessible behavior.

### Modified Capabilities

None.

## Impact

- `apps/web` gains reusable buyer-shell components, route-aware client interactions, application-level styles, and tests.
- `packages/ui` may gain only generic disclosure or icon-button support if the buyer header cannot compose existing primitives cleanly.
- Existing public storefront markup moves out of the homepage; `/health` and `/design-system` remain operational/contributor surfaces rather than buyer routes.
- No API, database schema, authentication session, cart state, or new infrastructure dependency is introduced.

# Marketplace design system

The reusable UI foundation lives in `packages/ui`. It intentionally owns presentation primitives only; product data, routing, and business behavior stay in applications.

## Use it in an application

Add `@shopee-clone/ui` as a workspace dependency, configure the framework to transpile the package, and import the stylesheet once at the application root:

```tsx
import { Button, Card, PageShell } from '@shopee-clone/ui';
import '@shopee-clone/ui/styles.css';
```

The `/design-system` route is the living showcase for tokens, controls, commerce composition, dialog/toast feedback, and async states.

## Foundations

- Colors use the `--sc-color-*` custom properties. `brand-500` is the visual accent, while the darker `brand-600` and `brand-700` are used where text contrast matters.
- Typography, spacing, radius, elevation, target size, layer, and motion values are also exported as CSS custom properties.
- Layout changes at 480, 768, and 1200 CSS pixels. Reference test viewports are 360×800, 768×1024, and 1440×900.
- `Container` limits content to 1200px. `Stack`, `Inline`, `Cluster`, and `Grid` express common responsive composition without page-specific margins.
- `PageShell` owns the skip link and exactly one focusable `main` landmark. Pages provide optional header, navigation, and footer slots.

## Components and accessibility

Buttons, labelled form fields, badges, cards, prices, icons, dividers, skeletons, dialog, toast, and loading/empty/error states are exported from the package root. Keep icon-only controls labelled. Do not remove visible focus styles. Always provide a title for `DialogContent`, useful toast text, and actionable recovery for recoverable errors.

Radix UI provides dialog focus management and toast live-region behavior. Lucide is the single icon source. Animations honor `prefers-reduced-motion`, touch targets default to at least 44px, and destructive or unavailable actions expose semantic states.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser tests check the three reference viewports, horizontal overflow, keyboard feedback flows, axe rules, and versioned screenshots under `e2e/snapshots`.

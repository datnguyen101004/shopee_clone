## Purpose

Provide a reusable, documented, Shopee-inspired visual language and accessible component foundation for all marketplace experiences in the web application.

## ADDED Requirements

### Requirement: Semantic design tokens

The design system SHALL expose documented semantic tokens for brand, text, surface, border, feedback, typography, spacing, sizing, radius, elevation, layering, breakpoints, and motion. Components MUST consume semantic tokens rather than duplicate raw visual values, and token names MUST describe purpose rather than a single feature.

#### Scenario: Consumer applies the marketplace theme

- **WHEN** the web application loads the design-system styles
- **THEN** reusable components inherit the commerce-orange brand scale, warm neutral surfaces, readable typography, spacing rhythm, elevation, and focus appearance from semantic tokens

#### Scenario: Contributor reviews token documentation

- **WHEN** a contributor needs to build a later storefront component
- **THEN** the documentation identifies the supported semantic token, intended usage, and responsive foundation without requiring inspection of existing feature markup

### Requirement: Button and link interactions

The system SHALL provide button and button-like link primitives with primary, secondary, outline, ghost, and destructive emphasis, small/medium/large sizing, optional leading or trailing icons, full-width composition, and loading and disabled states. Every variant MUST preserve a visible keyboard focus indicator and MUST prevent activation while disabled or loading.

#### Scenario: Keyboard user activates a button

- **WHEN** a keyboard user focuses an enabled button and presses its activation key
- **THEN** the focus indicator remains visible and the button invokes its action exactly once

#### Scenario: Button is loading

- **WHEN** a button enters its loading state
- **THEN** it exposes a programmatically determinable busy state, retains its dimensions, shows a non-decorative loading cue, and cannot trigger duplicate activation

### Requirement: Accessible form controls

The system SHALL provide text input, textarea, select, checkbox, and radio primitives that support visible labels, descriptions, required state, disabled state, invalid state, and error messages. Labels and messages MUST be programmatically associated with their controls, and focus/hover/filled/error/disabled states MUST remain distinguishable without relying on color alone.

#### Scenario: Form field is invalid

- **WHEN** a field receives an error message
- **THEN** the control is exposed as invalid, the message is associated with it, and both a visual indicator and readable text communicate the error

#### Scenario: User navigates form controls by keyboard

- **WHEN** a user tabs through enabled controls and changes checkbox, radio, or select values using the keyboard
- **THEN** focus order follows document order and every control supports its expected native keyboard behavior

### Requirement: Marketplace display primitives

The system SHALL provide reusable badge, card, divider, icon, and price/text presentation primitives that support dense marketplace composition without embedding feature-specific data fetching or business rules. Decorative icons MUST be hidden from assistive technology, while meaningful icons MUST require an accessible name.

#### Scenario: Card is used for interactive content

- **WHEN** a card contains a single primary destination
- **THEN** it presents a consistent surface, hover and focus-within treatment, and a semantic link target without nested conflicting interactive elements

#### Scenario: Icon conveys meaning without adjacent text

- **WHEN** an icon-only control is rendered
- **THEN** the control has an accessible name and meets the minimum interactive target policy

### Requirement: Loading skeletons

The system SHALL provide skeleton primitives for text, media, and card-shaped placeholders that preserve expected layout, are ignored by assistive technology, and respect reduced-motion preferences.

#### Scenario: Content is loading

- **WHEN** a page renders skeleton placeholders
- **THEN** their geometry approximates the final content, the region communicates loading through accessible status text, and animation is disabled for users requesting reduced motion

### Requirement: Accessible dialogs

The system SHALL provide modal dialog primitives with a labelled title, optional description, focus containment, Escape-key dismissal when allowed, backdrop interaction policy, scroll locking, and focus restoration to the trigger. Destructive confirmations MUST distinguish cancel and confirm actions clearly.

#### Scenario: Dialog opens from a trigger

- **WHEN** a user activates a dialog trigger
- **THEN** focus moves into the dialog, background content is unavailable to keyboard and assistive-technology interaction, and focus remains contained until dismissal

#### Scenario: Dialog closes

- **WHEN** the user dismisses the dialog through an allowed action or the Escape key
- **THEN** the dialog closes and focus returns to the element that opened it

### Requirement: Toast notifications

The system SHALL provide informational, success, warning, and error toasts with accessible live-region behavior, optional action, manual dismissal, bounded stacking, and a pause policy that gives users time to read or interact. Toasts MUST NOT be the sole presentation of a critical or persistent error.

#### Scenario: Non-critical operation succeeds

- **WHEN** an action publishes a success toast
- **THEN** the message is announced politely, appears in the standard viewport region, and dismisses according to the documented timeout or user action

#### Scenario: Error toast is shown

- **WHEN** an operation publishes an error toast
- **THEN** the message uses assertive semantics where appropriate, remains manually dismissible, and does not replace an inline error required to recover

### Requirement: Component documentation and examples

The web application SHALL provide a non-feature-specific design-system showcase that demonstrates tokens, component variants, interaction states, async patterns, and responsive composition. Examples MUST use realistic Vietnamese marketplace copy and MUST not depend on backend availability.

#### Scenario: Contributor opens the showcase

- **WHEN** the design-system route loads without the API running
- **THEN** it displays every core primitive and its required states with reusable usage guidance

#### Scenario: Automated accessibility smoke runs

- **WHEN** the showcase is tested at supported viewports
- **THEN** it has no serious or critical automated accessibility violations and all interactive examples remain keyboard operable

### Requirement: Motion and visual accessibility

Core components MUST meet WCAG 2.2 AA contrast for normal text and interactive state indicators, SHALL preserve visible focus, SHALL provide at least 44 by 44 CSS pixel touch targets for primary mobile controls, and MUST honor `prefers-reduced-motion` for non-essential animation.

#### Scenario: User requests reduced motion

- **WHEN** the operating system reports `prefers-reduced-motion: reduce`
- **THEN** shimmer, toast transition, dialog transition, and hover movement become instant or non-animated without hiding state changes

#### Scenario: Component states are audited

- **WHEN** default, hover, focus, active, disabled, loading, and invalid states are evaluated
- **THEN** text and meaningful indicators meet the documented contrast target and no state is communicated by color alone

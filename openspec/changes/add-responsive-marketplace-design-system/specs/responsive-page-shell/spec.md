## Purpose

Provide a stable, accessible, and responsive page structure that future marketplace features can compose consistently across mobile, tablet, and desktop viewports.

## ADDED Requirements

### Requirement: Responsive viewport contract

The page shell SHALL support 360 px mobile, 768 px tablet, and 1440 px desktop reference viewports without unintended horizontal scrolling, clipped controls, overlapping content, or unreadable text. Layout behavior between reference viewports MUST adapt continuously rather than require device detection.

#### Scenario: Mobile viewport renders the shell

- **WHEN** the shell is rendered at 360 by 800 CSS pixels
- **THEN** content uses mobile gutters, single-column flow where required, touch targets remain operable, and the document has no horizontal overflow

#### Scenario: Tablet viewport renders the shell

- **WHEN** the shell is rendered at 768 by 1024 CSS pixels
- **THEN** gutters and composition adapt to the tablet breakpoint without retaining desktop-only density or causing overflow

#### Scenario: Desktop viewport renders the shell

- **WHEN** the shell is rendered at 1440 by 900 CSS pixels
- **THEN** content is centered in the documented maximum-width marketplace container and whitespace does not stretch content beyond readable bounds

### Requirement: Semantic page structure

The shell SHALL provide a skip link, one primary main landmark, composable header and footer slots, an optional navigation slot, and a predictable heading hierarchy. Feature pages MUST be able to omit optional regions without leaving empty landmarks or spacing artifacts.

#### Scenario: Keyboard user skips repeated chrome

- **WHEN** a keyboard user focuses and activates the first skip link
- **THEN** focus moves to the primary content landmark and its focus location is visibly indicated

#### Scenario: Feature omits an optional shell slot

- **WHEN** no header, navigation, or footer content is supplied
- **THEN** the corresponding landmark is not rendered and the main content retains correct spacing

### Requirement: Reusable container and section composition

The system SHALL provide page, full-bleed, constrained container, stack, cluster, grid, and section composition primitives with documented spacing and responsive behavior. These primitives MUST accept semantic content without imposing marketplace business logic.

#### Scenario: Feature composes a dense product section

- **WHEN** a later feature uses the container, section, and grid primitives
- **THEN** items follow the shared gutters, section rhythm, and responsive columns without feature-specific breakpoint CSS

#### Scenario: Full-bleed campaign surface contains constrained content

- **WHEN** a section requests a full-width background with constrained inner content
- **THEN** the background reaches the viewport edges while text and controls remain aligned to the shared container

### Requirement: Shared asynchronous page states

The system SHALL provide loading, empty, and error state patterns with semantic status, concise Vietnamese default copy that consumers can override, optional illustration/icon, and contextual primary and secondary actions. State patterns MUST preserve page context and avoid replacing recoverable errors with toast-only feedback.

#### Scenario: Collection is empty

- **WHEN** a page has loaded successfully but has no items
- **THEN** the empty state explains the absence, exposes an optional next action, and is distinguishable from loading or failure

#### Scenario: Request fails and can be retried

- **WHEN** a recoverable request fails
- **THEN** the error state presents readable problem text and a keyboard-operable retry action in the content region

#### Scenario: Page content is pending

- **WHEN** route or section data is pending
- **THEN** the loading state preserves approximate layout and provides non-visual status without moving focus unexpectedly

### Requirement: Shell rendering stability

The initial shell and static design-system showcase MUST render without backend data, SHALL avoid hydration mismatches, and SHALL maintain stable layout during initial font and client-component initialization.

#### Scenario: Backend is unavailable

- **WHEN** the web application starts while the API is stopped
- **THEN** the shell and design-system showcase render their static content and interactions without an uncaught request error

#### Scenario: Page hydrates in the browser

- **WHEN** server-rendered shell markup becomes interactive
- **THEN** no hydration warning is emitted and layout shift stays within the documented smoke-test threshold

### Requirement: Responsive visual regression coverage

The design-system showcase and page shell SHALL have repeatable browser smoke checks at the three reference viewports. The checks MUST verify landmarks, keyboard focus, overflow, essential component visibility, and captured screenshots suitable for detecting unintended visual changes.

#### Scenario: Reference viewport smoke checks run

- **WHEN** browser tests execute at 360 px, 768 px, and 1440 px widths
- **THEN** every viewport passes structural and overflow assertions and produces a stable visual comparison result

#### Scenario: Layout regresses

- **WHEN** a change causes overflow, hidden essential controls, landmark loss, or a visual difference beyond the approved baseline
- **THEN** the responsive smoke gate fails with a viewport-specific diagnostic

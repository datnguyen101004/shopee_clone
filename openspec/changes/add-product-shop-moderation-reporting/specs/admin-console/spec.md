## ADDED Requirements

### Requirement: Admin console provides a moderation workspace
The admin console SHALL add a role-gated moderation workspace containing queue filters, stable pagination, case detail, report evidence, decision history, and product/shop decision actions. The decision form SHALL provide the optional private note. The workspace SHALL also provide a bounded review lookup and hide/restore control. It MUST use only admin APIs, MUST preserve private no-store behavior, and MUST render explicit loading, empty, forbidden, stale-conflict, validation, unavailable-target, success, and recoverable failure states without placing report evidence or notes in URLs or browser storage.

#### Scenario: Admin reviews a case
- **WHEN** an authenticated admin opens a queue item
- **THEN** the console displays its current version, target state, evidence, decision history, and decision controls without exposing credentials or unrelated account data

#### Scenario: Case changes in another session
- **WHEN** a decision returns a stale-version conflict
- **THEN** the console keeps unsent reason/note input in memory, reloads authoritative case state, announces the conflict, and does not claim success

### Requirement: Moderation actions require accessible confirmation
Decision, reversal, and review visibility controls SHALL disable duplicate submission while pending and provide deterministic focus and live-region feedback. Target-changing decisions and reversals MUST require a confirmation dialog that names the action and affected target, validates the public reason separately from the private note, and lets cancellation leave server state untouched. The workspace MUST remain usable at the project's mobile, tablet, and desktop reference widths with keyboard navigation, visible focus, 44-by-44 CSS pixel primary touch targets, and no serious or critical automated accessibility violation.

#### Scenario: Admin cancels a suspension
- **WHEN** an admin dismisses the product suspension confirmation
- **THEN** no mutation is sent and focus returns to the originating control

#### Scenario: Admin completes a decision on mobile
- **WHEN** an admin resolves a case at the mobile reference width using only the keyboard
- **THEN** fields, evidence, confirmation, status feedback, and refreshed outcome remain operable without horizontal page overflow

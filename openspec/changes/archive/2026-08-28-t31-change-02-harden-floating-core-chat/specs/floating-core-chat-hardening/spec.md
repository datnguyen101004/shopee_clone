## Purpose

Make the existing floating text-chat experience reliable for long histories, recoverable failures, explicit read engagement, safe continuation, and short realtime interruptions without expanding its product scope.

## ADDED Requirements

### Requirement: Older history loads without losing the reading position

The system SHALL support loading older accepted messages before the oldest displayed sequence. Older pages MUST merge in authoritative sequence order without duplicates, and prepending a page MUST preserve the message and visual offset that anchored the user's reading position.

#### Scenario: User reaches the older edge

- **WHEN** a participant scrolls near the oldest loaded message and older history exists
- **THEN** the widget shows a non-blocking loading state, prepends the next older page, and preserves the previous reading anchor

#### Scenario: Older page overlaps realtime state

- **WHEN** an older-history response includes a message already received through realtime or reconnect backfill
- **THEN** the widget retains one copy at its authoritative sequence

#### Scenario: Older page fails

- **WHEN** an older-history request fails
- **THEN** the widget keeps the currently visible history and composer, shows an older-history error with a retry action, and preserves the reading position during retry

#### Scenario: Beginning of history is reached

- **WHEN** the server reports no older accepted messages
- **THEN** the widget stops requesting older pages and presents a subtle beginning-of-conversation indicator

### Requirement: Newest-region movement respects reading intent

The system SHALL open a selected materialized conversation at its newest accepted message. New messages MUST remain visible automatically while the participant is in the newest region, but MUST NOT move the viewport when the participant is reading older history.

#### Scenario: Conversation is opened or reopened

- **WHEN** a participant opens a materialized conversation without a preserved older-history reading intent
- **THEN** the composer remains reachable and the newest accepted message is visible

#### Scenario: Message arrives at the newest region

- **WHEN** an accepted message arrives while the participant is at or near the bottom
- **THEN** the widget advances to show the complete newest message

#### Scenario: Message arrives while reading older history

- **WHEN** an accepted message arrives while the participant is away from the newest region
- **THEN** the viewport remains stable and an actionable `Tin nhắn mới` marker navigates to the newest region

#### Scenario: History crosses a calendar day

- **WHEN** adjacent displayed messages were accepted on different local display dates
- **THEN** the widget presents a date boundary without repeatedly showing timestamps on every old message

### Requirement: Contextual targets resolve canonical existing conversations

The system SHALL resolve a contextual shop target against the complete authenticated user's materialized conversation set, not only the contacts currently loaded in the widget. Existing user-pair conversations MUST be reused and self-targets MUST remain unavailable.

#### Scenario: Existing conversation is outside the first contact page

- **WHEN** a participant activates `Chat ngay` for a shop owner whose conversation is not in the currently loaded contact page
- **THEN** the widget opens that existing conversation and does not create a temporary duplicate target

#### Scenario: No conversation exists for the target pair

- **WHEN** a participant activates `Chat ngay` for an eligible shop owner with whom no accepted message exists
- **THEN** the widget opens one local temporary composer without materializing a conversation

### Requirement: Empty temporary targets are discarded on close

The system SHALL discard a temporary target when the widget is closed before a first accepted message and the target's draft is empty. A non-empty draft MAY remain session-local according to the existing draft policy.

#### Scenario: Empty temporary composer is closed

- **WHEN** a participant closes the widget on an unmaterialized target with an empty composer
- **THEN** the target, temporary messages, and temporary selection are removed and do not reappear when the widget is reopened

#### Scenario: Temporary composer contains a draft

- **WHEN** a participant closes the widget on an unmaterialized target with a non-empty draft
- **THEN** no conversation is materialized and the session-local draft remains associated only with that target

### Requirement: Failed sends preserve content without a retry shortcut

The system SHALL leave an expired or rejected send as a failed bubble and MUST NOT expose a dedicated retry button or automatically replay it after the bounded send window. Failed content MUST return to an empty composer but MUST NOT overwrite a newer draft.

#### Scenario: Send fails while composer is empty

- **WHEN** a pending send becomes failed and that target's composer is empty
- **THEN** the original bubble remains failed and its content is restored to the composer for a new normal Send action

#### Scenario: Send fails after a new draft was entered

- **WHEN** a pending send becomes failed while the participant has entered different composer content
- **THEN** the newer draft remains unchanged and the failed bubble remains selectable or copyable

#### Scenario: Participant sends restored content

- **WHEN** the participant activates the normal Send action after content was restored
- **THEN** the system creates a new client message attempt and does not mutate the failed attempt into a sent message

### Requirement: Read state advances only through explicit conversation engagement

The system SHALL allow pointer, touch, and keyboard users to advance the open conversation's read watermark by explicitly engaging the conversation surface, composer, avatar, or contact. Merely foregrounding the browser or opening the widget MUST NOT mark messages read.

#### Scenario: Keyboard focus enters the open conversation

- **WHEN** a participant moves keyboard focus into the selected conversation surface or composer while unread messages are present
- **THEN** the system advances the watermark through the newest currently known sequence and reconciles contact and global unread counts

#### Scenario: Pointer engages the open conversation

- **WHEN** a participant clicks or taps the selected conversation surface, avatar, or contact while unread messages are present
- **THEN** the same monotonic read watermark is applied

#### Scenario: Browser alone becomes foreground

- **WHEN** the browser becomes visible without explicit interaction with the selected conversation
- **THEN** the unread watermark and badges remain unchanged

### Requirement: Forbidden conversations remain readable when authorized

The system SHALL distinguish a conversation that can be viewed but cannot accept new messages from a generic load failure. Authorized retained history MUST remain visible and the composer MUST be replaced by a generic read-only explanation.

#### Scenario: Participant may view but not send

- **WHEN** conversation history remains authorized but message sending is forbidden
- **THEN** the widget preserves the history, removes the send controls, and displays `Bạn không thể tiếp tục cuộc trò chuyện này` without an internal enforcement reason

#### Scenario: Conversation cannot be loaded

- **WHEN** the conversation itself cannot be fetched or is not authorized for viewing
- **THEN** the widget shows the appropriate recoverable load error or privacy-preserving denial instead of presenting an empty conversation

### Requirement: Loading states preserve usable context

The system SHALL present structured loading placeholders for the contact list and selected conversation. Refreshes and page loads MUST preserve previously authorized content whenever safe and MUST keep the close control operable.

#### Scenario: Initial contact list is loading

- **WHEN** no contact data has been loaded yet
- **THEN** the contact column presents several contact-shaped skeletons and the widget remains closable

#### Scenario: Selected conversation is loading

- **WHEN** the participant selects a conversation whose messages are not yet available
- **THEN** the header and message region present structured placeholders until success, forbidden state, or failure is known

#### Scenario: Refresh fails with cached content

- **WHEN** refreshing contacts fails while authorized content is already displayed
- **THEN** the widget retains the content and provides a scoped retry action

### Requirement: Post-login chat continuation is strictly internal and validated

The system SHALL accept a stored guest chat continuation only when its shop identifier, internal return path, and supported source are all valid. Invalid, tampered, stale, external, or self-target continuations MUST be consumed and discarded without creating chat state.

#### Scenario: Valid continuation resumes

- **WHEN** authentication succeeds with a valid internal continuation for an eligible non-owned shop
- **THEN** the user returns to the intended marketplace location and the corresponding existing conversation or temporary composer opens

#### Scenario: Continuation has an unsafe return path

- **WHEN** the stored return path is external, protocol-relative, malformed, or otherwise not an approved application path
- **THEN** the continuation is discarded and no external navigation or chat state is created

#### Scenario: Continuation source is missing or unsupported

- **WHEN** a stored continuation does not carry a recognized chat entry-point source
- **THEN** it is discarded without opening a target

### Requirement: Presence tolerates brief connection replacement

The system SHALL apply a short disconnect grace period before projecting a participant inactive when their last authenticated realtime connection disappears. A reconnect within that period MUST cancel the inactive projection.

#### Scenario: Participant reloads quickly

- **WHEN** a participant's final socket disconnects and a replacement authenticated socket connects within the grace period
- **THEN** contacts and headers do not receive an intervening inactive projection

#### Scenario: Participant remains disconnected

- **WHEN** no authenticated connection returns before the grace period expires
- **THEN** the participant is projected inactive consistently to affected conversations

#### Scenario: Multiple tabs remain connected

- **WHEN** one tab disconnects but another authenticated tab for the same user remains connected
- **THEN** the participant remains active and no disconnect grace countdown changes the visible state

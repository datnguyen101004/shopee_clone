## Purpose

Give floating-chat users accessible per-contact and per-message controls for muting, blocking, replying, and reporting without losing history, drafts, or privacy-safe state.

## ADDED Requirements

### Requirement: Each materialized contact exposes a stable two-action safety menu
The floating chat SHALL show one keyboard-accessible action trigger centered at the right edge of each materialized contact row. Its menu MUST contain exactly the current mute toggle and current block toggle, MUST NOT select or mark the conversation read merely by opening, and MUST remain usable without obscuring the contact name, preview, or unread badge.

#### Scenario: User opens an unmuted unblocked contact menu
- **WHEN** an authenticated user activates the action trigger for an unmuted and unblocked contact
- **THEN** the menu identifies the contact and offers `Mute notifications` and `Block`

#### Scenario: User opens an already muted and blocked contact menu
- **WHEN** the same user activates the action trigger after both states are active
- **THEN** the menu offers `Unmute notifications` and `Unblock` without marking the conversation read

#### Scenario: Keyboard user opens and closes the contact menu
- **WHEN** a keyboard user focuses the contact action trigger, opens its menu, and presses Escape
- **THEN** the menu closes and focus returns to the same contact trigger

### Requirement: Conversation notification mute is participant scoped and reversible
An authenticated conversation participant SHALL be able to mute or unmute notifications for that conversation idempotently. Muting MUST preserve message delivery, conversation history, contact unread count, and global chat unread count, while suppressing future in-app chat notification aggregation until unmuted.

#### Scenario: Participant mutes a conversation
- **WHEN** a participant mutes an eligible conversation
- **THEN** the contact is projected as muted, future accepted messages remain unread in chat but create no new in-app notification activity for that participant, and existing notification history is retained

#### Scenario: Participant unmutes a conversation
- **WHEN** a participant unmutes a muted conversation
- **THEN** only future accepted messages become eligible for notification and no notification is backfilled for the muted interval

#### Scenario: Non-participant attempts to change mute state
- **WHEN** an authenticated account attempts to mute or unmute a conversation it does not participate in
- **THEN** the request is denied without revealing participant identity or changing any notification state

### Requirement: Directed user blocks stop chat without erasing history
An authenticated user SHALL be able to create and remove a directed block against the other participant. If either direction is blocked, both accounts MUST be unable to send new messages to the pair, no new chat notification may be produced for the pair, retained authorized history SHALL remain readable, and only the blocker SHALL receive an explicit `blockedByMe` state.

#### Scenario: User blocks the other participant
- **WHEN** a participant confirms a block
- **THEN** the operation succeeds idempotently, the blocker sees `You blocked this user`, both composers become unavailable, and prior history remains readable

#### Scenario: Blocked user views the conversation
- **WHEN** the other participant opens a conversation blocked by the first participant
- **THEN** the history remains available but the composer shows a generic unavailable state that does not reveal who blocked whom

#### Scenario: Blocker removes the block
- **WHEN** the blocker confirms unblock and no other block or moderation restriction applies
- **THEN** message eligibility returns without automatically resending a draft or failed message

#### Scenario: User attempts self-block or unrelated block mutation
- **WHEN** an account targets itself or a user outside its authorized chat relationship
- **THEN** the operation is rejected without creating block state or exposing another conversation

### Requirement: Messages expose reply and report actions accessibly
Each message bubble SHALL expose an action trigger on hover, focus, or deliberate touch selection without reflowing history. The action surface MUST offer `Reply` and `Report`, retain keyboard focus correctly, and use a mobile action sheet where an anchored popover cannot fit.

#### Scenario: Keyboard user focuses a message
- **WHEN** a message bubble receives keyboard focus
- **THEN** its action trigger becomes available and opens a menu containing `Reply` and `Report`

#### Scenario: Message menu opens near a viewport edge
- **WHEN** the action trigger is activated near the bottom or side of the widget
- **THEN** the menu changes direction or presentation so both actions remain fully visible without horizontal page scroll

### Requirement: A text message can quote one authorized message
The send operation SHALL accept at most one optional reply target from the same conversation. Accepted message projections SHALL include a bounded reply reference sufficient to render and navigate to the original message, and the reply target SHALL participate in the send request digest so idempotent replay cannot change it.

#### Scenario: Participant replies to a message in the same conversation
- **WHEN** the participant sends valid text with an authorized reply target
- **THEN** one message is accepted with the next conversation sequence and a reply projection identifying the original message, sender label, sequence, and bounded preview

#### Scenario: Reply target belongs to another conversation
- **WHEN** a send request names a message outside the canonical participant conversation
- **THEN** the request is rejected without revealing the other message and without creating a new message, unread increment, notification, or outbox event

#### Scenario: Idempotency key is replayed with a different reply target
- **WHEN** the same client message identifier is reused with different reply context
- **THEN** the server returns an idempotency conflict and preserves the original accepted message

#### Scenario: User cancels reply composition
- **WHEN** the composer contains draft text and the user cancels the reply reference
- **THEN** only the reply reference is removed and the draft text remains unchanged

#### Scenario: User activates a quoted reference
- **WHEN** the quoted original is outside the loaded history
- **THEN** the widget loads and anchors the authorized original when available, or shows a neutral unavailable-reference state without losing the reply message

### Requirement: Safety and reply state converges across tabs
Mute, block, unblock, message eligibility, accepted replies, and affected unread state SHALL converge across authenticated tabs through authoritative responses and realtime projections. Stale responses MUST NOT reverse a newer block, restriction, or read state.

#### Scenario: One tab blocks while another tab has the composer open
- **WHEN** the first tab successfully blocks the participant
- **THEN** the second tab disables sending, retains its local draft without auto-submitting it, and shows only the privacy-safe state allowed for the current account

#### Scenario: Reply acknowledgement overlaps realtime delivery
- **WHEN** a reply is received through both the send response and realtime projection
- **THEN** one accepted reply bubble remains with one sequence and one reply reference

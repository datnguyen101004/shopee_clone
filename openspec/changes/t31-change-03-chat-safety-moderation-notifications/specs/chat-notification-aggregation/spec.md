## Purpose

Deliver low-noise in-app chat notifications that aggregate by conversation, respect mute and active attention, and return the recipient to the exact floating-chat context with consistent unread state.

## ADDED Requirements

### Requirement: Only eligible unseen accepted messages create chat notification activity
A successfully accepted incoming message SHALL be eligible for in-app chat notification activity only when the recipient has not muted the conversation, neither participant block nor account restriction forbids the pair, and the recipient has no fresh explicit-attention lease for that conversation at the newest region. Failed, replayed, self-sent, blocked, muted, or actively attended messages MUST NOT create duplicate notification activity.

#### Scenario: Widget is closed when a message is accepted
- **WHEN** an eligible incoming message commits while the recipient has no fresh attention lease for that conversation
- **THEN** the recipient's chat notification aggregate becomes unread and the chat unread count advances

#### Scenario: Recipient is actively engaged with the exact conversation
- **WHEN** the recipient has a fresh explicit-attention lease at the newest region when an incoming message commits
- **THEN** the message is delivered in chat without creating or reactivating an in-app notification aggregate

#### Scenario: Recipient is reading older history
- **WHEN** the widget shows the conversation but the recipient is outside the newest region
- **THEN** the message remains eligible for notification and the widget retains its new-message jump behavior

#### Scenario: Conversation is muted
- **WHEN** an eligible message is accepted for a recipient who muted that conversation
- **THEN** chat unread state advances but no notification aggregate is created or updated

### Requirement: Notification activity aggregates per recipient and conversation
The system SHALL maintain one stable in-app chat notification aggregate per recipient and conversation, update it with the latest accepted message time, bounded preview, newest sequence, and current unread message count, and order it by latest activity. Concurrent or replayed delivery MUST NOT create a second aggregate or overcount messages.

#### Scenario: Several messages arrive in one conversation
- **WHEN** three eligible messages are accepted before the recipient reads the conversation
- **THEN** one unread notification item reports three unread messages and shows the latest bounded preview and activity time

#### Scenario: Messages arrive from two conversations
- **WHEN** eligible messages arrive from two distinct conversations
- **THEN** two notification aggregates exist and each carries only its own conversation count and target

#### Scenario: Outbox delivery is retried
- **WHEN** the same accepted message projection is processed more than once
- **THEN** the stable aggregate count and newest sequence remain correct without a duplicate notification row

### Requirement: Chat notification metadata is private and bounded
Chat notification projections SHALL identify only the recipient-authorized conversation, safe display label, optional safe avatar, unread count, newest sequence, bounded text preview, and activity time. They MUST NOT expose the sender's private account data, message content beyond the preview limit, block direction, moderation case data, session information, or credentials.

#### Scenario: Preview is not safe to expose
- **WHEN** an accepted message cannot be included in a notification preview
- **THEN** the notification uses a neutral `You have a new message` body while retaining the authorized conversation target

#### Scenario: Chat notification channel scope
- **WHEN** a chat message notification is projected in this change
- **THEN** it is delivered through the in-app inbox only and no per-message email or browser push is required

### Requirement: Selecting a chat notification opens the exact floating conversation
Selecting a chat notification SHALL keep the user on the current storefront route, open the existing floating widget, resolve the authorized conversation even when absent from the loaded contact page, load through the notification's newest sequence, and mark the notification read only after the conversation opens successfully.

#### Scenario: Recipient selects an unread chat notification
- **WHEN** the conversation remains authorized and available
- **THEN** the notification popover closes, the floating widget opens the exact conversation at its newest relevant region, and chat/notification read synchronization proceeds

#### Scenario: Conversation cannot be opened
- **WHEN** authorization or loading fails while selecting the notification
- **THEN** the notification remains unread, no full-page chat navigation occurs, and the user receives a retryable privacy-safe error

### Requirement: Chat reads synchronize the corresponding notification aggregate
Advancing a conversation read watermark SHALL update that conversation's aggregate unread metadata from authoritative chat state and mark the aggregate read when no unread message remains. Marking notification items read, including mark-all, MUST NOT advance chat read watermarks without opening and explicitly engaging the conversation.

#### Scenario: User reads all messages in one conversation
- **WHEN** the authoritative chat read watermark reaches the latest incoming sequence
- **THEN** the matching chat notification aggregate becomes read and both chat and notification badges refresh without heuristic decrements

#### Scenario: User marks all notifications read without opening chat
- **WHEN** the account marks all notification items read
- **THEN** notification badge state clears while chat unread counts remain authoritative and chat items can state that unread messages still exist

#### Scenario: Stale tab submits an older read state
- **WHEN** a stale tab reports a lower chat watermark after another tab read newer messages
- **THEN** neither the chat watermark nor the notification aggregate regresses

### Requirement: Explicit attention is short lived and multi-session safe
Attention suppression SHALL require an authenticated, conversation-scoped, short-lived lease refreshed by explicit focus or pointer engagement at the newest region. Closing, switching conversation, moving away from the newest region, session revocation, or lease expiry SHALL stop suppression; one active tab MAY suppress duplicate notifications for the account while other tabs remain passive.

#### Scenario: User opens the right conversation but does not engage
- **WHEN** a conversation is rendered without explicit focus or pointer engagement
- **THEN** passive visibility alone does not create a fresh attention lease

#### Scenario: Engaged tab loses its session
- **WHEN** the authenticated session is revoked or the attention lease expires
- **THEN** later eligible messages can create notification activity and no stale lease suppresses them

#### Scenario: One of several tabs is actively engaged
- **WHEN** one authenticated tab has a fresh newest-region lease for the conversation and another tab is passive
- **THEN** one accepted message is not redundantly surfaced as an in-app notification for that account

### Requirement: Notification state converges in realtime and through recovery
Chat notification aggregate changes and notification unread totals SHALL converge across authenticated tabs through realtime projections, while REST list/count refresh remains authoritative after reconnect or unknown event versions.

#### Scenario: Notification aggregate changes in another tab
- **WHEN** one tab reads a conversation or receives an eligible message
- **THEN** other authenticated tabs converge the chat badge, notification badge, and affected notification item without duplicating the aggregate

#### Scenario: Realtime projection is missed
- **WHEN** a tab reconnects after missing notification updates
- **THEN** authoritative notification and chat snapshots restore the correct aggregate/read counts

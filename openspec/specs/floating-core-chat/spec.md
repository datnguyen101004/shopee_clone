# floating-core-chat Specification

## Purpose

Provide authenticated marketplace users with one responsive floating surface for starting, continuing, and tracking reliable user-to-user text conversations without creating empty conversations or separate shop identities.

## Requirements

### Requirement: Chat is available only through the global floating widget
The system SHALL expose chat through a shared floating widget across storefront routes and SHALL NOT require or expose a full-page buyer inbox or seller chat workspace for this capability. The widget MUST retain a two-column contact-and-conversation structure at supported viewport sizes.

#### Scenario: User opens and closes the global widget
- **WHEN** a user activates the global chat button
- **THEN** the widget opens at its most recent in-session state, the button becomes a close or minimize control, and closing it preserves persisted conversation content

#### Scenario: Widget renders at required breakpoints
- **WHEN** the widget is used at 360 × 800, 768 × 1024, or 1440 × 900
- **THEN** both the contact column and conversation column remain usable without causing horizontal scrolling on the page, and the composer remains reachable above the mobile keyboard and safe area

#### Scenario: Unread badge exceeds two digits
- **WHEN** the authenticated account has between 1 and 99 unread chat messages
- **THEN** the global button shows the exact total, and when the total exceeds 99 it shows `99+`

### Requirement: Contextual chat targets the shop owner account
The system SHALL provide “Chat now” entry points on product detail, public shop detail, and each shop section in checkout. Every entry point MUST resolve the selected shop to its single owner user account, and all entry points for the same pair of users MUST address the same conversation.

#### Scenario: Buyer starts from a product or shop
- **WHEN** an authenticated user activates “Chat now” for a shop they do not own
- **THEN** the widget opens a conversation or temporary composer addressed to that shop's owner account without automatically sending product, shop, or order content

#### Scenario: Buyer starts from one shop in checkout
- **WHEN** an authenticated user activates “Chat now” in a checkout shop section
- **THEN** the widget targets that section's shop owner and the checkout's shipping, note, and payment inputs remain unchanged

#### Scenario: Shop owner views their own shop target
- **WHEN** the authenticated account is the owner of the shop represented by a contextual chat action
- **THEN** the action remains visibly present but disabled, explains that self-chat is unavailable, and creates no temporary or persisted chat state

### Requirement: Guest chat intent resumes only after successful authentication
The system SHALL allow guests to see contextual chat actions, require authentication before chat data is accessed, and preserve a safe internal continuation containing the target shop, originating page, and entry-point context.

#### Scenario: Guest signs in successfully
- **WHEN** a guest activates “Chat now” and subsequently completes authentication
- **THEN** the system returns the user to the originating marketplace page and opens a temporary composer for the resolved shop owner account

#### Scenario: Authentication is cancelled or fails
- **WHEN** a guest does not complete authentication after activating “Chat now”
- **THEN** no conversation, contact, unread state, or chat notification is created

#### Scenario: Continuation target is unsafe or stale
- **WHEN** a stored continuation points outside the application, to a missing shop, or to the newly authenticated user's own account
- **THEN** the continuation is discarded safely and no chat state is created

### Requirement: Opening or drafting does not create an empty conversation
The system SHALL keep an unmaterialized composer local to the active browser session until the first message is accepted. A temporary target MUST NOT appear in either participant's contact list, increase unread counts, or emit a notification.

#### Scenario: User opens chat without sending
- **WHEN** a user opens a contextual target and closes the widget with an empty composer
- **THEN** the temporary target is discarded immediately and neither participant gains a contact entry

#### Scenario: User closes a non-empty temporary draft
- **WHEN** a user closes the widget after entering text but before the first successful send
- **THEN** the draft remains available for that target within the current authenticated browser session but is not persisted as a conversation

#### Scenario: User switches away from an unsent temporary draft
- **WHEN** a user attempts to select another existing contact while an unmaterialized target has a non-empty draft
- **THEN** the system requests confirmation before discarding or leaving that draft

### Requirement: The first accepted message materializes the conversation atomically
The system SHALL create at most one conversation for an unordered pair of distinct user accounts and add it to both contact lists only when the first non-empty text message is accepted successfully. Conversation creation, first-message persistence, participant membership, sequence allocation, and recipient unread increment MUST succeed atomically.

#### Scenario: First message succeeds
- **WHEN** the sender's first valid text message is accepted
- **THEN** one conversation and one ordered message exist, both users see the other in their contact list, and the recipient's unread total increases if the message is not already read

#### Scenario: Concurrent first messages target the same user pair
- **WHEN** both users or multiple tabs submit first messages for the same pair concurrently
- **THEN** the system produces one conversation, preserves each accepted message exactly once, and exposes one contact entry to each participant

#### Scenario: First message is rejected or never accepted
- **WHEN** the first send fails validation, authorization, or delivery before server acceptance
- **THEN** no empty conversation or contact entry remains in persistent state

### Requirement: Text sends are idempotent and explicitly bounded during interruption
The system SHALL accept text-only messages with a unique client message identifier, reject blank or whitespace-only content, and return the same accepted result for an exact replay. The client MUST keep an interrupted send pending for no more than three seconds and MUST NOT automatically resend it after that window.

#### Scenario: Message is accepted within the three-second window
- **WHEN** connectivity recovers and the send is accepted no later than three seconds after the attempt began
- **THEN** the pending bubble becomes sent exactly once and the server-assigned order is retained

#### Scenario: Three-second window expires
- **WHEN** the client cannot confirm acceptance within three seconds
- **THEN** the bubble becomes “Send failed,” no retry action is shown, and later reconnection does not automatically send that attempt

#### Scenario: User manually sends failed content again
- **WHEN** the user uses the normal Send action after a failed attempt
- **THEN** the system creates a new client message attempt and leaves the original failed bubble unchanged

#### Scenario: Exact accepted request is replayed
- **WHEN** the same participant replays the same client message identifier with the same content
- **THEN** the system returns the original accepted message without creating a duplicate or incrementing unread state again

#### Scenario: Client message identifier is reused with different content
- **WHEN** a participant reuses an accepted client message identifier with a different payload
- **THEN** the system rejects the request with a stable conflict response and does not alter the original message

### Requirement: Contact list contains only materialized conversations
The system SHALL list only conversations containing at least one accepted message for the authenticated participant. Contacts MUST be ordered by latest accepted message, searchable only within existing contacts, and annotated with user identity, latest preview, latest activity, approximate presence, and unread state.

#### Scenario: New accepted message changes contact ordering
- **WHEN** a conversation receives the latest accepted message
- **THEN** its contact moves to the top without creating a duplicate entry

#### Scenario: User filters contacts
- **WHEN** the user enters a contact search term
- **THEN** only existing materialized contacts are filtered and no new recipient or conversation is discovered or created

#### Scenario: Account has no materialized conversations
- **WHEN** the contact list is empty, including while a temporary composer is open
- **THEN** the contact column states that no conversations exist and directs the user to a shop's “Chat now” action

### Requirement: Message history has stable cursor ordering
The system SHALL return authorized conversation history in a stable total order and support loading older pages without duplicates, omissions, or viewport jumps. Realtime arrivals and reconnect backfill MUST merge by authoritative message identity and order.

#### Scenario: User loads older history
- **WHEN** the user requests messages before the oldest currently displayed cursor
- **THEN** the older page is prepended in stable order and the previously visible reading position remains anchored

#### Scenario: Realtime and history responses overlap
- **WHEN** the same accepted message is received through realtime delivery and a history or reconnect response
- **THEN** the client displays one bubble in its authoritative position

#### Scenario: New message arrives while user reads older history
- **WHEN** a new message arrives while the selected conversation is scrolled away from the newest region
- **THEN** the view does not auto-scroll, the contact gains an unread indicator, and an actionable “New message” marker navigates to the newest region

### Requirement: Read state uses a monotonic conversation watermark
The system SHALL maintain a monotonic last-read position per participant and conversation. Marking an accepted message as read MUST mark all earlier messages in that conversation as read for that participant, and stale updates MUST NOT move the watermark backward.

#### Scenario: User explicitly engages the open conversation
- **WHEN** the user focuses or activates the open chat column, or selects the contact/avatar, while unread messages are present
- **THEN** the system advances the watermark through the newest message currently known and reduces the contact and global unread counts accordingly

#### Scenario: Browser window merely becomes active
- **WHEN** the browser window returns to the foreground without the user engaging the chat column or selecting the contact
- **THEN** unread messages remain unread

#### Scenario: User remains above the newest region after marking read
- **WHEN** the read watermark advances while the user is still viewing older history
- **THEN** unread badges clear for the covered messages but the “New message” navigation marker remains until the user reaches the new-message region

#### Scenario: Multiple tabs advance read state
- **WHEN** one authenticated tab advances a conversation watermark
- **THEN** other connected tabs converge on the same or a later watermark and consistent unread totals without a full-page reload

### Requirement: Realtime state reconnects without duplication or silent loss
The system SHALL deliver accepted messages, conversation summaries, read-watermark changes, unread totals, and approximate presence updates to connected sessions for the affected accounts. Reconnection MUST backfill state after the last confirmed position and deduplicate overlaps.

#### Scenario: Recipient is connected
- **WHEN** a message is accepted for a connected recipient
- **THEN** the recipient receives the message and updated contact/unread state without polling or reloading the page

#### Scenario: Connection is interrupted and restored
- **WHEN** a connected client loses and later restores realtime connectivity
- **THEN** the widget shows a reconnecting state, retains readable cached content and drafts, then fills any missing accepted events in order without duplicates

#### Scenario: Account uses multiple tabs
- **WHEN** the same account has multiple connected tabs
- **THEN** accepted messages, contact ordering, unread totals, and read changes converge consistently across them

### Requirement: Presence is approximate and privacy-preserving
The system SHALL expose only an approximate active or inactive state derived from authenticated connection activity and MUST NOT expose an exact last-active timestamp in the chat interface.

#### Scenario: Participant has a recent active connection
- **WHEN** presence evidence is within the configured active window
- **THEN** the contact may be shown as active using text or iconography that does not rely on color alone

#### Scenario: Presence evidence is absent or stale
- **WHEN** no qualifying activity is available
- **THEN** the participant is shown as inactive without revealing a precise time or internal reason

### Requirement: Conversation access is participant-scoped
The system MUST authenticate every chat REST request and realtime connection, authorize conversation access against the current user account, prevent self-chat, and avoid exposing another user's private conversation, membership, read state, or presence-session details.

#### Scenario: Non-participant requests conversation data
- **WHEN** an authenticated user requests history or mutations for a conversation they do not belong to
- **THEN** the system returns a stable not-found or forbidden Problem Details response without exposing participant data

#### Scenario: Participant loses permission to continue
- **WHEN** an authenticated participant may still view retained history but is no longer allowed to send
- **THEN** the history remains available, the composer is replaced with a generic prohibition message, and no private enforcement reason is disclosed

#### Scenario: Session becomes invalid
- **WHEN** the account is suspended, logged out, or its session can no longer be authenticated
- **THEN** chat requests and realtime access stop, sensitive in-memory chat state is cleared as appropriate, and no further messages are delivered to that session

### Requirement: Loading and failure states preserve recoverable user work
The widget SHALL provide explicit loading, empty, list-load failure, reconnecting, forbidden, and send-failure states. Recoverable failures MUST preserve already displayed authorized history and per-contact drafts whenever doing so is safe.

#### Scenario: Contact list load fails with cached conversation visible
- **WHEN** refreshing the contact list fails while authorized conversation content is already displayed
- **THEN** the content remains visible and the contact column offers a retry action

#### Scenario: Failed content can return to the composer safely
- **WHEN** a send attempt fails and that contact's composer is empty
- **THEN** the failed content is restored to the composer for editing and a new normal Send action

#### Scenario: Failed content must not overwrite a newer draft
- **WHEN** a send attempt fails while the user has already entered different composer content
- **THEN** the newer draft remains unchanged and the failed bubble remains selectable or copyable

### Requirement: The widget is keyboard and assistive-technology operable
The system SHALL expose semantic names and status announcements for the widget, icon controls, unread indicators, presence, and send failures. Focus MUST move into the widget when opened by keyboard, return to the invoking control when closed, and respect the documented navigation order and reduced-motion preference.

#### Scenario: Keyboard user opens and closes chat
- **WHEN** a keyboard user opens the widget and later closes it with Escape while no discard confirmation is active
- **THEN** focus enters the widget on open and returns to the invoking control on close

#### Scenario: Draft discard confirmation is active
- **WHEN** a draft-discard confirmation is displayed
- **THEN** Escape is handled by the confirmation rather than closing the entire widget unexpectedly

#### Scenario: Device requests reduced motion
- **WHEN** the user's device requests reduced motion
- **THEN** chat state changes remain understandable without relying on the standard slide, scale, or reordering animations

### Requirement: Change 1 remains text-only and chat-local
The system SHALL limit this capability to user-to-user text chat and chat-local unread indicators. It MUST NOT expose attachments, product/order/voucher cards, editing, deletion, blocking, reporting, moderation tools, quick replies, full-page chat, or separate closed-chat notification aggregation as part of Change 1.

#### Scenario: Client submits unsupported rich content
- **WHEN** a client attempts to send an attachment or non-text message type through Change 1
- **THEN** the system rejects it with a stable validation response and creates no message or conversation side effect

#### Scenario: Widget is closed when a message arrives
- **WHEN** an accepted message arrives while the recipient's widget is closed
- **THEN** the chat unread badge updates, but Change 1 does not require a separate aggregated notification-center entry or full-page inbox

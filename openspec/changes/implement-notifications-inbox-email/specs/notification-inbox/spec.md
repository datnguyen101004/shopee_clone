## Purpose

Provides in-app notification center capabilities including unread badges, header quick-preview popover, rich metadata with deep links, categorized listing, cursor pagination, and mark-as-read / archival operations for authenticated users across all roles.

## ADDED Requirements

### Requirement: Unread notification count indicator
The system SHALL provide an authenticated endpoint returning the total number of unread notifications for the active user across all categories.

#### Scenario: Fetch unread count for user with unread messages
- **WHEN** an authenticated user requests unread notification count
- **THEN** the system returns the exact integer count of unread and non-archived notifications.

#### Scenario: Unauthenticated request rejected
- **WHEN** an unauthenticated request attempts to fetch unread count
- **THEN** the system responds with a 401 Authentication Required problem response.

### Requirement: Header quick notification popover
The system SHALL support a quick notification popover on the marketplace and seller headers displaying up to 5 latest notifications with immediate read-state toggling and direct navigation.

#### Scenario: Preview latest notifications from header bell
- **WHEN** user hovers or clicks the notification bell in the header
- **THEN** a popover opens showing the 5 most recent notifications with thumbnail, title, short preview, relative timestamp, and a "View All" link.

### Requirement: Rich metadata and deep-linking navigation
The system SHALL store and return structured metadata (`targetUrl`, `thumbnailUrl`, `category`, `referenceId`) for every notification, allowing users to navigate directly to the relevant resource upon interaction.

#### Scenario: Click order notification navigates to order detail
- **WHEN** user clicks on an order status notification with `targetUrl: "/account/orders/0000-1111"`
- **THEN** the notification is automatically marked as read and the browser navigates to `/account/orders/0000-1111`.

### Requirement: Categorized and cursor-paginated notification inbox
The system SHALL allow authenticated users to query their in-app notifications with cursor pagination and optional filtering by category (`ORDERS`, `PROMOTIONS`, `ACCOUNT`, `SYSTEM`).

#### Scenario: Query inbox with category filter and cursor
- **WHEN** user requests notifications with category `ORDERS` and a page limit of 20
- **THEN** the system returns up to 20 notifications matching the category ordered by `createdAt` descending along with a deterministic `nextCursor`.

### Requirement: Mark notification as read
The system SHALL allow users to mark specific notifications or all unread notifications as read.

#### Scenario: Mark single notification as read
- **WHEN** user marks an unread notification owned by them as read
- **THEN** the notification's `isRead` flag is set to true, `readAt` timestamp is recorded, and subsequent unread counts decrement accordingly.

#### Scenario: Mark all notifications as read
- **WHEN** user triggers mark-all-as-read action
- **THEN** all unread notifications for the user are marked as read with the current timestamp.

#### Scenario: Unauthorized update rejected
- **WHEN** a user attempts to mark a notification owned by another user as read
- **THEN** the system rejects the mutation with a 404/403 problem response without modifying state.

### Requirement: Archive notification
The system SHALL allow users to archive notifications, hiding them from the active inbox while preserving event records.

#### Scenario: Archive single notification
- **WHEN** user archives a notification
- **THEN** the notification's `isArchived` flag is set to true and it is excluded from default inbox queries and unread count calculations.

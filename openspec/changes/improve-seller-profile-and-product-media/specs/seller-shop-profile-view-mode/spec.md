## Purpose

Cho phép người bán xem hồ sơ shop đã lưu ở chế độ chỉ đọc trước khi chủ động chuyển sang chỉnh sửa, giúp thông tin dễ kiểm tra và tránh thay đổi ngoài ý muốn.

## ADDED Requirements

### Requirement: Existing shop opens in profile view mode
The system SHALL show an existing shop as a structured read-only profile by default instead of immediately rendering editable inputs.

#### Scenario: Seller opens an existing shop profile
- **WHEN** an authenticated seller whose shop already exists opens the shop management screen
- **THEN** the system displays the current shop information as read-only content and displays a `Cập nhật hồ sơ` action

#### Scenario: Shop profile contains optional media
- **WHEN** the existing shop has a logo or banner
- **THEN** the system displays those media items in the read-only profile

#### Scenario: Shop profile omits optional content
- **WHEN** the existing shop has no description, logo, or banner
- **THEN** the system presents a clear empty-state value without showing broken media or editable controls

### Requirement: Read-only profile exposes complete seller-facing information
The read-only profile SHALL display the shop name, slug, description, operating status, approval or onboarding state, contact details, location, pickup address, and return address using the latest server response.

#### Scenario: Seller reviews saved addresses
- **WHEN** the read-only profile is displayed
- **THEN** the pickup and return addresses are visibly separated and include recipient, phone number, province, district, ward, and address line when available

#### Scenario: Application requires seller attention
- **WHEN** the shop application is pending or rejected
- **THEN** the profile displays that state and any server-provided rejection reason without hiding the action that allows the seller to update eligible information

### Requirement: Seller explicitly enters and exits edit mode
The system SHALL enter edit mode only after the seller selects `Cập nhật hồ sơ`, prefill the editor from the current shop, and allow unsaved changes to be cancelled.

#### Scenario: Seller starts editing
- **WHEN** the seller selects `Cập nhật hồ sơ`
- **THEN** the system replaces the read-only profile with a form prefilled from the current canonical shop data

#### Scenario: Seller cancels editing
- **WHEN** the seller selects `Hủy` while editing
- **THEN** the system discards unsaved form changes and returns to the unchanged read-only profile

#### Scenario: Seller successfully saves editing
- **WHEN** the seller submits valid changed profile information and the server accepts it
- **THEN** the system refreshes the canonical shop data, returns to read-only mode, and confirms that the profile was updated

#### Scenario: Seller save fails
- **WHEN** the seller submits profile information and the server rejects or cannot persist it
- **THEN** the system keeps the populated editor open and displays an actionable error without replacing the last saved read-only profile data

### Requirement: Seller without a shop retains onboarding flow
The system SHALL continue to display the shop registration or onboarding form when the authenticated account does not yet have a shop.

#### Scenario: Account has no shop
- **WHEN** an authenticated eligible account opens shop management and no shop exists for that account
- **THEN** the system displays the shop creation form instead of an empty read-only profile


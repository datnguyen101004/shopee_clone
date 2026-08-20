# admin-catalog-configuration Specification

## Purpose
Let admins maintain category hierarchy, homepage display order, campaign banners, and selected homepage-module settings without breaking catalog referential integrity or the public homepage read model.
## Requirements
### Requirement: Admins manage category hierarchy
An admin SHALL be able to list, create, update, activate, deactivate, and reorder categories. Each category MUST have a unique slug, name, optional parent, integer sort order, and active flag. A category MUST NOT be its own ancestor. Deactivating a parent MUST NOT silently delete children; children remain addressable. Hard-delete is allowed only when the category has no products, no child categories, and no homepage-module references. All other referenced categories MUST be rejected with a stable conflict that preserves referential integrity.

#### Scenario: Admin creates a child category
- **WHEN** an admin creates a valid slug under an existing parent
- **THEN** the category is persisted with that parent and appears in subsequent lists

#### Scenario: Admin deletes a category that still has products
- **WHEN** any product still references the category
- **THEN** the delete is rejected and the category and products remain

#### Scenario: Cycle is rejected
- **WHEN** an update would make a category an ancestor of itself
- **THEN** the command fails atomically

### Requirement: Homepage display order is operator-controlled
Category `sortOrder` and homepage category-shortcut membership/order SHALL be admin-editable. Public category and homepage reads MUST honor those orders for active, non-deleted records. Reorder commands MUST keep unique per-parent and per-module sort values.

#### Scenario: Admin reorders sibling categories
- **WHEN** an admin submits a valid adjacent sort change
- **THEN** subsequent public and admin lists use the new order

#### Scenario: Duplicate sort in one homepage module
- **WHEN** two shortcuts would share the same module sort order
- **THEN** the command is rejected and existing shortcuts remain

### Requirement: Admins manage campaign banners
An admin SHALL be able to list, create, update, reorder, and delete banners belonging to the campaign-banner homepage module. Banner fields MUST include title, destination path, sort order, and optional eyebrow, description, image URL, alt text, and theme key. Destination paths MUST be same-origin relative paths. Image URLs MUST be trusted marketplace media URLs or relative media paths. Public homepage campaign modules MUST reflect enabled, in-window modules only.

#### Scenario: Admin creates a banner
- **WHEN** an admin submits valid banner copy, destination, and sort order
- **THEN** the public homepage includes that banner while its module is enabled and in window

#### Scenario: External destination is rejected
- **WHEN** destination path is an absolute external URL
- **THEN** the command fails and no banner row is written

### Requirement: Selected platform settings are homepage-module configuration
T27 platform settings SHALL be the existing homepage modules: enable flag, sort order, title/subtitle, and optional `activeFrom`/`activeUntil` UTC windows. Admins MUST NOT invent unrelated global feature flags, payment keys, or secret configuration through this surface. Public `/api/v1/homepage` MUST continue to return only enabled modules whose window contains evaluation time.

#### Scenario: Admin disables Flash Sale module
- **WHEN** an admin sets that module `isEnabled` to false
- **THEN** the public homepage omits it and other enabled modules still render

#### Scenario: Invalid window
- **WHEN** `activeUntil` is not after `activeFrom`
- **THEN** the update is rejected and the previous window remains


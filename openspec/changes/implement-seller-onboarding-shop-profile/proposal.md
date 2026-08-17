## Why

T12 can assign seller roles and expose a safe owned-shop summary, but an eligible user still cannot apply for a shop, complete the shop profile, or manage that shop in a dedicated seller workspace. T22 must establish this ownership and onboarding boundary before later seller product, inventory, order, and fulfillment features can safely attach data to a validated, sellable shop.

## What Changes

- Add an authenticated seller onboarding flow that creates at most one non-deleted shop per user under the initial ownership policy.
- Persist a unique shop slug and live shop name plus description, logo/banner URLs, contact details, pickup/return addresses, onboarding state, operational status, and administrative decision reason.
- Add basic validation and an admin approval placeholder that can approve or reject an application without introducing business verification or Shopee Mall certification.
- Define sellability as an approved, active, non-deleted shop; inactive, suspended, rejected, pending, and deleted shops cannot participate in new public sales.
- Add owner-scoped seller APIs and a role-gated `/seller` management area that never trusts browser-supplied owner identity.
- Preserve the existing T12 seller summary route and T15 public storefront contract while extending their internal status/sellability handling.
- Add framework-neutral contracts, OpenAPI documentation, PostgreSQL migration verification, unit/API/UI coverage, quick browser coverage, documentation, and an implementation flow diagram.

## Capabilities

### New Capabilities

- `seller-onboarding-shop-profile`: Seller application state, validated shop identity and logistics addresses, single-shop ownership, admin approval placeholder, operational sellability, and owner-scoped seller profile management.

### Modified Capabilities

None. The repository currently has no synchronized main specs under `openspec/specs`; this change consumes the implemented T12 role and T15 storefront boundaries without declaring nonexistent main-spec modifications.

## Impact

- **Database:** Extend `Shop` persistence with profile, contact, logistics-address, onboarding, decision, and suspended-state data while retaining the single-owner policy.
- **Backend:** Add seller onboarding/profile endpoints under `/api/v1/seller`, an approval placeholder under `/api/v1/admin`, and shared sellability filtering across catalog, storefront, cart, and checkout.
- **Shared contracts:** Add strict framework-neutral shop workspace, create/update, approval, address, status, and Problem Details contracts.
- **Frontend:** Expand the seller area with onboarding and profile-management screens and add a minimal admin approval form.
- **Security:** Reuse authentication, role guards, project-wide origin protection, persisted ownership checks, sanitized errors, and no-store private responses.
- **Testing and docs:** Add migration, concurrency, authorization, form, responsive E2E, endpoint documentation, and `flow.md` coverage. Automatic CI triggers remain disabled.

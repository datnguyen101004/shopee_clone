## Why

T22 currently treats the seller role and shop approval as two separate gates. For this project, one seller account represents one shop, so a buyer should request to open a shop and become a seller only when an administrator accepts that request.

## What Changes

- Replace seller-only shop application access with an authenticated buyer-facing shop registration request.
- **BREAKING**: Stop relying on a pre-granted `seller` role to create a first shop.
- Make admin approval atomically grant the `seller` role and activate the requested shop; rejection leaves the account as a buyer.
- Keep sellers to one non-deleted shop and let approved sellers maintain their own profile and active/inactive operating state without repeat approval.
- Update seller/admin/buyer UI, API contracts, tests, documentation, and the feature flow to match the single approval journey.

## Capabilities

### New Capabilities

- `seller-registration-approval`: Buyer registration for a single shop and the administrator decision that grants seller access and activates it.

### Modified Capabilities

- None.

## Impact

- Affects the NestJS seller-onboarding, role-assignment, auth, cart/catalog sellability, and admin approval boundaries.
- Changes `/api/v1/seller/shop` registration authorization and admin approval side effects; adds an authenticated registration entry point for buyers.
- Affects `/seller`, `/seller/shop`, `/admin`, shared contracts, Prisma role/shop persistence, Playwright/Jest/Vitest coverage, `flow.md`, and seller onboarding documentation.

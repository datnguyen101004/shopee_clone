## Why

The marketplace currently treats the seller request, seller authorization, shop ownership, and account suspension as related but independently mutable concepts. That permits partial states such as a seller without its required shop, multiple shops for one account, or a suspended shop owner who can remain signed in. The seller approval flow needs one clear outcome before user-to-user chat relies on this identity.

## What Changes

- **BREAKING** Enforce a maximum of one shop record per account, including concurrent registration attempts and previously soft-deleted shop records.
- Treat the submitted shop registration as the account's request to become a seller; the applicant remains a normal user while the request is pending or rejected.
- Require the registration form to collect the complete shop profile needed for approval and operation: shop identifier, name, description, location, contact details, pickup address, and return address; logo and banner remain optional.
- Make admin approval one atomic outcome: grant the account the `SELLER` role and make its single submitted shop approved and active, without requiring the user to create a shop in a second step.
- Define seller identity as an account with exactly one approved, non-deleted shop; the account and shop are one marketplace actor rather than switchable personal/shop identities.
- Prevent generic role administration from independently granting or removing `SELLER` in a way that creates a seller without its shop or a shop without its seller owner.
- Distinguish seller-initiated temporary shop inactivity from administrative suspension: temporary inactivity keeps the account usable, while suspension locks the owner account.
- **BREAKING** Make administrative or moderation suspension of an approved seller shop atomically suspend its owner account and revoke all active sessions.
- **BREAKING** Make direct suspension of a seller account atomically suspend its approved shop.
- Restore an approved seller account and shop as one coordinated action so they cannot return to mismatched active/suspended states.
- Add migration preflight and reconciliation rules for duplicate ownership and inconsistent seller-role/shop data before applying the uniqueness constraint.
- Update seller request, seller entry, admin confirmations, locked-account feedback, and the T31 chat identity assumptions to reflect the single approval outcome and identity model.

## Capabilities

### New Capabilities

- `single-shop-seller-identity`: Defines seller requests, atomic admin approval that grants `SELLER` and activates one shop, one-shop ownership, coordinated seller/shop suspension and restoration, session invalidation, and user/admin experience requirements.

### Modified Capabilities

- `admin-entity-administration`: Changes shop and seller-account suspension/restoration from independent entity actions into coordinated lifecycle actions.

## Impact

- Persistence: `Shop.ownerId` ownership constraint, seller-role/shop consistency checks, migration preflight, and reconciliation reporting.
- Backend: seller request submission and approval, role authorization, automatic shop activation, admin entity actions, moderation commands, authentication session revocation, ownership lookup, and public shop availability.
- Contracts and APIs: complete seller-request shop-profile validation, seller request/workspace conflict responses, atomic approval results, admin user/shop action results and errors, authentication feedback for suspended accounts, and OpenAPI descriptions under `/api/v1`.
- Frontend: complete shop-registration form, seller request/entry states, seller workspace navigation, admin approval and user/shop action confirmations, login/session-expiry feedback, and public unavailable-shop state.
- Tests: migration verification, concurrency and atomic rollback coverage, backend authorization/integration tests, frontend interaction tests, and critical Playwright seller/admin journeys.
- Chat prerequisite: after approval, each shop resolves to exactly one owner account and each seller account resolves to exactly one shop, with no chat identity selector.

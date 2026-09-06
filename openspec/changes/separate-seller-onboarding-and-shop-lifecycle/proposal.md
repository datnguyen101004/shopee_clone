## Why

The current seller approval path already grants `SELLER` and activates one shop atomically, but administrative and moderation actions still suspend or restore the owner and shop together. Owners must keep their personal account when only their shop is suspended, while a suspended owner must make their shop unavailable regardless of the shop's stored status.

## What Changes

- Preserve user registration, complete shop application, admin review, rejection/correction and atomic approval; no seller role before approval and no second shop-creation step.
- **BREAKING** Require the reviewed application version on admin approve/reject requests so concurrent profile edits cannot be silently approved; update the bundled admin client together with the contract.
- **BREAKING** Separate account status from shop operational status: shop suspension/restoration changes only the shop and never revokes owner sessions or changes owner status.
- **BREAKING** Account suspension revokes sessions and hides the owner's shop and products without overwriting shop status; account restoration does not clear an independent shop suspension or seller-selected inactivity.
- Define effective public availability using both owner and shop eligibility; apply it to public discovery, direct pages, stale search/cache results, cart and new purchase admission.
- Preserve the seller role and one-shop ownership through suspension; active owners of suspended shops retain buyer access and a restricted seller status/moderation view, without selling mutations or self-restoration.
- Update admin and seller messages to distinguish account restrictions from shop restrictions; maintain existing UI instead of applying Figma redesigns.
- Reconcile legacy coupled states conservatively, retaining sanctions unless an explicit reviewed repair resolves their provenance.

## Capabilities

### New Capabilities

- `seller-onboarding-lifecycle`: Single-owner application/approval contract and independent owner/shop lifecycle, authorization and legacy-state handling. This consolidates current behavior and supersedes coordinated lifecycle rules in earlier completed, unsynced changes.
- `owner-aware-shop-availability`: Effective public visibility and new-purchase eligibility for shops and products when either the owner or shop is unavailable.

### Modified Capabilities

- `admin-entity-administration`: Separate account/shop action effects, safe summaries and restoration feedback while retaining reason, audit and idempotency guarantees.

## Impact

- Backend: NestJS seller-onboarding, seller-identity, auth/RBAC, admin/moderation, catalog/shop-storefront, homepage/search/recommendations/campaigns and purchase eligibility consumers.
- Contracts/UI: registration/workspace, admin summaries, explicit account/shop availability reasons and guarded seller navigation; existing `/api/v1` endpoint paths remain, with additive response fields, a required review-version request field and updated OpenAPI.
- Persistence: retain PostgreSQL/Prisma `User`, unique `Shop.ownerId` and existing onboarding fields; no separate application table is required for this behavior. Add migration/repair support only if the implementation inventory demonstrates a schema need.
- Existing orders, payments in progress, returns and audit history are preserved; no automatic cancellation or refund is introduced. Existing chat identity and one-shop ownership stay intact.
- Validate with focused unit/integration tests, lint and typecheck. **Quick E2E runs only on an explicit user request for this change; do not run full E2E or snapshot updates by default.** Record unexecuted E2E as deferred, never passed.
- UI/UX reference: [Vietnamese specification](../../../docs/ui-ux/separate-seller-onboarding-and-shop-lifecycle.md). No application implementation is included in this proposal.

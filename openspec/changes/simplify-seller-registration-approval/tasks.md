## 1. Contracts and authorization model

- [x] 1.1 Add registration workspace, create/resubmit, and approval contract shapes with strict response guards while preserving seller profile compatibility.
- [x] 1.2 Define buyer registration versus seller operation authorization and update Problem Details/OpenAPI behavior without exposing another owner's profile.
- [x] 1.3 Add contract and API tests for buyer-only registration, seller-only operation, unknown fields, conflicts, and safe private responses.

## 2. Transactional registration and approval

- [x] 2.1 Change initial shop registration to create an owner-derived pending/inactive shop for an eligible buyer with one-live-shop locking and uniqueness handling.
- [x] 2.2 Allow a pending/rejected owner to update and explicitly resubmit the registration, clearing a rejection reason only when returning to pending.
- [x] 2.3 Change administrator approval to lock shop and owner rows, atomically assign the auditable seller role and activate the shop, while rejection remains buyer-only.
- [x] 2.4 Preserve seller profile/active-inactive operations after approval and enforce the unchanged public sellability boundary.
- [x] 2.5 Add guarded PostgreSQL tests for approval rollback, role/shop atomicity, concurrent registration, rejection/resubmission, one-shop uniqueness, and sellability.

## 3. Buyer, seller, and admin experience

- [x] 3.1 Update authenticated route gates and API helpers so buyers can register and inspect their own registration while seller controls remain role-gated.
- [x] 3.2 Update registration/profile UI for pending, rejected correction/resubmission, approved seller operation, retained input, and accessible feedback.
- [x] 3.3 Update the administrator approval placeholder to state the seller-role grant effect and show safe success/failure feedback.
- [x] 3.4 Add component and intercepted browser tests for guest, buyer registration, rejection/resubmission, approved seller navigation/operation, admin approval, responsive layouts, and no browser-storage leakage.

## 4. Documentation and verification

- [x] 4.1 Update seller-registration documentation, endpoint examples, role/state transition table, and `flow.md` Mermaid diagram for buyer → pending → approved seller.
- [x] 4.2 Run migration/seed verification, focused and full test suites, lint, typecheck, production build, strict OpenSpec validation, and buyer/seller/admin quick E2E; record results.

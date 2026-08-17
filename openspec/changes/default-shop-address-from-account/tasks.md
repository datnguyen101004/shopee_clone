## 1. Workspace address candidate

- [x] 1.1 Extend the seller-shop workspace contract with an optional account default-address candidate and strict parsing coverage.
- [x] 1.2 Read the owner’s active default shipping address in the seller onboarding workspace repository and map only its six fulfilment fields.
- [x] 1.3 Return the candidate from the workspace service and cover account-default, no-default, and complete-shop cases with backend tests.

## 2. Seller profile prefill

- [x] 2.1 Populate an absent or incomplete pickup/return form section from the workspace candidate without mixing address fields.
- [x] 2.2 Preserve complete saved shop addresses and retain empty-form behaviour when no account default exists.
- [x] 2.3 Add frontend tests for new registration, legacy incomplete profile, and saved shop address precedence.

## 3. Verification and documentation

- [x] 3.1 Run focused contracts, API, and web tests plus typecheck/lint for the affected workspace flow.
- [x] 3.2 Update `flow.md` with the account-address-to-shop-profile defaulting flow.

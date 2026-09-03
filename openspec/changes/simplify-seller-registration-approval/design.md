## Context

See `proposal.md` for the motivation. T22 stores an onboarding state on `Shop`, but currently requires a role to create that shop and treats shop approval separately from role assignment. The existing role service already persists auditable assignments, and sellability is already centralized on a non-deleted, approved, active shop.

## Goals / Non-Goals

**Goals:**

- Make administrator approval the sole elevation from buyer to seller for a first shop.
- Preserve the existing one-live-shop constraint and sellability predicate.
- Keep seller-only operating mutations protected after approval while allowing buyers to monitor and correct their own registration.
- Ensure shop activation and seller-role creation share one database transaction.

**Non-Goals:**

- Multiple shops per seller, delegated shop staff, seller self-registration without approval, document/KYC collection, or a pending-registration listing.
- Revoking a seller role when a historical/deleted shop is removed; no deletion workflow is introduced by this change.

## Decisions

### 1. Reuse the existing Shop aggregate as the registration record

`Shop` remains the single profile and registration record. A buyer can create one non-deleted row with `pending_approval` and `inactive`; a rejected owner can amend it and explicitly resubmit to pending. This avoids a second application table and keeps the current uniqueness and private profile fields intact.

The prior “seller role first, shop approval second” approach is rejected because it duplicates the same business decision for this one-account/one-shop product.

### 2. Split registration access from seller operation access

The registration workspace read and initial create route require an active authenticated account with the buyer role, not the seller role. A buyer-owned pending or rejected row can be read and edited only by its owner. The existing seller-only workspace summary, seller navigation, profile operation route, and active/inactive toggle stay seller-gated.

This preserves least privilege: possessing a pending profile never exposes seller operation endpoints. Reusing the seller role gate for registration was rejected because it makes the first registration impossible.

### 3. Admin approval writes the role and shop state atomically

Admin approval locks the shop row and owner row, writes the seller role assignment/audit event with an onboarding-specific source, then transitions the shop to `approved` plus `active` in one Prisma transaction. Any failure rolls back both writes. Rejection only writes `rejected`, `inactive`, and the retained reason; it never grants or removes roles.

An asynchronous role grant was rejected because it could create an approved active shop that the owner cannot operate, or seller access without an approved shop.

### 4. Preserve one shop and current public availability

The partial unique live-owner index stays authoritative. Creation and resubmission keep global slug reservation and live case-insensitive name rules. Catalog, storefront, cart, pricing, and checkout continue using the unchanged approved-active sellability predicate, so a pending/rejected buyer registration cannot become public accidentally.

## Risks / Trade-offs

- [Existing manually granted seller accounts] → Keep backward-compatible seller profile reads and seed data; migration does not revoke an existing role or shop.
- [Role/shop partial write] → Use one transaction plus guarded PostgreSQL rollback tests.
- [Rejected buyer can repeatedly resubmit] → Preserve a clear pending/rejected state and no seller access until a new admin decision.
- [Buyer route mistakenly calls seller operation APIs] → Use separate typed registration helpers and browser tests asserting endpoint and role boundaries.

## Migration Plan

1. Add/adjust contracts and routes while retaining safe compatibility for existing seller profile reads.
2. Update authorization, transactional approval, role audit source, and registration resubmission behavior; add a forward migration only if an auditable source enum requires it.
3. Update frontend routes, documentation, flow, and focused tests.
4. Validate migration deployment, deterministic seed, role/shop rollback, full tests, and responsive registration/approval E2E.
5. Roll back by disabling the new registration entry point and retaining existing seller roles/shops; use a forward corrective migration for any persisted enum addition.

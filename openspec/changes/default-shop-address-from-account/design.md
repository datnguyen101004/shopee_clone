## Context

Seller shop profiles and account shipping addresses are persisted separately. Existing shop records created before fulfilment-address fields can therefore have incomplete values, even when the owner already maintains a default account address. See `proposal.md` and the capability spec for required behaviour.

## Goals / Non-Goals

**Goals:**

- Supply one safe address candidate with the seller shop workspace.
- Prefill only blank or incomplete shop address sections.
- Preserve the existing create/update mutation contract and shop-address ownership.

**Non-Goals:**

- Synchronizing later account-address edits into saved shops.
- Creating or changing account addresses from the seller screen.
- Persisting the candidate automatically before the seller submits the profile.

## Decisions

### Return an address-shaped candidate in the seller workspace

The workspace will expose a `defaultAddress` candidate using the existing six-field shop-address shape rather than the full account-address resource. The frontend needs no account address identifier, label, or default flag to prefill the form. This avoids a second browser request and prevents exposing unrelated account-address metadata.

Alternative: have the frontend call the account address-list API. Rejected because it duplicates authenticated loading, creates a race between requests, and lets the screen pick from a list when the business rule is specifically the default address.

### Read the default address without importing the account service

The seller onboarding repository will read the owner's active `isDefault` shipping-address row as part of workspace assembly. The account service remains the sole writer and enforcer of the account-address default invariant.

Alternative: inject the account service into seller onboarding. Rejected because the seller workspace only needs a small read projection and the additional module dependency would not add domain behaviour.

### Treat completeness as the fallback boundary

The frontend uses a complete saved shop address as authoritative. If any of its six fields is absent, it uses the candidate for that whole form section rather than mixing values from two addresses. The result is predictable and avoids creating hybrid physical addresses.

## Risks / Trade-offs

- [The account default can change after workspace load] → The candidate is only an initial form value; saving remains explicit and server-validated.
- [Legacy shop has a partial address] → Replace the entire incomplete section with one coherent account default, or leave it empty if no default exists.
- [No account default exists] → Preserve current empty-form behaviour and validation messaging.

## Migration Plan

1. Deploy the additive workspace-contract response and client support together.
2. No database migration or backfill is required because data is read only until an owner submits the form.
3. Rollback by ignoring the additive candidate field; saved shop addresses are unaffected.

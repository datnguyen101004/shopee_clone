## Why

Account addresses already capture the buyer's delivery information, but a seller must currently enter the same details again when completing an otherwise empty shop profile. Reusing the account default reduces duplicate input while preserving the shop's independent fulfilment address once it has been saved.

## What Changes

- Read the authenticated account's default shipping address when loading the seller shop workspace.
- Use that address as the initial pickup and return address only when the corresponding shop address is incomplete or absent.
- Keep a complete address already saved on the shop authoritative; later account-address changes must not overwrite it.
- Keep the existing seller-shop create and update API payloads unchanged.

## Capabilities

### New Capabilities

- `seller-shop-address-defaults`: Default an incomplete seller shop fulfilment address from the owner's account default address.

### Modified Capabilities

- None.

## Impact

- Affects the seller shop workspace service/repository, shared workspace contract, and seller profile screen.
- Reuses existing account shipping-address persistence; no migration or new external dependency is required.

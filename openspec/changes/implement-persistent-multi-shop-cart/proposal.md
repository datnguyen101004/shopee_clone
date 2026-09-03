## Why

T10 and T11 let buyers choose a purchasable variant and authenticate safely, but `/cart` is still a placeholder and purchase intents do not create durable commerce state. T16 establishes the first server-authoritative Commerce MVP boundary while adopting a simpler identity rule: a buyer must sign in before any cart state is created, read, or changed.

## What Changes

- Add one PostgreSQL-backed multi-shop cart per authenticated user.
- Require a valid access session for every `/api/v1/cart/**` endpoint; anonymous callers that pass the shared browser-security boundary receive sanitized `401` Problem Details and no cart state is created.
- Add versioned cart APIs to read the current cart, add or merge a variant line, change quantity, remove a line, and change line/shop/all selection.
- Revalidate product, variant, shop, price, purchase limit, and stock on every mutation; preserve unavailable or changed lines with explicit issues while calculating totals only from selected valid lines.
- Replace the cart placeholder with a responsive multi-shop management screen, live header count, authenticated product-detail add-to-cart behavior, accessible reconciliation states, and a checkout handoff that remains non-committal until T17.
- Send anonymous add-to-cart and cart-management attempts through the existing login handoff, then return the buyer to the original safe storefront route. Do not create a guest credential, guest cookie, guest cart, or merge flow.
- Promote browser mutation protection to an application-wide default: exact trusted-origin enforcement for unsafe browser methods, centralized cookie flags, strict content types, and explicit narrow exceptions for OAuth callbacks and future signed webhooks.
- Establish the forward identity policy: public discovery remains anonymous, while user-scoped persistence and private marketplace actions require authentication unless a later OpenSpec change explicitly defines another security model.
- Keep project-wide rate limiting outside T16; existing auth-local throttling remains unchanged until a dedicated later change.
- Keep inventory reservation, shipping quotes, vouchers, checkout pricing, orders, and payment outside T16.

## Capabilities

### New Capabilities

- `shopping-cart`: Authenticated, server-backed multi-shop carts with authoritative mutation validation, selection/totals, frontend cart experience, header count, and product-detail entry points.
- `browser-mutation-security`: Project-wide trusted-origin, cookie, content-type, and exception-metadata requirements for browser mutations without breaking OAuth or future signed server callbacks.

### Modified Capabilities

None. The repository currently has no archived main capability specs; T16 introduces the two behavior contracts above while retaining compatibility with completed product-detail, authentication, engagement, account, and shop flows.

## Impact

- **Contracts:** New framework-neutral authenticated cart request/response, issue, selection, totals, limits, and Problem Details parsers.
- **Backend:** New NestJS cart module protected by the normal auth guard; shared browser-mutation security module; OpenAPI and sanitized error coverage.
- **Persistence:** Additive Prisma migration for carts, cart lines, optimistic versioning, ownership constraints, indexes, and deterministic verification fixtures. Previously created guest-compatible columns remain dormant for migration compatibility and are never resolved by application code.
- **Frontend:** Product-detail login handoff/add action, `/cart`, storefront header count/provider, responsive multi-shop UI, and no browser storage of cart contents.
- **Operations:** Security configuration, documentation, and guarded PostgreSQL/browser regression gates; no guest credential secret or guest cleanup job is required.
- **Compatibility:** Existing public reads remain unaffected; unsafe browser mutations become default-deny for untrusted origins, and every cart route becomes authenticated-only.

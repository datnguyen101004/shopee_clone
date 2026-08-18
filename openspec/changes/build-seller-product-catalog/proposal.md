    ## Why

    Sellers can now create an approved shop but cannot independently add or maintain the products they sell. Providing a governed product-management workspace is the next dependency for a usable seller journey and for keeping buyer-facing catalogue data trustworthy.

    ## What Changes

    - Add authenticated seller APIs and a Seller Center UI to create, view, edit, publish, hide, and archive products owned by the seller's approved shop.
    - Add category selection and category-attribute validation for seller listings, with only active catalogue categories eligible for new or edited products.
    - Add listing media metadata, deterministic variant-combination generation, per-variant SKU/pricing/stock/weight/dimension inputs, and validation before publication.
    - Make product lifecycle server-authoritative: only complete published products are buyer-purchasable; hidden, draft, suspended, deleted, and inactive variants remain unavailable.
    - Preserve existing buyer catalogue and product-detail contracts while exposing seller-specific product management contracts and endpoints.

    ## Capabilities

    ### New Capabilities

    - `seller-product-management`: Seller-owned product drafting, media, category attributes, variants, lifecycle transitions, and Seller Center management screens.
    - `seller-product-publication`: Server-authoritative publication eligibility and purchaser visibility for seller-managed listings.

    ### Modified Capabilities

    - None.

    ## Impact

    - Prisma schema and migration for product attributes, ordered media metadata, variant option combinations, stock, and package dimensions.
    - New NestJS seller-product module, DTOs, ownership guard/repository/service, Problem Details errors, and `/api/v1/seller/products` endpoints.
    - Shared contracts, Seller Center product-listing/editor screens, API client, navigation, and frontend/backend/E2E coverage.
    - Existing cart, catalogue, homepage, product detail, pricing, and checkout availability queries will be aligned to the publication/purchasability invariant.

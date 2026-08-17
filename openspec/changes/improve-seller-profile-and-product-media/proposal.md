## Why

Returning sellers currently land directly in a large editable shop form even after their profile is complete, while product images must be pasted as remote URLs. A read-first profile and local multi-file image workflow will make Seller Center feel closer to a real marketplace and reduce authoring errors.

## What Changes

- Show an existing shop as a structured read-only profile by default, with a single **Cập nhật hồ sơ** action that opens the existing editor and a cancel action that returns to the profile view.
- Replace seller product image URL entry with a local multi-file picker, image previews, removal, ordering, upload progress, and server-side validation/storage.
- Add one optional image assignment for each value in the first classification group, so a Color value such as `Đỏ` shares its image across generated variants such as `Đỏ · M` and `Đỏ · L`.
- Preserve existing imported or externally hosted product images while new seller uploads use authenticated staged assets that are attached atomically when a draft is saved.

## Capabilities

### New Capabilities

- `seller-shop-profile-view-mode`: Read-first existing shop profile with explicit edit/cancel/save transitions.
- `seller-product-file-media`: Secure local multi-image upload, preview, attachment, ordering, and classification-value image mapping for seller products.

### Modified Capabilities

- None.

## Impact

- Seller shop management component, profile presentation styles, and frontend tests.
- Seller product contracts/editor/API client, multipart security guard, NestJS upload endpoints, media storage, Prisma schema/migration, cleanup tooling, and public product image serving.
- Product detail/catalog projections continue using image URLs but will receive API-backed URLs for uploaded assets.

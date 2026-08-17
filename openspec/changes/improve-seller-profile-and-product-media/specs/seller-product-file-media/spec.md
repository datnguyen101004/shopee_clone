## Purpose

Cho phép người bán chọn nhiều ảnh sản phẩm trực tiếp từ máy, tải lên an toàn và gán ảnh theo giá trị phân loại để quản lý catalog trực quan như một sàn thương mại điện tử thực tế.

## ADDED Requirements

### Requirement: Seller can select and preview multiple local product images
The seller product editor SHALL accept multiple local image files in one selection and show a preview for every accepted file before the product is saved.

#### Scenario: Seller selects multiple valid files
- **WHEN** the seller selects multiple JPEG, PNG, or WebP files within the configured per-file size and product-image count limits
- **THEN** the editor displays each selected image with its upload state and preserves the rest of the product form

#### Scenario: Seller selects an unsupported or oversized file
- **WHEN** a selected file has an unsupported decoded image format, exceeds 5 MB, or would exceed the maximum of 9 unique product images
- **THEN** the system rejects that file with a specific message while retaining other valid selections and all entered product data

#### Scenario: Seller removes a selected image
- **WHEN** the seller removes a staged image before saving the product
- **THEN** the image disappears from the product draft and any classification assignment referencing it is cleared

#### Scenario: Seller changes gallery order
- **WHEN** the seller moves a selected image to another gallery position
- **THEN** the editor preserves the new order and the saved product exposes images in that order

### Requirement: Seller product media upload is authenticated and validated
The system SHALL accept seller product media only from an authenticated account that owns an active seller shop and SHALL validate the actual uploaded image content independently of the client-provided filename.

#### Scenario: Eligible seller uploads a valid image
- **WHEN** an authenticated eligible seller uploads a valid JPEG, PNG, or WebP image no larger than 5 MB and within the supported dimension limits
- **THEN** the system creates a seller-owned staged media asset and returns its identifier, preview URL, dimensions, MIME type, and byte size

#### Scenario: Anonymous or ineligible account uploads media
- **WHEN** an unauthenticated account or an account without an eligible seller shop attempts to upload product media
- **THEN** the system rejects the request without persisting an accessible media asset

#### Scenario: File signature does not match a supported image
- **WHEN** uploaded bytes cannot be decoded as an allowed image even if the filename or declared MIME type appears valid
- **THEN** the system rejects the upload and does not expose the bytes publicly

### Requirement: Uploaded media uses staged ownership and atomic attachment
The system SHALL keep newly uploaded seller product media private and seller-owned until a product save atomically attaches it to a product owned by the same shop.

#### Scenario: Seller saves a draft with owned staged media
- **WHEN** the seller saves a product using non-expired staged media owned by that seller
- **THEN** the product changes and all referenced media attachments commit together, and the resulting product response contains usable ordered image URLs

#### Scenario: Product save fails
- **WHEN** product validation or persistence fails after media has been staged
- **THEN** no partial product-media attachment is committed and the staged media remains available for the seller to retry until it expires

#### Scenario: Seller references foreign or expired media
- **WHEN** a product save references media owned by another seller or media that has expired
- **THEN** the system rejects the save without revealing the other seller's media details or partially changing the product

#### Scenario: Staged media expires unused
- **WHEN** a staged media asset has not been attached within its configured lifetime
- **THEN** cleanup removes its stored bytes and metadata without affecting attached product images

### Requirement: Attached product media is safely readable
The system SHALL expose uploaded product image bytes through stable application URLs only after attachment and SHALL prevent filesystem paths, original local filenames, and traversal attempts from becoming public storage identifiers.

#### Scenario: Buyer requests an attached image
- **WHEN** a buyer-facing catalog or product detail response references an attached uploaded image
- **THEN** the URL returns the validated image with an appropriate content type and cache behavior

#### Scenario: Client requests staged or unknown media
- **WHEN** a client requests media that is staged, expired, deleted, or unknown
- **THEN** the system returns a non-success response without exposing storage layout details

### Requirement: First classification values can have product images
The seller product editor SHALL allow each value in the first classification group to reference at most one selected product image, and the assignment SHALL be optional.

#### Scenario: Color image applies to generated combinations
- **WHEN** the first group contains `Đỏ` and `Xanh`, the second group contains `M` and `L`, and the seller assigns an image to `Đỏ`
- **THEN** the generated `Đỏ · M` and `Đỏ · L` variants both resolve to the `Đỏ` image while the `Xanh` variants remain independent

#### Scenario: Seller maps an existing selected image
- **WHEN** the seller chooses an image for a first-group value from the current product media selection
- **THEN** the editor reuses the same media asset without creating a duplicate upload or consuming another unique-image slot

#### Scenario: Seller changes or removes a classification value
- **WHEN** the seller renames or removes a first-group value that has an image assignment
- **THEN** the system preserves the assignment for an unambiguous rename or clears it for a removed value and regenerates the affected combinations consistently

#### Scenario: Product has no classification images
- **WHEN** the seller leaves all classification image assignments empty
- **THEN** the product can still be saved if all other product and variant requirements are satisfied

### Requirement: Existing product image URLs remain compatible
The system SHALL continue to render already persisted imported or externally hosted HTTPS product images while using managed media assets for newly uploaded seller files.

#### Scenario: Seller edits a legacy product
- **WHEN** an existing seller product contains external image URLs
- **THEN** the editor displays those images alongside newly selected local files and does not require re-uploading unchanged legacy images

#### Scenario: Seller publishes a product gallery
- **WHEN** the seller saves a publishable product
- **THEN** the resulting gallery contains at least one valid retained legacy image or attached managed image and no unresolved local-only preview URL


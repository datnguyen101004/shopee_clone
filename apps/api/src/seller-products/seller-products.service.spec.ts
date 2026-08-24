import { SellerProductsService, generatedProductSlug, generatedVariantSku } from './seller-products.service';
import { SellerProductInputError, SellerProductMediaError } from './seller-products.errors';

const userId = '00000000-0000-4000-8000-000000000001';
const shopId = '00000000-0000-4000-8000-000000000002';

describe('SellerProductsService authoring rules', () => {
  it('generates name-based slugs and deterministic variant SKUs without seller input', () => {
    const slug = generatedProductSlug('Áo thun nam');
    expect(slug).toMatch(/^ao-thun-nam-[a-f0-9]{10}$/);
    expect(generatedVariantSku(slug, ['Đỏ', 'M'])).toMatch(/^SKU-[A-F0-9]{12}$/);
    expect(generatedVariantSku(slug, ['Đỏ', 'M'])).toBe(generatedVariantSku(slug, ['Đỏ', 'M']));
    expect(generatedVariantSku(slug, ['Đỏ', 'M'])).not.toBe(generatedVariantSku(slug, ['Xanh', 'M']));
  });

  it('filters excluded categories from seller discovery and direct validation', async () => {
    const prisma = {
      category: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'mobile-id', name: 'Mobile & Accessories', slug: 'mobile-accessories', parentId: null, children: [], attributeDefinitions: [] },
          { id: 'kitchen-id', name: 'Kitchen Appliances', slug: 'kitchen-appliances', parentId: null, children: [], attributeDefinitions: [] },
          { id: 'device-id', name: 'Thiết bị điện tử', slug: 'thiet-bi-dien-tu', parentId: null, children: [], attributeDefinitions: [] },
        ]),
        findFirst: jest.fn().mockResolvedValue({ slug: 'mobile-accessories', attributeDefinitions: [] }),
      },
    };
    const service = new SellerProductsService(prisma as never);
    await expect(service.categories()).resolves.toHaveLength(1);
    await expect((service as never as { validateCategoryInput: (client: unknown, input: unknown) => Promise<void> }).validateCategoryInput(prisma, { categoryId: 'mobile-id', attributes: [] })).rejects.toBeInstanceOf(SellerProductInputError);
  });

  it('cleans only expired staged seller media', async () => {
    const prisma = { sellerProductMediaAsset: { findMany: jest.fn().mockResolvedValue([{ id: 'expired', storageKey: 'expired.jpg' }]), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const remove = jest.fn().mockResolvedValue(undefined);
    const service = new SellerProductsService(prisma as never);
    await expect(service.cleanupExpiredMedia({ remove })).resolves.toBe(1);
    expect(remove).toHaveBeenCalledWith('expired.jpg');
    expect(prisma.sellerProductMediaAsset.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ state: 'STAGED' }) }));
  });

  it('creates a pending upload intent before signing and returns only ephemeral transport data', async () => {
    const pending = { id: 'media-id', storageKey: 'seller-product-media/media-id.png' };
    const prisma = {
      shop: { findFirst: jest.fn().mockResolvedValue({ id: shopId }) },
      sellerProductMediaAsset: {
        create: jest.fn().mockResolvedValue(pending),
        update: jest.fn().mockResolvedValue({ id: pending.id }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const storage = { createUploadUrl: jest.fn().mockResolvedValue({ url: 'https://s3.example.test/signed', expiresAt: new Date('2026-08-24T10:05:00.000Z') }) };
    const service = new SellerProductsService(prisma as never, undefined, storage as never);
    await expect(service.createMediaUploadIntent(userId, { mimeType: 'image/png', byteSize: 24, checksumSha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' })).resolves.toEqual({
      mediaId: 'media-id',
      upload: { url: 'https://s3.example.test/signed', method: 'PUT', headers: { 'Content-Type': 'image/png', 'x-amz-checksum-sha256': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }, expiresAt: '2026-08-24T10:05:00.000Z' },
    });
    expect(prisma.sellerProductMediaAsset.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'PENDING_UPLOAD', uploaderId: userId, shopId, checksumSha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }) }));
  });

  it('reuses existing product images when the seller did not change media', () => {
    const service = new SellerProductsService({} as never);
    const current = [
      { id: 'image-1', altText: null, sortOrder: 0, url: 'https://cdn.videod.me/seller-product-media/a.png' },
      { id: 'image-2', altText: 'Cover', sortOrder: 1, url: 'https://cdn.videod.me/seller-product-media/b.png' },
    ];
    const unchanged = [
      { imageId: 'image-1', altText: null, sortOrder: 0 },
      { imageId: 'image-2', altText: 'Cover', sortOrder: 1 },
    ];
    expect(
      (service as never as { existingMediaUnchanged: (current: unknown, media: unknown) => boolean }).existingMediaUnchanged(current, unchanged),
    ).toBe(true);
    expect(
      (service as never as { existingMediaUnchanged: (current: unknown, media: unknown) => boolean }).existingMediaUnchanged(current, [
        { imageId: 'image-1', altText: null, sortOrder: 0 },
        { assetId: 'asset-2', altText: 'Cover', sortOrder: 1 },
      ]),
    ).toBe(false);
  });

  it('maps one first-group image to every generated combination', async () => {
    const prisma = { productOptionGroup: { findMany: jest.fn().mockResolvedValue([{ sortOrder: 0, values: [{ id: 'value-red', value: 'Red' }] }, { sortOrder: 1, values: [{ id: 'value-m', value: 'M' }] }]) }, productOptionValue: { update: jest.fn().mockResolvedValue(undefined) } };
    const service = new SellerProductsService(prisma as never);
    await (service as never as { applyOptionValueMedia: (client: unknown, productId: string, input: unknown, imageIds: Map<string, string>) => Promise<void> }).applyOptionValueMedia(prisma, 'product', { optionValueMedia: [{ groupIndex: 0, value: 'Red', mediaRef: { assetId: 'asset-red' } }] }, new Map([['asset:asset-red', 'image-red']]));
    expect(prisma.productOptionValue.update).toHaveBeenCalledWith({ where: { id: 'value-red' }, data: { imageId: 'image-red' } });
    await expect((service as never as { applyOptionValueMedia: (client: unknown, productId: string, input: unknown, imageIds: Map<string, string>) => Promise<void> }).applyOptionValueMedia(prisma, 'product', { optionValueMedia: [{ groupIndex: 1, value: 'M', mediaRef: null }] }, new Map())).rejects.toBeInstanceOf(SellerProductMediaError);
  });

  it('audits initial stock and routes an edited stock target through the versioned inventory command', async () => {
    const initialAudit = jest.fn().mockResolvedValue(undefined);
    const client = {
      productOptionGroup: { findMany: jest.fn().mockResolvedValue([{ values: [{ id: 'value-red', value: 'Red' }] }]) },
      productVariant: { create: jest.fn().mockResolvedValue({ id: 'variant-new' }), update: jest.fn() },
      inventoryAdjustment: { create: initialAudit },
      inventory: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ quantityOnHand: 5, quantityReserved: 0, quantitySold: 0, version: 0 }) },
    };
    const inventory = { adjustInTransaction: jest.fn() };
    const service = new SellerProductsService({} as never, inventory as never);
    const input = { name: 'Product', description: '', categoryId: 'category', attributes: [], media: [], packageLengthMm: 1, packageWidthMm: 1, packageHeightMm: 1, optionGroups: [{ name: 'Màu', values: ['Red'] }], optionValueMedia: [], variants: [{ combination: ['Red'], priceMinor: 100, compareAtPriceMinor: null, stock: 5, weightGrams: 100, maxPurchaseQuantity: null, active: true }] };
    await (service as never as { replaceVariants: (client: unknown, productId: string, slug: string, shopId: string, input: unknown, protectedVariants?: unknown[], actorUserId?: string) => Promise<void> }).replaceVariants(client, 'product', 'product-slug', shopId, input, [], userId);
    expect(initialAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reason: 'INITIAL_STOCK', delta: 5 }) }));

    client.inventory.findUnique.mockResolvedValue({ variantId: 'variant-existing', quantityOnHand: 5, quantityReserved: 1, quantitySold: 0, version: 3 });
    await (service as never as { replaceVariants: (client: unknown, productId: string, slug: string, shopId: string, input: unknown, protectedVariants?: unknown[], actorUserId?: string) => Promise<void> }).replaceVariants(client, 'product', 'product-slug', shopId, { ...input, variants: [{ ...input.variants[0], stock: 7 }] }, [{ id: 'variant-existing', sku: 'SKU', combinationKey: 'Red' }], userId);
    expect(inventory.adjustInTransaction).toHaveBeenCalledWith(expect.anything(), userId, 'variant-existing', 3, expect.any(String), expect.any(String), expect.objectContaining({ delta: 2, reason: 'PRODUCT_EDIT' }));
  });
});

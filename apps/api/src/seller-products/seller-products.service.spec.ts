import { SellerProductsService, generatedProductSlug, generatedVariantSku } from './seller-products.service';
import { SellerProductInputError, SellerProductMediaError } from './seller-products.errors';

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

  it('maps one first-group image to every generated combination', async () => {
    const prisma = { productOptionGroup: { findMany: jest.fn().mockResolvedValue([{ sortOrder: 0, values: [{ id: 'value-red', value: 'Red' }] }, { sortOrder: 1, values: [{ id: 'value-m', value: 'M' }] }]) }, productOptionValue: { update: jest.fn().mockResolvedValue(undefined) } };
    const service = new SellerProductsService(prisma as never);
    await (service as never as { applyOptionValueMedia: (client: unknown, productId: string, input: unknown, imageIds: Map<string, string>) => Promise<void> }).applyOptionValueMedia(prisma, 'product', { optionValueMedia: [{ groupIndex: 0, value: 'Red', mediaRef: { assetId: 'asset-red' } }] }, new Map([['asset:asset-red', 'image-red']]));
    expect(prisma.productOptionValue.update).toHaveBeenCalledWith({ where: { id: 'value-red' }, data: { imageId: 'image-red' } });
    await expect((service as never as { applyOptionValueMedia: (client: unknown, productId: string, input: unknown, imageIds: Map<string, string>) => Promise<void> }).applyOptionValueMedia(prisma, 'product', { optionValueMedia: [{ groupIndex: 1, value: 'M', mediaRef: null }] }, new Map())).rejects.toBeInstanceOf(SellerProductMediaError);
  });
});

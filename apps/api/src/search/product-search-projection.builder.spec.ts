import type { ProductSearchProjectionRecord } from './product-search-projection.repository';
import {
  buildProductSearchProjection,
  ProductSearchProjectionBuilder,
} from './product-search-projection.builder';

function product(overrides: Record<string, unknown> = {}): ProductSearchProjectionRecord {
  return {
    id: 'product-1',
    shopId: 'shop-1',
    categoryId: 'category-child',
    slug: 'tai-nghe',
    name: 'Tai nghe Bluetooth',
    description: 'Tai nghe không dây chính hãng',
    status: 'ACTIVE',
    moderationStatus: 'ACTIVE',
    packageLengthMm: null,
    packageWidthMm: null,
    packageHeightMm: null,
    ratingAverageBasisPoints: 475,
    ratingCount: 12,
    soldCount: 31,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    deletedAt: null,
    purgeBlockedAt: null,
    purgeBlockReason: null,
    shop: {
      id: 'shop-1',
      ownerId: 'owner-1',
      slug: 'tech-shop',
      name: 'Cửa hàng Điện tử',
      description: '',
      logoUrl: null,
      bannerUrl: null,
      location: 'Hà Nội',
      timeZone: 'Asia/Ho_Chi_Minh',
      contactPhone: null,
      contactEmail: null,
      pickupRecipientName: null,
      pickupPhoneNumber: null,
      pickupProvince: null,
      pickupDistrict: null,
      pickupWard: null,
      pickupAddressLine: null,
      returnRecipientName: null,
      returnPhoneNumber: null,
      returnProvince: null,
      returnDistrict: null,
      returnWard: null,
      returnAddressLine: null,
      status: 'ACTIVE',
      onboardingStatus: 'APPROVED',
      onboardingReason: null,
      ratingAverageBasisPoints: 0,
      ratingCount: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      deletedAt: null,
    },
    category: {
      id: 'category-child',
      parentId: 'category-root',
      slug: 'dien-thoai-phu-kien',
      name: 'Điện thoại & phụ kiện',
      sortOrder: 1,
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      deletedAt: null,
      parent: {
        id: 'category-root',
        slug: 'dien-tu',
        name: 'Điện tử',
        parent: null,
      },
    },
    images: [
      {
        id: 'image-1',
        productId: 'product-1',
        variantId: null,
        url: 'https://cdn.test/1.jpg',
        altText: 'Tai nghe',
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    variants: [
      {
        id: 'variant-expensive',
        productId: 'product-1',
        shopId: null,
        sku: 'SKU-EXPENSIVE',
        combinationKey: '',
        name: 'Đen',
        priceMinor: 200_000n,
        compareAtPriceMinor: null,
        weightGrams: 500,
        maxPurchaseQuantity: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        inventory: {
          variantId: 'variant-expensive',
          quantityOnHand: 10,
          quantityReserved: 0,
          quantitySold: 0,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      {
        id: 'variant-cheap',
        productId: 'product-1',
        shopId: null,
        sku: 'SKU-CHEAP',
        combinationKey: '',
        name: 'Trắng',
        priceMinor: 100_000n,
        compareAtPriceMinor: 150_000n,
        weightGrams: 500,
        maxPurchaseQuantity: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        inventory: {
          variantId: 'variant-cheap',
          quantityOnHand: 3,
          quantityReserved: 1,
          quantitySold: 0,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ],
    attributes: [
      {
        productId: 'product-1',
        definitionId: 'brand',
        value: 'Nova',
        definition: {
          id: 'brand',
          categoryId: 'category-child',
          code: 'brand',
          label: 'Thương hiệu',
          isRequired: false,
          allowedValues: null,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ],
    ...overrides,
  } as unknown as ProductSearchProjectionRecord;
}

describe('product search projection builder', () => {
  it('projects canonical sellability, effective price, normalized text, and category path', () => {
    const result = buildProductSearchProjection(
      product(),
      new Date('2026-01-03T00:00:00.000Z'),
      new Map(),
    );
    expect(result).toMatchObject({ kind: 'index' });
    if (result.kind !== 'index') throw new Error('Expected an index projection.');
    expect(result.document).toMatchObject({
      product_id: 'product-1',
      name_normalized: 'tai nghe bluetooth',
      category_name_normalized: 'dien thoai phu kien',
      shop_name_normalized: 'cua hang dien tu',
      category_path_ids: ['category-root', 'category-child'],
      effective_price_minor: 100_000,
      compare_at_price_minor: 150_000,
      promotion_active: true,
      inventory_available: 2,
      attribute_codes: ['brand'],
      displayable: true,
    });
  });

  it.each([
    ['product-not-sellable', { status: 'DRAFT' }],
    ['shop-not-sellable', { shop: { ...product().shop, status: 'INACTIVE' } }],
    ['category-not-sellable', { category: { ...product().category, isActive: false } }],
    [
      'no-available-variant',
      {
        variants: product().variants.map((variant) => ({
          ...variant,
          inventory: { ...variant.inventory, quantityOnHand: 0 },
        })),
      },
    ],
  ])('emits a delete decision for %s', (reason, overrides) => {
    const result = buildProductSearchProjection(product(overrides), new Date(), new Map());
    expect(result).toEqual({ kind: 'delete', decision: { product_id: 'product-1', reason } });
  });

  it('resolves scheduled discounts once for a batch', async () => {
    const resolveVariants = jest.fn().mockResolvedValue(new Map());
    const builder = new ProductSearchProjectionBuilder({ resolveVariants } as never);
    await builder.buildMany([product(), product({ id: 'product-2' })], new Date());
    expect(resolveVariants).toHaveBeenCalledTimes(1);
    expect(resolveVariants.mock.calls[0]?.[1]).toHaveLength(4);
  });
});

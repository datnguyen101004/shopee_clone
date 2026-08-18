import type { CatalogRepository } from './catalog.repository';
import { CatalogProductDeletedError, CatalogProductNotFoundError } from './catalog-product-id';
import { CatalogProductDetailService } from './catalog-product-detail.service';

const productId = '00000000-0000-4000-8000-000000000301';
const variantId = '00000000-0000-4000-8000-000000000401';
type DetailCandidate = NonNullable<Awaited<ReturnType<CatalogRepository['findPublicProduct']>>>;

function candidate(overrides: Record<string, unknown> = {}): DetailCandidate {
  return {
    id: productId,
    shopId: '00000000-0000-4000-8000-000000000101',
    categoryId: '00000000-0000-4000-8000-000000000202',
    name: 'Phone',
    description: 'Detail',
    ratingAverageBasisPoints: 490,
    ratingCount: 12,
    soldCount: 20,
    shop: {
      id: '00000000-0000-4000-8000-000000000101',
      slug: 'tech-store',
      name: 'Tech Store',
      location: 'Hà Nội',
    },
    category: { slug: 'phones', name: 'Phones' },
    images: [
      {
        id: '00000000-0000-4000-8000-000000000501',
        url: '/phone.jpg',
        altText: null,
        sortOrder: 0,
        variantId: null,
      },
      {
        id: '00000000-0000-4000-8000-000000000502',
        url: '/phone-black.jpg',
        altText: 'Black phone',
        sortOrder: 10,
        variantId,
      },
    ],
    variants: [
      {
        id: variantId,
        name: 'Black',
        sku: 'PHONE-BLK',
        priceMinor: 1000n,
        compareAtPriceMinor: 1200n,
        inventory: { quantityOnHand: 3, quantityReserved: 1 },
      },
      {
        id: '00000000-0000-4000-8000-000000000402',
        name: 'Silver',
        sku: 'PHONE-SLV',
        priceMinor: 1100n,
        compareAtPriceMinor: null,
        inventory: { quantityOnHand: 1, quantityReserved: 1 },
      },
    ],
    createdAt: new Date('2026-08-12T12:00:00.000Z'),
    ...overrides,
  } as DetailCandidate;
}

describe('CatalogProductDetailService', () => {
  const repository = {
    findPublicProduct: jest.fn(),
    findDeletedProduct: jest.fn(),
    countPublicProductsForShop: jest.fn(),
    findRelatedCandidates: jest.fn(),
  };
  const service = new CatalogProductDetailService(repository as unknown as CatalogRepository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findPublicProduct.mockResolvedValue(candidate());
    repository.findDeletedProduct.mockResolvedValue(null);
    repository.countPublicProductsForShop.mockResolvedValue(4);
    repository.findRelatedCandidates.mockResolvedValue([]);
  });

  it('maps ordered media, honest stock, deterministic initial offer, shop context and related limits', async () => {
    repository.findRelatedCandidates.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) =>
        candidate({ id: `00000000-0000-4000-8000-${String(800 + index).padStart(12, '0')}` }),
      ),
    );
    const response = await service.getProduct(productId);
    expect(response).toMatchObject({
      purchasable: true,
      initialVariantId: variantId,
      shop: { activeProductCount: 4 },
    });
    expect(response.gallery).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ isPrimary: true }),
        expect.objectContaining({ variantId }),
      ]),
    );
    expect(response.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: variantId,
          availableQuantity: 2,
          preferredImageId: '00000000-0000-4000-8000-000000000502',
          discountPercent: 16,
        }),
        expect.objectContaining({ availability: 'unavailable', availableQuantity: 0 }),
      ]),
    );
    expect(response.relatedProducts).toHaveLength(6);
    expect(response.relatedProducts.every((item) => item.id !== productId)).toBe(true);
  });

  it('keeps a public all-zero-stock product readable and rejects missing eligibility', async () => {
    repository.findPublicProduct.mockResolvedValueOnce(
      candidate({
        variants: [
          { ...candidate().variants[0], inventory: { quantityOnHand: 1, quantityReserved: 1 } },
        ],
      }),
    );
    await expect(service.getProduct(productId)).resolves.toMatchObject({
      purchasable: false,
      initialVariantId: variantId,
    });
    repository.findPublicProduct.mockResolvedValueOnce(null);
    await expect(service.getProduct(productId)).rejects.toBeInstanceOf(CatalogProductNotFoundError);
    repository.findPublicProduct.mockResolvedValueOnce(null);
    repository.findDeletedProduct.mockResolvedValueOnce({ id: productId });
    await expect(service.getProduct(productId)).rejects.toBeInstanceOf(CatalogProductDeletedError);
  });
});

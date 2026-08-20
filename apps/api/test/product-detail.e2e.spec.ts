import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { CatalogProductDetailService } from '../src/catalog/catalog-product-detail.service';
import { CatalogProductNotFoundError } from '../src/catalog/catalog-product-id';
import { CatalogRepository } from '../src/catalog/catalog.repository';
import { PrismaService } from '../src/prisma/prisma.service';

const productId = '00000000-0000-4000-8000-000000000301';
const response = {
  id: productId,
  name: 'Smartphone Pro',
  description: 'Fixture',
  category: { slug: 'mobile-accessories', name: 'Mobile & Accessories' },
  ratingAverageBasisPoints: 490,
  ratingCount: 12,
  soldCount: 20,
  gallery: [],
  variants: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      name: '128GB',
      sku: 'PHONE-128',
      priceMinor: 1_000,
      availableQuantity: 0,
      availability: 'unavailable',
      preferredImageId: null,
    },
  ],
  purchasable: false,
  initialVariantId: '00000000-0000-4000-8000-000000000401',
  shop: {
    id: '00000000-0000-4000-8000-000000000101',
    slug: 'tech-store',
    name: 'Tech Store',
    location: 'Hồ Chí Minh',
    activeProductCount: 3,
  },
  shippingPreview: {
    origin: 'Hồ Chí Minh',
    destinationLabel: 'Toàn quốc',
    feeMinor: null,
    deliveryTimeLabel: null,
    message: 'Xác nhận sau.',
  },
  relatedProducts: [],
};

describe('Product detail endpoint', () => {
  let app: INestApplication;
  const detail = { getProduct: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(CatalogRepository)
      .useValue({})
      .overrideProvider(CatalogProductDetailService)
      .useValue(detail)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    detail.getProduct.mockResolvedValue(response);
  });
  afterAll(async () => app.close());

  it('returns anonymous no-store product detail, including product-wide unavailable data', async () => {
    const result = await request(app.getHttpServer())
      .get(`/api/v1/catalog/products/${productId}`)
      .expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).toMatchObject({
      id: productId,
      purchasable: false,
      gallery: [],
      relatedProducts: [],
    });
    expect(detail.getProduct).toHaveBeenCalledWith(productId);
  });
  it('returns product detail when looked up by slug', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/catalog/products/ao-thun-nam')
      .expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(detail.getProduct).toHaveBeenCalledWith('ao-thun-nam');
  });
  it('rejects malformed IDs without loading data', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/catalog/products/INVALID_ID!@#')
      .expect(400);
    expect(result.headers['content-type']).toContain('application/problem+json');
    expect(result.body).toMatchObject({ status: 400, title: 'Invalid product identifier' });
    expect(detail.getProduct).not.toHaveBeenCalled();
  });

  it('sanitizes not-found and source failures', async () => {
    detail.getProduct.mockImplementationOnce(() => {
      throw new CatalogProductNotFoundError();
    });
    await request(app.getHttpServer()).get(`/api/v1/catalog/products/${productId}`).expect(404);
    detail.getProduct.mockRejectedValueOnce(new Error('postgres://user:password@database'));
    const result = await request(app.getHttpServer())
      .get(`/api/v1/catalog/products/${productId}`)
      .expect(503);
    expect(JSON.stringify(result.body)).not.toContain('password');
  });
});

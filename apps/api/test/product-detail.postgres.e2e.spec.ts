import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isProductDetailResponse } from '@shopee-clone/contracts';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { ProductStatus, ShopStatus, VariantStatus } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseTest =
  process.env.RUN_PRODUCT_DETAIL_DATABASE_TESTS === '1' ? describe : describe.skip;

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('Product detail endpoint with isolated PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let productId: string;
  let shopId: string;
  let categoryId: string;
  let variantId: string;
  let quantityOnHand: number;
  let quantityReserved: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    const fixture = await prisma.datasetProductRecord.findFirstOrThrow({
      where: { source: { key: 'bachhoa' }, isActive: true },
      orderBy: { sourceIndex: 'asc' },
      include: { product: { include: { variants: { include: { inventory: true } } } } },
    });
    const variant = fixture.product.variants[0];
    if (!variant?.inventory) throw new Error('Expected canonical product inventory fixture.');
    productId = fixture.productId;
    shopId = fixture.product.shopId;
    categoryId = fixture.product.categoryId;
    variantId = variant.id;
    quantityOnHand = variant.inventory.quantityOnHand;
    quantityReserved = variant.inventory.quantityReserved;
  });

  afterAll(async () => app?.close());

  it('returns remote media, authoritative stock, initial offer, and related cards', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/catalog/products/${productId}`)
      .expect(200);
    expect(isProductDetailResponse(response.body)).toBe(true);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.gallery).toHaveLength(1);
    expect(response.body.gallery[0]).toMatchObject({ sortOrder: 0, variantId: null });
    expect(response.body.gallery[0].url).toMatch(/^https:\/\//);
    expect(response.body.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: variantId,
          availableQuantity: quantityOnHand - quantityReserved,
          availability: 'in-stock',
        }),
      ]),
    );
    expect(response.body.initialVariantId).toBe(variantId);
    expect(response.body.relatedProducts).toHaveLength(6);
    expect(response.body.relatedProducts.map((item: { id: string }) => item.id)).not.toContain(
      productId,
    );
  });

  it('hides each non-public cause and excludes inactive variants', async () => {
    try {
      await prisma.product.update({
        where: { id: productId },
        data: { status: ProductStatus.ARCHIVED },
      });
      await request(app.getHttpServer()).get(`/api/v1/catalog/products/${productId}`).expect(404);
      await prisma.product.update({
        where: { id: productId },
        data: { status: ProductStatus.ACTIVE, deletedAt: new Date() },
      });
      await request(app.getHttpServer()).get(`/api/v1/catalog/products/${productId}`).expect(404);
      await prisma.product.update({ where: { id: productId }, data: { deletedAt: null } });
      await prisma.shop.update({ where: { id: shopId }, data: { status: ShopStatus.INACTIVE } });
      await request(app.getHttpServer()).get(`/api/v1/catalog/products/${productId}`).expect(404);
      await prisma.shop.update({ where: { id: shopId }, data: { status: ShopStatus.ACTIVE } });
      await prisma.category.update({ where: { id: categoryId }, data: { isActive: false } });
      await request(app.getHttpServer()).get(`/api/v1/catalog/products/${productId}`).expect(404);
      await prisma.category.update({ where: { id: categoryId }, data: { isActive: true } });
      await prisma.productVariant.update({
        where: { id: variantId },
        data: { status: VariantStatus.INACTIVE },
      });
      const response = await request(app.getHttpServer())
        .get(`/api/v1/catalog/products/${productId}`)
        .expect(200);
      expect(response.body.variants).toEqual([]);
    } finally {
      await prisma.product.update({
        where: { id: productId },
        data: { status: ProductStatus.ACTIVE, deletedAt: null },
      });
      await prisma.shop.update({ where: { id: shopId }, data: { status: ShopStatus.ACTIVE } });
      await prisma.category.update({ where: { id: categoryId }, data: { isActive: true } });
      await prisma.productVariant.update({
        where: { id: variantId },
        data: { status: VariantStatus.ACTIVE, deletedAt: null },
      });
    }
  });

  it('keeps a canonical product readable but unavailable when its offer is out of stock', async () => {
    try {
      await prisma.inventory.update({
        where: { variantId },
        data: { quantityOnHand: quantityReserved },
      });
      const response = await request(app.getHttpServer())
        .get(`/api/v1/catalog/products/${productId}`)
        .expect(200);
      expect(response.body).toMatchObject({ purchasable: false, initialVariantId: variantId });
      expect(response.body.variants).toEqual([
        expect.objectContaining({ availability: 'unavailable', availableQuantity: 0 }),
      ]);
    } finally {
      await prisma.inventory.update({
        where: { variantId },
        data: { quantityOnHand, quantityReserved },
      });
    }
  });
});

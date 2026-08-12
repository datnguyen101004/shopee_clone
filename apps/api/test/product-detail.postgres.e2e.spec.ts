import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isProductDetailResponse } from '@shopee-clone/contracts';
import request from 'supertest';

import { seedProducts, seedVariants } from '../prisma/seed-data';
import { ProductStatus, ShopStatus, VariantStatus } from '../src/generated/prisma/enums';
import { AppModule } from '../src/app.module';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseTest =
  process.env.RUN_PRODUCT_DETAIL_DATABASE_TESTS === '1' ? describe : describe.skip;
const primaryProduct = seedProducts[0];

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('Product detail endpoint with isolated PostgreSQL', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });
  afterAll(async () => app?.close());

  it('returns ordered generic and variant media, authoritative stock, initial offer, and related cards', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/catalog/products/${primaryProduct.id}`)
      .expect(200);
    expect(isProductDetailResponse(response.body)).toBe(true);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.gallery.map((item: { sortOrder: number }) => item.sortOrder)).toEqual([
      0, 10, 20,
    ]);
    expect(response.body.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: seedVariants[0].id,
          availableQuantity: 45,
          availability: 'in-stock',
        }),
        expect.objectContaining({
          id: seedVariants[1].id,
          availableQuantity: 28,
          availability: 'in-stock',
        }),
      ]),
    );
    expect(response.body.initialVariantId).toBe(seedVariants[0].id);
    expect(response.body.relatedProducts).toHaveLength(6);
    expect(response.body.relatedProducts.map((item: { id: string }) => item.id)).not.toContain(
      primaryProduct.id,
    );
  });

  it('hides each non-public cause and excludes inactive variants', async () => {
    const prisma = app.get(PrismaService);
    try {
      await prisma.product.update({
        where: { id: primaryProduct.id },
        data: { status: ProductStatus.ARCHIVED },
      });
      await request(app.getHttpServer())
        .get(`/api/v1/catalog/products/${primaryProduct.id}`)
        .expect(404);
      await prisma.product.update({
        where: { id: primaryProduct.id },
        data: { status: ProductStatus.ACTIVE, deletedAt: new Date() },
      });
      await request(app.getHttpServer())
        .get(`/api/v1/catalog/products/${primaryProduct.id}`)
        .expect(404);
      await prisma.product.update({ where: { id: primaryProduct.id }, data: { deletedAt: null } });
      await prisma.shop.update({
        where: { id: primaryProduct.shopId },
        data: { status: ShopStatus.INACTIVE },
      });
      await request(app.getHttpServer())
        .get(`/api/v1/catalog/products/${primaryProduct.id}`)
        .expect(404);
      await prisma.shop.update({
        where: { id: primaryProduct.shopId },
        data: { status: ShopStatus.ACTIVE },
      });
      await prisma.category.update({
        where: { id: primaryProduct.categoryId },
        data: { isActive: false },
      });
      await request(app.getHttpServer())
        .get(`/api/v1/catalog/products/${primaryProduct.id}`)
        .expect(404);
      await prisma.category.update({
        where: { id: primaryProduct.categoryId },
        data: { isActive: true },
      });
      await prisma.productVariant.update({
        where: { id: seedVariants[1].id },
        data: { status: VariantStatus.INACTIVE },
      });
      const response = await request(app.getHttpServer())
        .get(`/api/v1/catalog/products/${primaryProduct.id}`)
        .expect(200);
      expect(response.body.variants.map((item: { id: string }) => item.id)).not.toContain(
        seedVariants[1].id,
      );
    } finally {
      await prisma.product.update({
        where: { id: primaryProduct.id },
        data: { status: ProductStatus.ACTIVE, deletedAt: null },
      });
      await prisma.shop.update({
        where: { id: primaryProduct.shopId },
        data: { status: ShopStatus.ACTIVE },
      });
      await prisma.category.update({
        where: { id: primaryProduct.categoryId },
        data: { isActive: true },
      });
      await prisma.productVariant.update({
        where: { id: seedVariants[1].id },
        data: { status: VariantStatus.ACTIVE, deletedAt: null },
      });
    }
  });

  it('keeps a public product readable but unavailable when all active offers are out of stock', async () => {
    const prisma = app.get(PrismaService);
    const product = seedProducts[3];
    const availableVariant = seedVariants[4];
    try {
      await prisma.inventory.update({
        where: { variantId: availableVariant.id },
        data: { quantityOnHand: availableVariant.quantityReserved },
      });
      const response = await request(app.getHttpServer())
        .get(`/api/v1/catalog/products/${product.id}`)
        .expect(200);
      expect(response.body).toMatchObject({
        purchasable: false,
        initialVariantId: seedVariants[4].id,
      });
      expect(
        response.body.variants.every(
          (item: { availability: string; availableQuantity: number }) =>
            item.availability === 'unavailable' && item.availableQuantity === 0,
        ),
      ).toBe(true);
    } finally {
      await prisma.inventory.update({
        where: { variantId: availableVariant.id },
        data: {
          quantityOnHand: availableVariant.quantityOnHand,
          quantityReserved: availableVariant.quantityReserved,
        },
      });
    }
  });
});

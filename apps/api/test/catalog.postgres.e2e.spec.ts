import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isCatalogProductsResponse } from '@shopee-clone/contracts';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';
import { ProductStatus } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

const databaseTest = process.env.RUN_CATALOG_DATABASE_TESTS === '1' ? describe : describe.skip;

loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

databaseTest('Catalog endpoint with isolated PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let primaryProductId: string;
  let primaryVariantId: string;
  let primaryQuantityOnHand: number;
  let primaryQuantityReserved: number;

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
    primaryProductId = fixture.productId;
    primaryVariantId = variant.id;
    primaryQuantityOnHand = variant.inventory.quantityOnHand;
    primaryQuantityReserved = variant.inventory.quantityReserved;
  });

  afterAll(async () => app.close());

  it('returns canonical pages in stable order and covers all six categories', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?page=1&pageSize=2')
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?page=2&pageSize=2')
      .expect(200);
    expect(isCatalogProductsResponse(first.body)).toBe(true);
    expect(isCatalogProductsResponse(second.body)).toBe(true);
    expect(first.body.pagination.totalItems).toBeGreaterThan(1_300);
    expect(first.body.items).toHaveLength(2);
    expect(second.body.items).toHaveLength(2);
    expect(second.body.items.map((item: { id: string }) => item.id)).not.toEqual(
      first.body.items.map((item: { id: string }) => item.id),
    );

    for (const category of [
      'bach-hoa',
      'thiet-bi-dien-tu',
      'my-pham',
      'noi-that',
      'the-thao',
      'thoi-trang',
    ]) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/catalog/products?category=${category}&pageSize=1`)
        .expect(200);
      expect(response.body.pagination.totalItems).toBeGreaterThan(0);
      expect(response.body.items[0]?.category.slug).toBe(category);
    }
  });

  it('normalizes keywords, combines filters, exposes facets, and keeps pages stable', async () => {
    const accented = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?q=nuoc%20kiem&pageSize=48')
      .expect(200);
    expect(accented.body.items.length).toBeGreaterThan(0);
    expect(accented.body.items.some((item: { name: string }) => /nước kiềm/i.test(item.name))).toBe(
      true,
    );

    const combined = await request(app.getHttpServer())
      .get(
        '/api/v1/catalog/products?category=bach-hoa&minPrice=1000&maxPrice=1000000&rating=4&location=TP.%20H%E1%BB%93%20Ch%C3%AD%20Minh&availability=in-stock&promotion=discounted&sort=price-asc&pageSize=48',
      )
      .expect(200);
    expect(combined.body.items.length).toBeGreaterThan(0);
    expect(combined.body.items).toEqual(
      [...combined.body.items].sort(
        (left: { priceMinor: number }, right: { priceMinor: number }) =>
          left.priceMinor - right.priceMinor,
      ),
    );
    expect(
      combined.body.items.every(
        (item: {
          ratingAverageBasisPoints: number;
          shop: { location: string };
          compareAtPriceMinor?: number;
        }) =>
          item.ratingAverageBasisPoints >= 400 &&
          item.shop.location === 'TP. Hồ Chí Minh' &&
          item.compareAtPriceMinor !== undefined,
      ),
    ).toBe(true);
    expect(combined.body.facets.categories.length).toBe(6);
    expect(combined.body.facets.locations.length).toBeGreaterThan(1);
    expect(combined.body.facets.priceRange.min).toBeLessThan(combined.body.facets.priceRange.max);

    const first = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?sort=best-selling&page=1&pageSize=4')
      .expect(200);
    const repeated = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?sort=best-selling&page=1&pageSize=4')
      .expect(200);
    expect(repeated.body.items.map((item: { id: string }) => item.id)).toEqual(
      first.body.items.map((item: { id: string }) => item.id),
    );
    expect(first.body.items.map((item: { soldCount: number }) => item.soldCount)).toEqual(
      [...first.body.items]
        .map((item: { soldCount: number }) => item.soldCount)
        .sort((left, right) => right - left),
    );
  });

  it.each(['newest', 'best-selling', 'price-asc', 'price-desc', 'relevance'])(
    'returns a valid response for %s sorting',
    async (sort) => {
      const q = sort === 'relevance' ? '&q=airpods' : '';
      const response = await request(app.getHttpServer())
        .get(`/api/v1/catalog/products?sort=${sort}${q}`)
        .expect(200);
      expect(isCatalogProductsResponse(response.body)).toBe(true);
    },
  );

  it('retains unfiltered facets for no-match discovery', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?q=definitely-no-such-product&location=Atlantis')
      .expect(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.pagination).toMatchObject({ totalItems: 0, totalPages: 0 });
    expect(response.body.facets.categories.length).toBe(6);
    expect(response.body.facets.locations.length).toBeGreaterThan(0);
    expect(response.body.facets.priceRange.min).not.toBeNull();
  });

  it('excludes inactive, deleted, and unavailable canonical candidates', async () => {
    try {
      await prisma.product.update({
        where: { id: primaryProductId },
        data: { status: ProductStatus.ARCHIVED },
      });
      let response = await request(app.getHttpServer())
        .get('/api/v1/catalog/products?pageSize=48')
        .expect(200);
      expect(response.body.items.some((item: { id: string }) => item.id === primaryProductId)).toBe(
        false,
      );

      await prisma.product.update({
        where: { id: primaryProductId },
        data: { status: ProductStatus.ACTIVE, deletedAt: new Date() },
      });
      response = await request(app.getHttpServer())
        .get('/api/v1/catalog/products?pageSize=48')
        .expect(200);
      expect(response.body.items.some((item: { id: string }) => item.id === primaryProductId)).toBe(
        false,
      );

      await prisma.product.update({ where: { id: primaryProductId }, data: { deletedAt: null } });
      await prisma.inventory.update({
        where: { variantId: primaryVariantId },
        data: { quantityOnHand: primaryQuantityReserved },
      });
      response = await request(app.getHttpServer())
        .get('/api/v1/catalog/products?pageSize=48')
        .expect(200);
      expect(response.body.items.some((item: { id: string }) => item.id === primaryProductId)).toBe(
        false,
      );
    } finally {
      await prisma.product.update({
        where: { id: primaryProductId },
        data: { status: ProductStatus.ACTIVE, deletedAt: null },
      });
      await prisma.inventory.update({
        where: { variantId: primaryVariantId },
        data: {
          quantityOnHand: primaryQuantityOnHand,
          quantityReserved: primaryQuantityReserved,
        },
      });
    }
  });
});

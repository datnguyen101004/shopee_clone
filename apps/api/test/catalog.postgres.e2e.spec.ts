import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isCatalogProductsResponse } from '@shopee-clone/contracts';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { ProductStatus } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { seedProducts, seedVariants } from '../prisma/seed-data';

const databaseTest = process.env.RUN_CATALOG_DATABASE_TESTS === '1' ? describe : describe.skip;

databaseTest('Catalog endpoint with isolated PostgreSQL', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns seeded pages in stable order and filters root/leaf categories', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?page=1&pageSize=2')
      .expect(200);
    const second = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?page=2&pageSize=2')
      .expect(200);
    expect(isCatalogProductsResponse(first.body)).toBe(true);
    expect(isCatalogProductsResponse(second.body)).toBe(true);
    expect(first.body.pagination.totalItems).toBeGreaterThan(12);
    expect(first.body.items).toHaveLength(2);
    expect(second.body.items).toHaveLength(2);
    expect(second.body.items.map((item: { id: string }) => item.id)).not.toEqual(
      first.body.items.map((item: { id: string }) => item.id),
    );

    const parent = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?category=electronics&pageSize=48')
      .expect(200);
    const leaf = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?category=mobile-accessories&pageSize=48')
      .expect(200);
    expect(parent.body.items.length).toBe(leaf.body.items.length);
    expect(parent.body.items.length).toBeGreaterThan(1);
    expect(
      leaf.body.items.every(
        (item: { category: { slug: string } }) => item.category.slug === 'mobile-accessories',
      ),
    ).toBe(true);
  });

  it('normalizes keywords, combines filters, exposes facets, and keeps repeated pages stable', async () => {
    const accented = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?q=op%20lung&pageSize=48')
      .expect(200);
    expect(accented.body.items.length).toBeGreaterThan(0);
    expect(accented.body.items.some((item: { name: string }) => /ốp lưng/i.test(item.name))).toBe(
      true,
    );

    const combined = await request(app.getHttpServer())
      .get(
        '/api/v1/catalog/products?category=electronics&minPrice=100000&maxPrice=15000000&rating=4&location=TP.%20H%E1%BB%93%20Ch%C3%AD%20Minh&availability=in-stock&promotion=discounted&sort=price-asc&pageSize=48',
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
    expect(combined.body.facets.categories.length).toBeGreaterThan(1);
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
      const q = sort === 'relevance' ? '&q=smartphone' : '';
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
    expect(response.body.facets.categories.length).toBeGreaterThan(0);
    expect(response.body.facets.locations.length).toBeGreaterThan(0);
    expect(response.body.facets.priceRange.min).not.toBeNull();
  });

  it('excludes inactive, deleted, and unavailable real database candidates', async () => {
    const prisma = app.get(PrismaService);
    const productId = seedProducts[0].id;
    const variant = seedVariants[0];
    try {
      await prisma.product.update({
        where: { id: productId },
        data: { status: ProductStatus.ARCHIVED },
      });
      let response = await request(app.getHttpServer())
        .get('/api/v1/catalog/products?pageSize=48')
        .expect(200);
      expect(response.body.items.some((item: { id: string }) => item.id === productId)).toBe(false);

      await prisma.product.update({
        where: { id: productId },
        data: { status: ProductStatus.ACTIVE, deletedAt: new Date() },
      });
      response = await request(app.getHttpServer())
        .get('/api/v1/catalog/products?pageSize=48')
        .expect(200);
      expect(response.body.items.some((item: { id: string }) => item.id === productId)).toBe(false);

      await prisma.product.update({ where: { id: productId }, data: { deletedAt: null } });
      await prisma.inventory.update({
        where: { variantId: variant.id },
        data: { quantityOnHand: variant.quantityReserved },
      });
      await prisma.inventory.update({
        where: { variantId: seedVariants[1].id },
        data: { quantityOnHand: seedVariants[1].quantityReserved },
      });
      response = await request(app.getHttpServer())
        .get('/api/v1/catalog/products?pageSize=48')
        .expect(200);
      expect(response.body.items.some((item: { id: string }) => item.id === productId)).toBe(false);
    } finally {
      await prisma.product.update({
        where: { id: productId },
        data: { status: ProductStatus.ACTIVE, deletedAt: null },
      });
      for (const restore of seedVariants.slice(0, 2)) {
        await prisma.inventory.update({
          where: { variantId: restore.id },
          data: {
            quantityOnHand: restore.quantityOnHand,
            quantityReserved: restore.quantityReserved,
          },
        });
      }
    }
  });
});

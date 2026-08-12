import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isCatalogProductsResponse } from '@shopee-clone/contracts';
import request from 'supertest';

import { AppModule } from '../src/app.module';

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
});

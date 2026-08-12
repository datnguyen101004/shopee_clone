import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isCatalogProductsResponse } from '@shopee-clone/contracts';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { CatalogRepository } from '../src/catalog/catalog.repository';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Catalog endpoint', () => {
  let app: INestApplication;
  const repository = { findActiveCategories: jest.fn(), findCandidates: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(CatalogRepository)
      .useValue(repository)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findActiveCategories.mockResolvedValue([]);
    repository.findCandidates.mockResolvedValue([]);
  });
  afterAll(async () => app.close());

  it('is anonymous and applies default pagination', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/catalog/products').expect(200);
    expect(isCatalogProductsResponse(response.body)).toBe(true);
    expect(response.body).toMatchObject({
      query: {
        q: null,
        category: null,
        minPrice: null,
        maxPrice: null,
        rating: null,
        location: null,
        availability: null,
        promotion: null,
        sort: 'newest',
      },
      pagination: { page: 1, pageSize: 12, totalItems: 0, totalPages: 0 },
      facets: { categories: [], locations: [], priceRange: { min: null, max: null } },
      items: [],
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each([
    '?page=0',
    '?page=1.5',
    '?pageSize=49',
    '?category=invalid%20slug',
    '?minPrice=20&maxPrice=10',
    '?rating=4.5',
    '?availability=all',
    '?promotion=free-shipping',
    '?sort=popular',
  ])('returns sanitized Problem Details for %s', async (query) => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/catalog/products${query}`)
      .expect(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({ status: 400, title: 'Invalid catalogue query' });
    expect(repository.findCandidates).not.toHaveBeenCalled();
  });

  it('normalizes every anonymous discovery parameter and uses relevance by default', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/catalog/products?q=%20%20dien%20%20thoai%20&category=phones&minPrice=0&maxPrice=900&rating=4&location=Ha%20%20Noi&availability=in-stock&promotion=discounted&page=2&pageSize=4&ignored=yes',
      )
      .expect(200);

    expect(response.body.query).toEqual({
      q: 'dien thoai',
      category: 'phones',
      minPrice: 0,
      maxPrice: 900,
      rating: 4,
      location: 'Ha Noi',
      availability: 'in-stock',
      promotion: 'discounted',
      sort: 'relevance',
    });
    expect(response.body.pagination).toMatchObject({ page: 2, pageSize: 4 });
  });

  it('rejects repeated supported values and aggregates sanitized field issues', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?sort=newest&sort=relevance&rating=9&minPrice=-1')
      .expect(400);
    expect(response.body.invalidParameters.map((item: { name: string }) => item.name)).toEqual(
      expect.arrayContaining(['sort', 'rating', 'minPrice']),
    );
    expect(JSON.stringify(response.body)).not.toContain('stack');
  });

  it('returns an empty response for an unknown category', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?category=unknown&page=2&pageSize=2')
      .expect(200);
    expect(isCatalogProductsResponse(response.body)).toBe(true);
    expect(response.body.items).toEqual([]);
  });

  it('sanitizes data-source failures', async () => {
    repository.findCandidates.mockRejectedValueOnce(new Error('postgres://secret:password@db'));
    const response = await request(app.getHttpServer()).get('/api/v1/catalog/products').expect(503);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(response.body).toMatchObject({
      status: 503,
      title: 'Catalogue temporarily unavailable',
    });
  });
});

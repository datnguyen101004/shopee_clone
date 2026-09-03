import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isHomepageResponse } from '@shopee-clone/contracts';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { HomepageRepository } from '../src/homepage/homepage.repository';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Homepage endpoint', () => {
  let app: INestApplication;
  const repository = { findActive: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(HomepageRepository)
      .useValue(repository)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => app.close());

  it('is anonymous and returns the shared contract', async () => {
    repository.findActive.mockResolvedValueOnce([]);
    const response = await request(app.getHttpServer()).get('/api/v1/homepage').expect(200);
    expect(isHomepageResponse(response.body)).toBe(true);
    expect(response.body.modules).toEqual([]);
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('sanitizes data-source failures as Problem Details', async () => {
    repository.findActive.mockRejectedValueOnce(new Error('postgres://secret:password@db'));
    const response = await request(app.getHttpServer()).get('/api/v1/homepage').expect(503);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(response.body).toMatchObject({ status: 503, title: 'Homepage temporarily unavailable' });
  });
});

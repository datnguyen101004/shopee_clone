import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isHealthResponse } from '@shopee-clone/contracts';
import request from 'supertest';

import { AppModule } from '../src/app.module';

describe('Health endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns the shared health contract', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(isHealthResponse(response.body)).toBe(true);
    expect(response.body).toMatchObject({ status: 'ok', service: 'api' });
  });
});

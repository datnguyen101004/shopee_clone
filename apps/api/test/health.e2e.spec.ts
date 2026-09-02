import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isHealthResponse, parseChatOutboxHealthResponse } from '@shopee-clone/contracts';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ChatOutboxDispatcher } from '../src/chat/chat.realtime';
import { SearchElasticsearchAdapter } from '../src/search/search-elasticsearch.adapter';

describe('Health endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
      })
      .overrideProvider(ChatOutboxDispatcher)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        readiness: jest.fn().mockResolvedValue({
          ready: true,
          pending: 0,
          processing: 0,
          failed: 0,
          oldestPendingAgeSeconds: null,
          claimed: 2,
          sent: 2,
          failedAttempts: 0,
          polls: 2,
          lastPollAt: '2026-08-27T00:00:00.000Z',
          lastErrorAt: null,
        }),
      })
      .overrideProvider(SearchElasticsearchAdapter)
      .useValue({
        getHealth: jest.fn().mockResolvedValue({
          required: false,
          enabled: true,
          configured: true,
          available: true,
          status: 'available',
          clusterStatus: 'yellow',
          checkedAt: '2026-08-31T00:00:00.000Z',
          latencyMs: 3,
          reason: null,
        }),
      })
      .compile();

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

  it('GET /api/v1/health/chat-outbox returns only the privacy-safe aggregate contract', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/chat-outbox')
      .expect(200);

    expect(parseChatOutboxHealthResponse(response.body)).toEqual(response.body);
    expect(response.body).toEqual(expect.objectContaining({ ready: true, pending: 0, failed: 0 }));
    expect(Object.keys(response.body)).not.toEqual(
      expect.arrayContaining([
        'content',
        'conversationId',
        'userId',
        'ticket',
        'sessionId',
        'rawError',
      ]),
    );
  });

  it('GET /api/v1/health/elasticsearch reports optional dependency availability', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health/elasticsearch')
      .expect(200);

    expect(response.body).toEqual({
      required: false,
      enabled: true,
      configured: true,
      available: true,
      status: 'available',
      clusterStatus: 'yellow',
      checkedAt: '2026-08-31T00:00:00.000Z',
      latencyMs: 3,
      reason: null,
    });
  });
});

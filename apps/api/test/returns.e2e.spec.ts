import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReturnEvidenceStorage } from '../src/returns/return-evidence.storage';
import { ReturnService } from '../src/returns/return.service';

const ids = {
  buyer: '00000000-0000-4000-8000-000000030001',
  seller: '00000000-0000-4000-8000-000000030002',
  admin: '00000000-0000-4000-8000-000000030003',
  order: '00000000-0000-4000-8000-000000030004',
  line: '00000000-0000-4000-8000-000000030005',
  evidence: '00000000-0000-4000-8000-000000030006',
  return: '00000000-0000-4000-8000-000000030007',
  key: '00000000-0000-4000-8000-000000030008',
};
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.headers.authorization;
    const actor: { id: string; roles: ('buyer' | 'seller' | 'admin')[] } | null =
      token === 'Bearer buyer'
        ? { id: ids.buyer, roles: ['buyer'] }
        : token === 'Bearer seller'
          ? { id: ids.seller, roles: ['seller'] }
          : token === 'Bearer admin'
            ? { id: ids.admin, roles: ['admin'] }
            : null;
    if (!actor) throw new AuthenticationFailedError();
    request.authUser = {
      ...actor,
      email: `${actor.id}@example.test`,
      displayName: 'Return Tester',
      status: 'active',
    };
    return true;
  }
}
const result = { return: { version: 1 } };

describe('return HTTP boundaries', () => {
  let app: INestApplication;
  const service = {
    stageEvidence: jest.fn(),
    createBuyer: jest.fn(),
    list: jest.fn(),
    detailBuyer: jest.fn(),
    detailSeller: jest.fn(),
    detailAdmin: jest.fn(),
    actBuyer: jest.fn(),
    actSeller: jest.fn(),
    decideAdmin: jest.fn(),
    readableEvidence: jest.fn(),
  };
  const storage = { write: jest.fn(), read: jest.fn(), remove: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(ReturnService)
      .useValue(service)
      .overrideProvider(ReturnEvidenceStorage)
      .useValue(storage)
      .overrideGuard(AuthGuard)
      .useClass(TestAuthGuard)
      .compile();
    app = module.createNestApplication();
    configureApplication(
      app,
      loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: 'http://localhost:3000' }),
    );
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    service.stageEvidence.mockResolvedValue({
      evidenceId: ids.evidence,
      expiresAt: '2026-08-22T00:00:00.000Z',
    });
    service.createBuyer.mockResolvedValue(result);
    service.list.mockResolvedValue({ items: [] });
    service.detailBuyer.mockResolvedValue(result);
    service.detailSeller.mockResolvedValue(result);
    service.detailAdmin.mockResolvedValue(result);
    service.actBuyer.mockResolvedValue(result);
    service.actSeller.mockResolvedValue(result);
    service.decideAdmin.mockResolvedValue(result);
    storage.write.mockResolvedValue('opaque.png');
    storage.read.mockResolvedValue(Buffer.from('image'));
    storage.remove.mockResolvedValue(undefined);
  });
  afterAll(async () => app?.close());

  it('scopes buyer routes, validates optimistic create input, and uses no-store responses', async () => {
    await request(app.getHttpServer()).get('/api/v1/account/returns').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/account/returns?status=ESCALATED&limit=10')
      .set('Authorization', 'Bearer buyer')
      .expect(200);
    expect(service.list).toHaveBeenCalledWith(
      'BUYER',
      ids.buyer,
      expect.objectContaining({ status: 'ESCALATED', limit: 10 }),
    );
    await request(app.getHttpServer())
      .post(`/api/v1/account/orders/${ids.order}/returns`)
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'https://evil.example')
      .expect(403);
    const created = await request(app.getHttpServer())
      .post(`/api/v1/account/orders/${ids.order}/returns`)
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"order-0"')
      .set('Idempotency-Key', ids.key)
      .send({
        reasonCode: 'DAMAGED',
        description: 'Sản phẩm bị hư hỏng khi nhận hàng',
        items: [{ lineReference: ids.line, quantity: 1 }],
        evidenceIds: [ids.evidence],
      })
      .expect('Cache-Control', 'private, no-store')
      .expect('ETag', '"return-1"')
      .expect(201);
    expect(created.body).toEqual(result);
    expect(service.createBuyer).toHaveBeenCalledWith(
      ids.buyer,
      ids.order,
      0,
      ids.key,
      expect.objectContaining({ reasonCode: 'DAMAGED' }),
    );
  });

  it('enforces seller/admin roles and validates private evidence uploads', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/seller/returns')
      .set('Authorization', 'Bearer buyer')
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/seller/returns')
      .set('Authorization', 'Bearer seller')
      .expect(200);
    expect(service.list).toHaveBeenCalledWith('SELLER', ids.seller, expect.any(Object));
    await request(app.getHttpServer())
      .post(`/api/v1/admin/returns/${ids.return}/decisions`)
      .set('Authorization', 'Bearer seller')
      .set('Origin', 'http://localhost:3000')
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/returns/${ids.return}/decisions`)
      .set('Authorization', 'Bearer admin')
      .set('Origin', 'http://localhost:3000')
      .set('If-Match', '"return-1"')
      .set('Idempotency-Key', ids.key)
      .send({ decision: 'APPROVE_REFUND', publicReason: 'Bằng chứng cho thấy hàng bị hư hỏng' })
      .expect(200);
    expect(service.decideAdmin).toHaveBeenCalledWith(
      ids.admin,
      ids.return,
      1,
      ids.key,
      expect.objectContaining({ decision: 'APPROVE_REFUND' }),
    );
    const png = Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
    ]);
    await request(app.getHttpServer())
      .post('/api/v1/account/return-evidence')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000')
      .attach('file', png, { filename: 'proof.png', contentType: 'image/png' })
      .expect(201);
    expect(service.stageEvidence).toHaveBeenCalledWith(
      ids.buyer,
      expect.objectContaining({ mimeType: 'image/png', width: 1, height: 1 }),
    );
    await request(app.getHttpServer())
      .post('/api/v1/account/return-evidence')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000')
      .attach('file', Buffer.from('spoof'), { filename: 'proof.png', contentType: 'image/png' })
      .expect(400);
  });
});

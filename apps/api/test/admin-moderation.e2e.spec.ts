import type { AuthUser } from '@shopee-clone/contracts';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AdminModerationService } from '../src/admin/admin-moderation.service';
import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';

const users: Record<string, AuthUser> = {
  buyer: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'buyer@example.test',
    displayName: 'Buyer Example',
    status: 'active',
    roles: ['buyer'],
  },
  seller: {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'seller@example.test',
    displayName: 'Seller Example',
    status: 'active',
    roles: ['buyer', 'seller'],
  },
  admin: {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'admin@example.test',
    displayName: 'Admin Example',
    status: 'active',
    roles: ['buyer', 'admin'],
  },
};

class MatrixAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const user = token ? users[token] : undefined;
    if (!user) throw new AuthenticationFailedError();
    req.authUser = user;
    return true;
  }
}

describe('Admin Moderation Workflow E2E Endpoints', () => {
  let app: INestApplication;
  const moderationService = {
    listCases: jest.fn(),
    getCaseDetail: jest.fn(),
    assignCase: jest.fn(),
    addNote: jest.fn(),
    makeDecision: jest.fn(),
  };

  const allowedOrigin = 'http://localhost:3000';
  const caseId = '123e4567-e89b-12d3-a456-426614174000';
  const idempotencyKey = '123e4567-e89b-12d3-a456-426614174001';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(AdminModerationService)
      .useValue(moderationService)
      .overrideGuard(AuthGuard)
      .useClass(MatrixAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    configureApplication(
      app,
      loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: allowedOrigin }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/v1/admin/moderation/cases lists cases for admin', async () => {
    const mockList = {
      items: [
        {
          id: caseId,
          targetType: 'PRODUCT',
          targetId: '123e4567-e89b-12d3-a456-426614174002',
          targetName: 'Reported Product',
          targetStatus: 'ACTIVE',
          status: 'OPEN',
          reportCount: 3,
          primaryReasonCode: 'PROHIBITED_ITEM',
          assignedAdminId: null,
          assignedAdminName: null,
          currentOutcome: null,
          version: 0,
          createdAt: '2026-08-21T12:00:00.000Z',
          lastActivityAt: '2026-08-21T12:00:00.000Z',
          resolvedAt: null,
        },
      ],
      nextCursor: null,
    };
    moderationService.listCases.mockResolvedValue(mockList);

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/moderation/cases?status=OPEN&targetId=123e4567-e89b-12d3-a456-426614174002')
      .set('Authorization', 'Bearer admin');

    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual(mockList);
    expect(moderationService.listCases).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'OPEN',
        targetId: '123e4567-e89b-12d3-a456-426614174002',
      }),
    );
  });

  it('GET /api/v1/admin/moderation/cases rejects non-admin users with 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/moderation/cases')
      .set('Authorization', 'Bearer buyer');

    expect(res.status).toBe(403);
  });

  it('GET /api/v1/admin/moderation/cases/:caseId returns full case detail', async () => {
    const mockDetail = {
      id: caseId,
      targetType: 'PRODUCT',
      targetId: '123e4567-e89b-12d3-a456-426614174002',
      targetName: 'Reported Product',
      targetStatus: 'ACTIVE',
      status: 'OPEN',
      reportCount: 1,
      primaryReasonCode: 'PROHIBITED_ITEM',
      assignedAdminId: null,
      assignedAdminName: null,
      currentOutcome: null,
      version: 0,
      createdAt: '2026-08-21T12:00:00.000Z',
      lastActivityAt: '2026-08-21T12:00:00.000Z',
      resolvedAt: null,
      targetDetails: {
        id: '123e4567-e89b-12d3-a456-426614174002',
        targetType: 'PRODUCT',
        name: 'Reported Product',
        slug: 'reported-product',
        currentStatus: 'ACTIVE',
        moderationStatus: 'ACTIVE',
      },
      reports: [],
      events: [],
      decisions: [],
    };
    moderationService.getCaseDetail.mockResolvedValue(mockDetail);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/moderation/cases/${caseId}`)
      .set('Authorization', 'Bearer admin');

    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual(mockDetail);
  });

  it('POST /api/v1/admin/moderation/cases/:caseId/assign assigns case to admin', async () => {
    const mockDetail = { id: caseId, version: 1 };
    moderationService.assignCase.mockResolvedValue({ caseDetail: mockDetail });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/moderation/cases/${caseId}/assign`)
      .set('Origin', allowedOrigin)
      .set('Authorization', 'Bearer admin')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        assignedAdminId: users.admin!.id,
        expectedVersion: 0,
      });

    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual({ caseDetail: mockDetail });
  });

  it('POST /api/v1/admin/moderation/cases/:caseId/notes adds a private note', async () => {
    const mockDetail = { id: caseId, version: 2 };
    moderationService.addNote.mockResolvedValue({ caseDetail: mockDetail });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/moderation/cases/${caseId}/notes`)
      .set('Origin', allowedOrigin)
      .set('Authorization', 'Bearer admin')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        note: 'Reviewing seller response documentation.',
        expectedVersion: 1,
      });

    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual({ caseDetail: mockDetail });
  });

  it('POST /api/v1/admin/moderation/cases/:caseId/decisions executes decision', async () => {
    const mockResult = {
      caseId,
      outcome: 'SUSPEND_TARGET',
      version: 3,
      targetStatus: 'SUSPENDED',
      resolvedAt: '2026-08-21T12:00:00.000Z',
    };
    moderationService.makeDecision.mockResolvedValue(mockResult);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/moderation/cases/${caseId}/decisions`)
      .set('Origin', allowedOrigin)
      .set('Authorization', 'Bearer admin')
      .set('Idempotency-Key', idempotencyKey)
      .send({
        outcome: 'SUSPEND_TARGET',
        publicReason: 'Violation of product policies regarding counterfeits.',
        privateNote: 'Internal case resolution.',
        expectedVersion: 2,
      });

    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual(mockResult);
  });
});

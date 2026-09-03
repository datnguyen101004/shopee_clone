import type { AuthUser } from '@shopee-clone/contracts';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportingService } from '../src/reporting/reporting.service';

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

describe('Reporting Endpoints E2E', () => {
  let app: INestApplication;
  const reportingService = {
    submitReport: jest.fn(),
    listReporterReports: jest.fn(),
    getReporterReportDetail: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideGuard(AuthGuard)
      .useClass(MatrixAuthGuard)
      .overrideProvider(ReportingService)
      .useValue(reportingService)
      .compile();

    app = moduleRef.createNestApplication();
    configureApplication(
      app,
      loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: 'http://localhost:3000' }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /api/v1/reports creates a report for an authenticated buyer', async () => {
    const reportResponse = {
      reportId: '123e4567-e89b-12d3-a456-426614174000',
      targetType: 'PRODUCT',
      targetId: '123e4567-e89b-12d3-a456-426614174001',
      reasonCode: 'PROHIBITED_ITEM',
      status: 'SUBMITTED',
      createdAt: '2026-08-21T12:00:00.000Z',
    };
    reportingService.submitReport.mockResolvedValue({
      isReplay: false,
      response: reportResponse,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', 'Bearer buyer')
      .set('Idempotency-Key', '123e4567-e89b-12d3-a456-426614174002')
      .send({
        targetType: 'PRODUCT',
        targetId: '123e4567-e89b-12d3-a456-426614174001',
        reasonCode: 'PROHIBITED_ITEM',
        details: 'Violation of prohibited items policy in catalog.',
      });

    expect(res.status).toBe(201);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual(reportResponse);
  });

  it('POST /api/v1/reports returns 200 on idempotent replay', async () => {
    const reportResponse = {
      reportId: '123e4567-e89b-12d3-a456-426614174000',
      targetType: 'PRODUCT',
      targetId: '123e4567-e89b-12d3-a456-426614174001',
      reasonCode: 'PROHIBITED_ITEM',
      status: 'SUBMITTED',
      createdAt: '2026-08-21T12:00:00.000Z',
    };
    reportingService.submitReport.mockResolvedValue({
      isReplay: true,
      response: reportResponse,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set('Origin', 'http://localhost:3000')
      .set('Authorization', 'Bearer buyer')
      .set('Idempotency-Key', '123e4567-e89b-12d3-a456-426614174002')
      .send({
        targetType: 'PRODUCT',
        targetId: '123e4567-e89b-12d3-a456-426614174001',
        reasonCode: 'PROHIBITED_ITEM',
        details: 'Violation of prohibited items policy in catalog.',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(reportResponse);
  });

  it('GET /api/v1/account/reports lists reporter history', async () => {
    const listResponse = {
      items: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          targetType: 'PRODUCT',
          targetId: '123e4567-e89b-12d3-a456-426614174001',
          targetName: 'Suspicious Product',
          reasonCode: 'PROHIBITED_ITEM',
          status: 'SUBMITTED',
          createdAt: '2026-08-21T12:00:00.000Z',
          resolvedAt: null,
        },
      ],
      nextCursor: null,
    };
    reportingService.listReporterReports.mockResolvedValue(listResponse);

    const res = await request(app.getHttpServer())
      .get('/api/v1/account/reports?limit=10')
      .set('Authorization', 'Bearer buyer');

    expect(res.status).toBe(200);
    expect(res.header['cache-control']).toBe('private, no-store');
    expect(res.body).toEqual(listResponse);
  });

  it('GET /api/v1/account/reports/:reportId returns report detail', async () => {
    const detailResponse = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      targetType: 'PRODUCT',
      targetId: '123e4567-e89b-12d3-a456-426614174001',
      targetName: 'Suspicious Product',
      targetSlug: 'suspicious-product',
      reasonCode: 'PROHIBITED_ITEM',
      details: 'Violation of prohibited items policy in catalog.',
      evidenceUrls: ['https://cdn.example.com/proof1.jpg'],
      status: 'SUBMITTED',
      createdAt: '2026-08-21T12:00:00.000Z',
      resolvedAt: null,
    };
    reportingService.getReporterReportDetail.mockResolvedValue(detailResponse);

    const res = await request(app.getHttpServer())
      .get('/api/v1/account/reports/123e4567-e89b-12d3-a456-426614174000')
      .set('Authorization', 'Bearer buyer');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(detailResponse);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/account/reports');
    expect(res.status).toBe(401);
  });
});

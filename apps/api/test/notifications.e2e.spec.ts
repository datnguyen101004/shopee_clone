import type { AuthUser } from '@shopee-clone/contracts';
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { configureApplication } from '../src/configure-application';
import { NotificationService } from '../src/notifications/notification.service';
import { PrismaService } from '../src/prisma/prisma.service';

const buyer: AuthUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer Example',
  status: 'active',
  roles: ['buyer'],
};

class MatrixAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (token !== 'buyer') throw new AuthenticationFailedError();
    req.authUser = buyer;
    return true;
  }
}

describe('Notifications API endpoints', () => {
  let app: INestApplication;
  const notifications = {
    list: jest.fn(),
    unreadCount: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    archive: jest.fn(),
    listPreferences: jest.fn(),
    updatePreference: jest.fn(),
    processOutbox: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(NotificationService)
      .useValue(notifications)
      .overrideGuard(AuthGuard)
      .useClass(MatrixAuthGuard)
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

  it('rejects unauthenticated unread-count', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/account/notifications/unread-count');
    expect(res.status).toBe(401);
  });

  it('returns unread count and paginated inbox for buyer', async () => {
    notifications.unreadCount.mockResolvedValue({ unreadCount: 2 });
    notifications.list.mockResolvedValue({
      notificationVersion: 'notifications-v1',
      items: [],
      nextCursor: 'cursor-1',
      unreadCount: 2,
    });

    const unread = await request(app.getHttpServer())
      .get('/api/v1/account/notifications/unread-count')
      .set('Authorization', 'Bearer buyer');
    expect(unread.status).toBe(200);
    expect(unread.body).toEqual({ unreadCount: 2 });

    const list = await request(app.getHttpServer())
      .get('/api/v1/account/notifications?category=ORDERS&limit=5')
      .set('Authorization', 'Bearer buyer');
    expect(list.status).toBe(200);
    expect(list.body.nextCursor).toBe('cursor-1');
    expect(notifications.list).toHaveBeenCalledWith(buyer.id, {
      category: 'ORDERS',
      limit: 5,
    });
  });

  it('marks single and all notifications as read', async () => {
    const id = '00000000-0000-4000-8000-000000000201';
    notifications.markRead.mockResolvedValue({
      id,
      isRead: true,
      readAt: '2026-08-22T10:00:00.000Z',
    });
    notifications.markAllRead.mockResolvedValue({
      updatedCount: 3,
      readAt: '2026-08-22T10:00:00.000Z',
    });

    const single = await request(app.getHttpServer())
      .post(`/api/v1/account/notifications/${id}/read`)
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000');
    expect(single.status).toBe(200);
    expect(single.body.isRead).toBe(true);

    const all = await request(app.getHttpServer())
      .post('/api/v1/account/notifications/read-all')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000');
    expect(all.status).toBe(200);
    expect(all.body.updatedCount).toBe(3);
  });

  it('updates preferences', async () => {
    notifications.updatePreference.mockResolvedValue({
      notificationVersion: 'notifications-v1',
      preferences: [
        { category: 'PROMOTIONS', channel: 'EMAIL', enabled: false, mandatory: false },
      ],
    });
    const res = await request(app.getHttpServer())
      .put('/api/v1/account/notifications/preferences')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000')
      .send({ category: 'PROMOTIONS', channel: 'EMAIL', enabled: false });
    expect(res.status).toBe(200);
    expect(notifications.updatePreference).toHaveBeenCalledWith(buyer.id, {
      category: 'PROMOTIONS',
      channel: 'EMAIL',
      enabled: false,
    });
  });
});

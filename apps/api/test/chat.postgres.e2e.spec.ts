import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { configureApplication } from '../src/configure-application';
import { loadAuthConfig } from '../src/auth/auth.config';
import { UserStatus, ShopOnboardingStatus, ShopStatus } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { loadRepositoryEnvironment } from '../src/config/repository-environment';

const databaseTest = process.env.RUN_CHAT_DATABASE_TESTS === '1' ? describe : describe.skip;
loadRepositoryEnvironment();
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const ids = {
  buyer: '00000000-0000-4000-8000-000000007001',
  seller: '00000000-0000-4000-8000-000000007002',
  outsider: '00000000-0000-4000-8000-000000007003',
  shop: '00000000-0000-4000-8000-000000007004',
};

class ChatDatabaseAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.headers.authorization;
    const actor = token === 'Bearer buyer' ? ids.buyer : token === 'Bearer seller' ? ids.seller : token === 'Bearer outsider' ? ids.outsider : null;
    if (!actor) throw new AuthenticationFailedError();
    request.authUser = { id: actor, email: `${actor}@example.test`, displayName: actor === ids.buyer ? 'Buyer' : actor === ids.seller ? 'Seller' : 'Outsider', status: 'active', roles: ['buyer'] };
    request.authSessionId = `session-${actor}`;
    return true;
  }
}

databaseTest('floating chat against PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let conversation: string;

  const auth = (token: 'buyer' | 'seller' | 'outsider') => ({ Authorization: `Bearer ${token}` });
  const origin = 'http://localhost:3000';

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideGuard(AuthGuard).useClass(ChatDatabaseAuthGuard).compile();
    app = module.createNestApplication();
    configureApplication(app, loadAuthConfig({ NODE_ENV: 'test', AUTH_ALLOWED_ORIGINS: origin }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (!prisma) return app?.close();
    await prisma.chatOutbox.deleteMany({ where: { conversation: { participantLowUserId: { in: [ids.buyer, ids.seller, ids.outsider] } } } }).catch(() => undefined);
    await prisma.chatConversation.deleteMany({ where: { participantLowUserId: { in: [ids.buyer, ids.seller, ids.outsider] } } }).catch(() => undefined);
    await prisma.shop.deleteMany({ where: { id: ids.shop } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [ids.buyer, ids.seller, ids.outsider] } } }).catch(() => undefined);
    await app.close();
  });

  it('materializes one pair, preserves idempotency, pagination, and read monotonicity', async () => {
    await prisma.chatConversation.deleteMany({ where: { participantLowUserId: { in: [ids.buyer, ids.seller, ids.outsider] } } });
    await prisma.shop.deleteMany({ where: { id: ids.shop } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.buyer, ids.seller, ids.outsider] } } });
    await prisma.user.createMany({ data: [ids.buyer, ids.seller, ids.outsider].map((id) => ({ id, email: `${id}@example.test`, displayName: id === ids.buyer ? 'Buyer' : id === ids.seller ? 'Seller' : 'Outsider', status: UserStatus.ACTIVE })) });
    await prisma.shop.create({ data: { id: ids.shop, ownerId: ids.seller, slug: 'chat-postgres-shop', name: 'Chat PostgreSQL Shop', status: ShopStatus.ACTIVE, onboardingStatus: ShopOnboardingStatus.APPROVED } });

    await request(app.getHttpServer()).get(`/api/v1/chat/targets/shops/${ids.shop}`).set(auth('buyer')).expect(200);
    await request(app.getHttpServer()).get('/api/v1/chat/conversations').set(auth('buyer')).expect(200);
    await request(app.getHttpServer()).get('/api/v1/chat/conversations/unread-count').set(auth('buyer')).expect(200);

    const firstClientId = '00000000-0000-4000-8000-000000007011';
    const secondClientId = '00000000-0000-4000-8000-000000007012';
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/chat/messages').set(auth('buyer')).set('Origin', origin).send({ recipientUserId: ids.seller, clientMessageId: firstClientId, content: 'Xin chào shop' }),
      request(app.getHttpServer()).post('/api/v1/chat/messages').set(auth('seller')).set('Origin', origin).send({ recipientUserId: ids.buyer, clientMessageId: secondClientId, content: 'Shop đã nhận tin' }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    conversation = first.body.conversation.id;
    expect(second.body.conversation.id).toBe(conversation);
    expect(await prisma.chatConversation.count({ where: { participantLowUserId: { in: [ids.buyer, ids.seller] }, participantHighUserId: { in: [ids.buyer, ids.seller] } } })).toBe(1);
    expect(await prisma.chatMessage.count({ where: { conversationId: conversation } })).toBe(2);

    const replay = await request(app.getHttpServer()).post('/api/v1/chat/messages').set(auth('buyer')).set('Origin', origin).send({ recipientUserId: ids.seller, clientMessageId: firstClientId, content: 'Xin chào shop' }).expect(200);
    expect(replay.body.message.id).toBe(first.body.message.id);
    await request(app.getHttpServer()).post('/api/v1/chat/messages').set(auth('buyer')).set('Origin', origin).send({ recipientUserId: ids.seller, clientMessageId: firstClientId, content: 'Nội dung khác' }).expect(409);

    await request(app.getHttpServer()).get(`/api/v1/chat/conversations/${conversation}/messages?beforeSequence=3`).set(auth('buyer')).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/chat/conversations/${conversation}/messages?afterSequence=0`).set(auth('buyer')).expect(200);
    await request(app.getHttpServer()).put(`/api/v1/chat/conversations/${conversation}/read`).set(auth('buyer')).set('Origin', origin).send({ throughSequence: 2 }).expect(200);
    await request(app.getHttpServer()).put(`/api/v1/chat/conversations/${conversation}/read`).set(auth('buyer')).set('Origin', origin).send({ throughSequence: 1 }).expect(200);

    await request(app.getHttpServer()).get(`/api/v1/chat/conversations/${conversation}/messages`).set(auth('outsider')).expect(403);
    expect((await prisma.chatMembership.findMany({ where: { conversationId: conversation } })).every((membership) => membership.lastReadSequence >= 0)).toBe(true);
  });
});

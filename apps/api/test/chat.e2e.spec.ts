import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { loadAuthConfig } from '../src/auth/auth.config';
import { AuthenticationFailedError } from '../src/auth/auth.errors';
import { AuthGuard, type AuthenticatedRequest } from '../src/auth/auth.guard';
import { configureApplication } from '../src/configure-application';
import { ChatError } from '../src/chat/chat.errors';
import { ChatOutboxDispatcher } from '../src/chat/chat.realtime';
import { ChatService } from '../src/chat/chat.service';
import { PrismaService } from '../src/prisma/prisma.service';

const userId = '00000000-0000-4000-8000-000000000001';
const otherUserId = '00000000-0000-4000-8000-000000000002';
const shopId = '00000000-0000-4000-8000-000000000003';
const conversationId = '00000000-0000-4000-8000-000000000004';
const clientMessageId = '00000000-0000-4000-8000-000000000005';
const timestamp = '2026-08-27T00:00:00.000Z';

class ChatAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.headers.authorization !== 'Bearer buyer') throw new AuthenticationFailedError();
    request.authUser = {
      id: userId,
      email: 'buyer@example.test',
      displayName: 'Buyer',
      status: 'active',
      roles: ['buyer'],
    };
    request.authSessionId = 'session-1';
    return true;
  }
}

describe('chat HTTP boundaries', () => {
  let app: INestApplication;
  const chat = {
    target: jest.fn(),
    list: jest.fn(),
    unreadCount: jest.fn(),
    messages: jest.fn(),
    send: jest.fn(),
    markRead: jest.fn(),
    issueTicket: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn() })
      .overrideProvider(ChatService)
      .useValue(chat)
      .overrideProvider(ChatOutboxDispatcher)
      .useValue({ onModuleInit: jest.fn(), onModuleDestroy: jest.fn(), flush: jest.fn() })
      .overrideGuard(AuthGuard)
      .useClass(ChatAuthGuard)
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
    chat.target.mockResolvedValue({
      chatVersion: 'chat-v1',
      shopId,
      shopName: 'Shop',
      ownerUserId: otherUserId,
      ownerDisplayName: 'Owner',
      ownerAvatarUrl: null,
      isSelf: false,
      canMessage: true,
    });
    chat.list.mockResolvedValue({
      chatVersion: 'chat-v1',
      items: [],
      nextCursor: null,
      unreadCount: 0,
    });
    chat.unreadCount.mockResolvedValue({ chatVersion: 'chat-v1', unreadCount: 0 });
    chat.messages.mockResolvedValue({
      chatVersion: 'chat-v1',
      conversation: {
        id: conversationId,
        participant: {
          userId: otherUserId,
          displayName: 'Owner',
          avatarUrl: null,
          presence: 'INACTIVE',
        },
        lastMessagePreview: '',
        lastMessageAt: timestamp,
        unreadCount: 0,
        lastReadSequence: 0,
        lastMessageSequence: 0,
      },
      items: [],
      hasMoreBefore: false,
      hasMoreAfter: false,
      unreadCount: 0,
    });
    chat.send.mockResolvedValue({
      chatVersion: 'chat-v1',
      conversation: {
        id: conversationId,
        participant: {
          userId: otherUserId,
          displayName: 'Owner',
          avatarUrl: null,
          presence: 'INACTIVE',
        },
        lastMessagePreview: 'hello',
        lastMessageAt: timestamp,
        unreadCount: 0,
        lastReadSequence: 1,
        lastMessageSequence: 1,
      },
      message: {
        id: clientMessageId,
        conversationId,
        sequence: 1,
        senderUserId: userId,
        clientMessageId,
        content: 'hello',
        createdAt: timestamp,
        deliveryState: 'SENT',
        isRead: true,
      },
    });
    chat.markRead.mockResolvedValue({
      chatVersion: 'chat-v1',
      conversationId,
      throughSequence: 1,
      unreadCount: 0,
      unreadTotal: 0,
      readAt: timestamp,
    });
    chat.issueTicket.mockReturnValue({
      chatVersion: 'chat-v1',
      ticket: 'ticket',
      expiresAt: timestamp,
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('protects every route, applies DTO validation, and forwards typed input', async () => {
    await request(app.getHttpServer()).get('/api/v1/chat/conversations').expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/chat/targets/shops/${shopId}`)
      .set('Authorization', 'Bearer buyer')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/chat/conversations?limit=10&query=Owner')
      .set('Authorization', 'Bearer buyer')
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(chat.list).toHaveBeenCalledWith(userId, { limit: 10, query: 'Owner' });
    await request(app.getHttpServer())
      .get('/api/v1/chat/conversations/unread-count')
      .set('Authorization', 'Bearer buyer')
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/chat/conversations/${conversationId}/messages?beforeSequence=4`)
      .set('Authorization', 'Bearer buyer')
      .expect(200);
    expect(chat.messages).toHaveBeenCalledWith(userId, conversationId, { beforeSequence: 4 });
    await request(app.getHttpServer())
      .post('/api/v1/chat/messages')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000')
      .send({ recipientUserId: otherUserId, clientMessageId, content: 'hello' })
      .expect(200);
    expect(chat.send).toHaveBeenCalledWith(
      userId,
      { recipientUserId: otherUserId, clientMessageId, content: 'hello' },
      expect.any(String),
    );
    await request(app.getHttpServer())
      .post('/api/v1/chat/messages')
      .set('Authorization', 'Bearer buyer')
      .send({ recipientUserId: otherUserId, clientMessageId, content: 'hello' })
      .expect(403);
    await request(app.getHttpServer())
      .put(`/api/v1/chat/conversations/${conversationId}/read`)
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000')
      .send({ throughSequence: 1 })
      .expect(200);
    expect(chat.markRead).toHaveBeenCalledWith(userId, conversationId, 1);
    await request(app.getHttpServer())
      .post('/api/v1/chat/realtime-ticket')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000')
      .expect(200);
    expect(chat.issueTicket).toHaveBeenCalledWith(userId, 'session-1');

    await request(app.getHttpServer())
      .post('/api/v1/chat/messages')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000')
      .send({ recipientUserId: otherUserId, clientMessageId, content: 'hello', unexpected: true })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/chat/conversations')
      .set('Authorization', 'Bearer buyer')
      .expect(200);
    expect(chat.list).toHaveBeenCalledTimes(2);
  });

  it('returns stable participant-scoped problem details without leaking service errors', async () => {
    chat.messages.mockRejectedValueOnce(
      new ChatError('chat-forbidden', 403, 'You are not a participant in this conversation.'),
    );
    const response = await request(app.getHttpServer())
      .get(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set('Authorization', 'Bearer buyer')
      .expect(403);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      status: 403,
      type: 'https://shopee-clone.local/problems/chat-forbidden',
    });
    expect(JSON.stringify(response.body)).not.toContain(conversationId);
  });

  it('rejects malformed identifiers, conflicting cursors, blank content, and unknown fields at the HTTP boundary', async () => {
    chat.target.mockRejectedValueOnce(
      new ChatError('invalid-chat-request', 400, 'Invalid shop id.', ['shopId']),
    );
    await request(app.getHttpServer())
      .get('/api/v1/chat/targets/shops/not-a-uuid')
      .set('Authorization', 'Bearer buyer')
      .expect(400);
    chat.messages.mockRejectedValueOnce(
      new ChatError('invalid-chat-request', 400, 'Use only one message cursor.', [
        'beforeSequence',
        'afterSequence',
      ]),
    );
    await request(app.getHttpServer())
      .get(`/api/v1/chat/conversations/${conversationId}/messages?beforeSequence=2&afterSequence=1`)
      .set('Authorization', 'Bearer buyer')
      .expect(400);
    chat.send.mockRejectedValueOnce(
      new ChatError('invalid-chat-request', 400, 'Invalid chat message.', ['content']),
    );
    await request(app.getHttpServer())
      .post('/api/v1/chat/messages')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000')
      .send({ recipientUserId: otherUserId, clientMessageId, content: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/api/v1/chat/conversations/${conversationId}/read`)
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000')
      .send({ throughSequence: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/chat/messages')
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000')
      .send({ recipientUserId: otherUserId, clientMessageId, content: 'hello', unexpected: true })
      .expect(400);
    await request(app.getHttpServer()).get('/api/v1/chat/conversations').expect(401);
    await request(app.getHttpServer()).post('/api/v1/chat/realtime-ticket').expect(403);
  });

  it('keeps pagination and stale read requests participant-scoped', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/chat/conversations/${conversationId}/messages?limit=2&afterSequence=4`)
      .set('Authorization', 'Bearer buyer')
      .expect(200);
    expect(chat.messages).toHaveBeenCalledWith(userId, conversationId, {
      limit: 2,
      afterSequence: 4,
    });

    chat.markRead.mockImplementation(
      async (_userId: string, _id: string, throughSequence: number) => ({
        chatVersion: 'chat-v1',
        conversationId,
        throughSequence,
        unreadCount: 0,
        unreadTotal: 0,
        readAt: timestamp,
      }),
    );
    await request(app.getHttpServer())
      .put(`/api/v1/chat/conversations/${conversationId}/read`)
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000')
      .send({ throughSequence: 4 })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/api/v1/chat/conversations/${conversationId}/read`)
      .set('Authorization', 'Bearer buyer')
      .set('Origin', 'http://localhost:3000')
      .send({ throughSequence: 2 })
      .expect(200);
    expect(chat.markRead).toHaveBeenLastCalledWith(userId, conversationId, 2);
  });

  it('publishes every authenticated chat operation with bearer security and stable responses', async () => {
    const document = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const paths = document.body.paths as Record<
      string,
      Record<string, { security?: unknown; responses?: Record<string, unknown> }>
    >;
    const expected = [
      ['/api/v1/chat/targets/shops/{shopId}', 'get'],
      ['/api/v1/chat/conversations', 'get'],
      ['/api/v1/chat/conversations/unread-count', 'get'],
      ['/api/v1/chat/conversations/{conversationId}/messages', 'get'],
      ['/api/v1/chat/messages', 'post'],
      ['/api/v1/chat/conversations/{conversationId}/read', 'put'],
      ['/api/v1/chat/realtime-ticket', 'post'],
    ] as const;
    for (const [path, method] of expected) {
      const operation = paths[path]?.[method];
      expect(operation).toBeDefined();
      expect(operation?.security).toEqual(
        expect.arrayContaining([expect.objectContaining({ bearer: [] })]),
      );
      expect(operation?.responses).toEqual(
        expect.objectContaining({
          '200': expect.anything(),
          '400': expect.anything(),
          '401': expect.anything(),
          '403': expect.anything(),
          '404': expect.anything(),
          '409': expect.anything(),
          '429': expect.anything(),
          '503': expect.anything(),
        }),
      );
    }
  });
});

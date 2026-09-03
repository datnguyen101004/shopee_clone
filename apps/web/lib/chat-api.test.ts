import { describe, expect, it, vi } from 'vitest';

import {
  createChatRealtimeTicket,
  getChatMessages,
  getChatUnreadCount,
  listChatConversations,
  markChatRead,
  sendChatMessage,
} from './chat-api';
import type { ChatApiError } from './chat-api';

const userId = '00000000-0000-4000-8000-000000000001';
const otherUserId = '00000000-0000-4000-8000-000000000002';
const conversationId = '00000000-0000-4000-8000-000000000003';
const messageId = '00000000-0000-4000-8000-000000000004';
const timestamp = '2026-08-27T00:00:00.000Z';
const conversation = {
  id: conversationId,
  participant: { userId: otherUserId, displayName: 'Shop Owner', avatarUrl: null, presence: 'INACTIVE' as const },
  lastMessagePreview: 'Xin chào',
  lastMessageAt: timestamp,
  unreadCount: 1,
  lastReadSequence: 0,
  lastMessageSequence: 1,
};
const message = {
  id: messageId,
  conversationId,
  sequence: 1,
  senderUserId: userId,
  clientMessageId: '00000000-0000-4000-8000-000000000005',
  content: 'Xin chào',
  createdAt: timestamp,
  deliveryState: 'SENT' as const,
  isRead: true,
};

describe('chat API boundary', () => {
  it('uses authenticatedFetch, no-store, and parses every successful response', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ chatVersion: 'chat-v1', items: [conversation], nextCursor: null, unreadCount: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ chatVersion: 'chat-v1', conversation, items: [message], hasMoreBefore: false, hasMoreAfter: false, unreadCount: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ chatVersion: 'chat-v1', unreadCount: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ chatVersion: 'chat-v1', conversationId, throughSequence: 1, unreadCount: 0, unreadTotal: 0, readAt: timestamp }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ chatVersion: 'chat-v1', ticket: 'ticket', expiresAt: timestamp }), { status: 200 }));

    await expect(listChatConversations({ query: 'Shop Owner' }, fetcher)).resolves.toMatchObject({ unreadCount: 1 });
    await expect(getChatMessages(conversationId, { beforeSequence: 2 }, fetcher)).resolves.toMatchObject({ items: [message] });
    await expect(getChatUnreadCount(fetcher)).resolves.toBe(1);
    await expect(markChatRead(conversationId, 1, fetcher)).resolves.toMatchObject({ throughSequence: 1 });
    await expect(createChatRealtimeTicket(fetcher)).resolves.toMatchObject({ ticket: 'ticket' });

    expect(fetcher.mock.calls.every(([, init]) => init?.cache === 'no-store')).toBe(true);
    expect(fetcher.mock.calls.map(([url, init]) => [String(url), init?.method])).toEqual([
      [expect.stringContaining('/api/v1/chat/conversations?query=Shop+Owner'), 'GET'],
      [expect.stringContaining(`/api/v1/chat/conversations/${conversationId}/messages?beforeSequence=2`), 'GET'],
      [expect.stringContaining('/api/v1/chat/conversations/unread-count'), 'GET'],
      [expect.stringContaining(`/api/v1/chat/conversations/${conversationId}/read`), 'PUT'],
      [expect.stringContaining('/api/v1/chat/realtime-ticket'), 'POST'],
    ]);
  });

  it('rejects malformed nested payloads and preserves problem details', async () => {
    const malformed = vi.fn().mockResolvedValue(new Response(JSON.stringify({ chatVersion: 'chat-v1', items: [{ id: conversationId }], nextCursor: null, unreadCount: 0 }), { status: 200 }));
    await expect(listChatConversations({}, malformed)).rejects.toMatchObject({ kind: 'contract' });

    const problem = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: 'https://shopee-clone.local/problems/chat-forbidden', title: 'Forbidden', status: 403, detail: 'Not a participant.' }), { status: 403 }));
    await expect(getChatUnreadCount(problem)).rejects.toMatchObject({ kind: 'status', status: 403, problem: expect.objectContaining({ status: 403 }) });
    expect(problem.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
  });

  it('rejects transport failures as recoverable chat errors', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('offline'));
    await expect(sendChatMessage({ recipientUserId: otherUserId, clientMessageId: message.clientMessageId, content: message.content }, fetcher)).rejects.toEqual(expect.objectContaining({ kind: 'transport' } satisfies Partial<ChatApiError>));
  });
});

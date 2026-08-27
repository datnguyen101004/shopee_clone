import { describe, expect, it } from 'vitest';
import { CHAT_MESSAGE_MAX_LENGTH, parseChatConversationListResponse, parseChatMessagePage, parseSendChatMessageRequest, parseChatRealtimeEvent } from '../src/chat';

const user = '00000000-0000-4000-8000-000000000001';
const message = '00000000-0000-4000-8000-000000000002';
const conversation = {
  id: '00000000-0000-4000-8000-000000000003',
  participant: { userId: user, displayName: 'Buyer', avatarUrl: null, presence: 'INACTIVE' },
  lastMessagePreview: 'hello',
  lastMessageAt: '2026-01-01T00:00:00.000Z',
  unreadCount: 0,
  lastReadSequence: 1,
  lastMessageSequence: 1,
};
const acceptedMessage = {
  id: message,
  conversationId: conversation.id,
  sequence: 1,
  senderUserId: user,
  clientMessageId: '00000000-0000-4000-8000-000000000004',
  content: 'hello',
  createdAt: '2026-01-01T00:00:00.000Z',
  deliveryState: 'SENT',
  isRead: true,
};

describe('chat contracts', () => {
  it('rejects unknown request keys and rich payloads', () => {
    expect(parseSendChatMessageRequest({ recipientUserId: user, clientMessageId: message, content: 'hello', extra: true })).toBeNull();
    expect(parseSendChatMessageRequest({ recipientUserId: user, clientMessageId: message, content: { text: 'hello' } })).toBeNull();
  });

  it('enforces text bounds', () => {
    expect(parseSendChatMessageRequest({ recipientUserId: user, clientMessageId: message, content: 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH) })).not.toBeNull();
    expect(parseSendChatMessageRequest({ recipientUserId: user, clientMessageId: message, content: 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1) })).toBeNull();
  });

  it('rejects unsupported or malformed event versions', () => {
    expect(parseChatRealtimeEvent({ eventVersion: 'chat-v0', type: 'chat.presence.updated' })).toBeNull();
    expect(parseChatRealtimeEvent({ eventVersion: 'chat-v1', type: 'chat.presence.updated', userId: user, presence: 'UNKNOWN' })).toBeNull();
  });

  it('rejects malformed nested response payloads instead of trusting casts', () => {
    expect(parseChatConversationListResponse({ chatVersion: 'chat-v1', items: [{ ...conversation, participant: { userId: user } }], nextCursor: null, unreadCount: 0 })).toBeNull();
    expect(parseChatMessagePage({ chatVersion: 'chat-v1', conversation: { id: conversation.id }, items: [acceptedMessage], hasMoreBefore: false, hasMoreAfter: false, unreadCount: 0 })).toBeNull();
    expect(parseChatRealtimeEvent({ eventVersion: 'chat-v1', type: 'chat.conversation.updated', conversation })).not.toBeNull();
    expect(parseChatRealtimeEvent({ eventVersion: 'chat-v1', type: 'chat.conversation.updated', conversation, unexpected: true })).toBeNull();
  });
});

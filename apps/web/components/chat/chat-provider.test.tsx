import type * as ChatApiModule from '../../lib/chat-api';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthSession } from '../auth-session-provider';
import { ChatProvider, useChat } from './chat-provider';
import { createChatRealtimeTicket, getChatMessages, getChatTarget, listChatConversations, markChatRead, sendChatMessage } from '../../lib/chat-api';

const realtime = vi.hoisted(() => {
  const handlers = new Map<string, (payload?: unknown) => void>();
  const socket = {
    auth: {} as Record<string, string>,
    connected: true,
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
  };
  socket.on.mockImplementation((event: string, handler: (payload?: unknown) => void) => {
    handlers.set(event, handler);
    return socket;
  });
  return { handlers, socket };
});

vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));
vi.mock('../../lib/chat-api', async (importOriginal) => {
  const original = await importOriginal<typeof ChatApiModule>();
  return { ...original, createChatRealtimeTicket: vi.fn(), getChatMessages: vi.fn(), getChatTarget: vi.fn(), listChatConversations: vi.fn(), markChatRead: vi.fn(), sendChatMessage: vi.fn() };
});
vi.mock('socket.io-client', () => ({ io: vi.fn(() => realtime.socket) }));

const userA = { id: '00000000-0000-4000-8000-000000000001', email: 'a@example.test', displayName: 'Buyer A', status: 'active' as const, roles: ['buyer' as const] };
const userB = { id: '00000000-0000-4000-8000-000000000002', email: 'b@example.test', displayName: 'Buyer B', status: 'active' as const, roles: ['buyer' as const] };
const shopId = '00000000-0000-4000-8000-000000000010';
const ownerId = '00000000-0000-4000-8000-000000000011';
const clientMessageId = '00000000-0000-4000-8000-000000000012';
const timestamp = '2026-08-27T00:00:00.000Z';

function Probe() {
  const chat = useChat();
  return <div><output>{chat.selectedConversation?.id ?? 'none'}</output><output aria-label="selected presence">{chat.selectedConversation?.participant.presence ?? 'none'}</output><output aria-label="contact presence">{chat.conversations[0]?.participant.presence ?? 'none'}</output><output aria-label="contact-id">{chat.conversations[0]?.id ?? 'none'}</output><output aria-label="unread">{chat.unreadCount}</output><output aria-label="draft">{chat.draft}</output><output aria-label="error">{chat.error}</output><output aria-label="message-count">{chat.messages.length}</output><output aria-label="conversation-count">{chat.conversations.length}</output><output aria-label="delivery-states">{chat.messages.map((message) => message.deliveryState).join(',')}</output><button type="button" onClick={() => void chat.openForShop(shopId)}>Chat now</button><button type="button" onClick={() => chat.setDraft('Xin chào')}>Draft</button><button type="button" onClick={() => void chat.sendDraft()}>Send</button></div>;
}

describe('ChatProvider', () => {
  let authState: ReturnType<typeof useAuthSession>['state'];
  const authenticatedFetch = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    realtime.handlers.clear();
    realtime.socket.connected = true;
    window.sessionStorage.clear();
    authState = { status: 'authenticated', user: userA };
    vi.mocked(useAuthSession).mockImplementation(() => ({ state: authState, authenticatedFetch, sessionFetch: authenticatedFetch, login: vi.fn(), register: vi.fn(), logout: vi.fn(), restore: vi.fn(), completeGoogleSignIn: vi.fn(), synchronizeDisplayName: vi.fn() }) as ReturnType<typeof useAuthSession>);
    vi.mocked(createChatRealtimeTicket).mockResolvedValue({ chatVersion: 'chat-v1', ticket: 'ticket', expiresAt: timestamp });
    vi.mocked(getChatMessages).mockResolvedValue({ chatVersion: 'chat-v1', conversation: { id: '00000000-0000-4000-8000-000000000013', participant: { userId: ownerId, displayName: 'Shop Owner', avatarUrl: null, presence: 'ACTIVE' }, lastMessagePreview: 'Xin chào', lastMessageAt: timestamp, unreadCount: 0, lastReadSequence: 1, lastMessageSequence: 1 }, items: [{ id: clientMessageId, conversationId: '00000000-0000-4000-8000-000000000013', sequence: 1, senderUserId: ownerId, clientMessageId, content: 'Xin chào', createdAt: timestamp, deliveryState: 'SENT', isRead: false }], hasMoreBefore: false, hasMoreAfter: false, unreadCount: 0 });
    vi.mocked(markChatRead).mockResolvedValue({ chatVersion: 'chat-v1', conversationId: '00000000-0000-4000-8000-000000000013', throughSequence: 1, unreadCount: 0, unreadTotal: 0, readAt: timestamp });
    vi.mocked(listChatConversations).mockResolvedValue({ chatVersion: 'chat-v1', items: [], nextCursor: null, unreadCount: 0 });
    vi.mocked(getChatTarget).mockResolvedValue({ chatVersion: 'chat-v1', shopId, shopName: 'Shop', ownerUserId: ownerId, ownerDisplayName: 'Shop Owner', ownerAvatarUrl: null, isSelf: false, canMessage: true });
  });

  it('keeps a first-message target local until the send is accepted', async () => {
    const user = userEvent.setup();
    vi.mocked(sendChatMessage).mockResolvedValue({ chatVersion: 'chat-v1', conversation: { id: '00000000-0000-4000-8000-000000000013', participant: { userId: ownerId, displayName: 'Shop Owner', avatarUrl: null, presence: 'INACTIVE' }, lastMessagePreview: 'Xin chào', lastMessageAt: timestamp, unreadCount: 0, lastReadSequence: 1, lastMessageSequence: 1 }, message: { id: clientMessageId, conversationId: '00000000-0000-4000-8000-000000000013', sequence: 1, senderUserId: userA.id, clientMessageId, content: 'Xin chào', createdAt: timestamp, deliveryState: 'SENT', isRead: true } });
    render(<ChatProvider><Probe /></ChatProvider>);
    await user.click(screen.getByRole('button', { name: 'Chat now' }));
    await waitFor(() => expect(screen.getByText(`new:${ownerId}`)).toBeVisible());
    await user.click(screen.getByRole('button', { name: 'Draft' }));
    expect(window.sessionStorage.getItem(`chat-draft-v1:${userA.id}:${ownerId}`)).toBe('Xin chào');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByLabelText('message-count')).toHaveTextContent('1'));
    expect(sendChatMessage).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: ownerId, content: 'Xin chào' }), expect.any(Function));
  });

  it('clears temporary state when the authenticated account changes', async () => {
    const view = render(<ChatProvider><Probe /></ChatProvider>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Chat now' }));
    await user.click(screen.getByRole('button', { name: 'Draft' }));
    expect(window.sessionStorage.getItem(`chat-draft-v1:${userA.id}:${ownerId}`)).toBe('Xin chào');
    authState = { status: 'authenticated', user: userB };
    view.rerender(<ChatProvider><Probe /></ChatProvider>);
    await waitFor(() => expect(window.sessionStorage.getItem(`chat-draft-v1:${userA.id}:${ownerId}`)).toBeNull());
  });

  it('does not let a message projection overwrite newer active presence', async () => {
    const user = userEvent.setup();
    const conversationId = '00000000-0000-4000-8000-000000000013';
    const activeConversation = {
      id: conversationId,
      participant: { userId: ownerId, displayName: 'Shop Owner', avatarUrl: null, presence: 'ACTIVE' as const },
      lastMessagePreview: 'Xin chào',
      lastMessageAt: timestamp,
      unreadCount: 0,
      lastReadSequence: 1,
      lastMessageSequence: 1,
    };
    const message = { id: clientMessageId, conversationId, sequence: 1, senderUserId: userA.id, clientMessageId, content: 'Xin chào', createdAt: timestamp, deliveryState: 'SENT' as const, isRead: false };
    vi.mocked(sendChatMessage).mockResolvedValue({ chatVersion: 'chat-v1', conversation: activeConversation, message });

    render(<ChatProvider><Probe /></ChatProvider>);
    await user.click(screen.getByRole('button', { name: 'Chat now' }));
    await user.click(screen.getByRole('button', { name: 'Draft' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByLabelText('contact presence')).toHaveTextContent('ACTIVE'));
    await waitFor(() => expect(realtime.handlers.get('chat.message.accepted')).toBeTypeOf('function'));

    act(() => {
      realtime.handlers.get('chat.message.accepted')?.({
        eventVersion: 'chat-v1',
        type: 'chat.message.accepted',
        message,
        conversation: {
          ...activeConversation,
          participant: { ...activeConversation.participant, presence: 'INACTIVE' },
        },
        unreadTotal: 0,
      });
    });

    expect(screen.getByLabelText('contact presence')).toHaveTextContent('ACTIVE');
    expect(screen.getByLabelText('selected presence')).toHaveTextContent('ACTIVE');
  });

  it('marks an unconfirmed attempt failed after three seconds without retransmitting it', async () => {
    vi.useFakeTimers();
    try {
      let resolveSend!: (value: never) => void;
      vi.mocked(sendChatMessage).mockReturnValue(new Promise((resolve) => { resolveSend = resolve; }));
      render(<ChatProvider><Probe /></ChatProvider>);
      fireEvent.click(screen.getByRole('button', { name: 'Chat now' }));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(screen.getByText(`new:${ownerId}`)).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      await act(async () => { vi.advanceTimersByTime(3_001); await Promise.resolve(); });
      expect(screen.getByLabelText('delivery-states')).toHaveTextContent('FAILED');
      expect(sendChatMessage).toHaveBeenCalledTimes(1);
      void resolveSend;
    } finally {
      vi.useRealTimers();
    }
  });

  it('reconciles a late accepted response against the original client attempt', async () => {
    vi.useFakeTimers();
    try {
      let resolveSend!: (value: unknown) => void;
      vi.mocked(sendChatMessage).mockReturnValue(new Promise((resolve) => { resolveSend = resolve; }) as never);
      render(<ChatProvider><Probe /></ChatProvider>);
      fireEvent.click(screen.getByRole('button', { name: 'Chat now' }));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(screen.getByText(`new:${ownerId}`)).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      await act(async () => { vi.advanceTimersByTime(3_001); await Promise.resolve(); });
      resolveSend({ chatVersion: 'chat-v1', conversation: { id: '00000000-0000-4000-8000-000000000013', participant: { userId: ownerId, displayName: 'Shop Owner', avatarUrl: null, presence: 'INACTIVE' }, lastMessagePreview: 'Xin chào', lastMessageAt: timestamp, unreadCount: 0, lastReadSequence: 1, lastMessageSequence: 1 }, message: { id: clientMessageId, conversationId: '00000000-0000-4000-8000-000000000013', sequence: 1, senderUserId: userA.id, clientMessageId, content: 'Xin chào', createdAt: timestamp, deliveryState: 'SENT', isRead: true } });
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByLabelText('delivery-states')).toHaveTextContent('SENT');
      expect(sendChatMessage).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('deduplicates the same realtime message received more than once', async () => {
    const conversationId = '00000000-0000-4000-8000-000000000013';
    const summary = { id: conversationId, participant: { userId: ownerId, displayName: 'Shop Owner', avatarUrl: null, presence: 'ACTIVE' as const }, lastMessagePreview: 'Xin chào', lastMessageAt: timestamp, unreadCount: 0, lastReadSequence: 1, lastMessageSequence: 1 };
    const accepted = { eventVersion: 'chat-v1' as const, type: 'chat.message.accepted' as const, conversation: summary, unreadTotal: 0, message: { id: clientMessageId, conversationId, sequence: 1, senderUserId: ownerId, clientMessageId, content: 'Xin chào', createdAt: timestamp, deliveryState: 'SENT' as const, isRead: false } };
    render(<ChatProvider><Probe /></ChatProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Chat now' }));
    await waitFor(() => expect(realtime.handlers.get('chat.message.accepted')).toBeTypeOf('function'));
    act(() => { realtime.handlers.get('chat.message.accepted')?.(accepted); realtime.handlers.get('chat.message.accepted')?.(accepted); });
    expect(screen.getByLabelText('conversation-count')).toHaveTextContent('1');
  });

  it('backfills after the last known sequence when realtime reconnects', async () => {
    const summary = { id: '00000000-0000-4000-8000-000000000013', participant: { userId: ownerId, displayName: 'Shop Owner', avatarUrl: null, presence: 'ACTIVE' as const }, lastMessagePreview: 'Xin chào', lastMessageAt: timestamp, unreadCount: 0, lastReadSequence: 1, lastMessageSequence: 1 };
    vi.mocked(listChatConversations).mockResolvedValue({ chatVersion: 'chat-v1', items: [summary], nextCursor: null, unreadCount: 0 });
    render(<ChatProvider><Probe /></ChatProvider>);
    await waitFor(() => expect(screen.getByLabelText('contact-id')).toHaveTextContent(summary.id));
    fireEvent.click(screen.getByRole('button', { name: 'Chat now' }));
    await waitFor(() => expect(screen.getByText(summary.id)).toBeVisible());
    await waitFor(() => expect(realtime.handlers.get('connect')).toBeTypeOf('function'));
    vi.mocked(getChatMessages).mockClear();
    act(() => { realtime.handlers.get('connect')?.(); });
    await waitFor(() => expect(getChatMessages).toHaveBeenCalledWith(summary.id, { afterSequence: 1 }, authenticatedFetch));
  });

  it('converges unread totals when another tab publishes a read watermark', async () => {
    const summary = { id: '00000000-0000-4000-8000-000000000013', participant: { userId: ownerId, displayName: 'Shop Owner', avatarUrl: null, presence: 'ACTIVE' as const }, lastMessagePreview: 'Xin chào', lastMessageAt: timestamp, unreadCount: 1, lastReadSequence: 0, lastMessageSequence: 1 };
    vi.mocked(listChatConversations).mockResolvedValue({ chatVersion: 'chat-v1', items: [summary], nextCursor: null, unreadCount: 1 });
    render(<ChatProvider><Probe /></ChatProvider>);
    await waitFor(() => expect(screen.getByLabelText('unread')).toHaveTextContent('1'));
    act(() => { realtime.handlers.get('chat.read.updated')?.({ eventVersion: 'chat-v1', type: 'chat.read.updated', conversationId: summary.id, userId: userA.id, throughSequence: 1, unreadCount: 0, unreadTotal: 0 }); });
    await waitFor(() => expect(screen.getByLabelText('unread')).toHaveTextContent('0'));
  });
});

'use client';

import { parseChatRealtimeEvent, type ChatConversationSummary, type ChatMessage, type ChatTargetResponse } from '@shopee-clone/contracts';
import { io, type Socket } from 'socket.io-client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuthSession } from '../auth-session-provider';
import { ChatApiError, createChatRealtimeTicket, getChatMessages, getChatTarget, listChatConversations, markChatRead, sendChatMessage } from '../../lib/chat-api';

type ChatState = { open: boolean; selectedShop: ChatTargetResponse | null; selectedConversation: ChatConversationSummary | null; conversations: ChatConversationSummary[]; messages: ChatMessage[]; loading: boolean; error: string; unreadCount: number; draft: string; sending: boolean; reconnecting: boolean };
type ChatContextValue = ChatState & { openForShop(shopId: string): Promise<void>; openWidget(): void; closeWidget(): void; selectConversation(conversation: ChatConversationSummary): Promise<void>; markSelectedConversationRead(): Promise<void>; setDraft(value: string): void; sendDraft(): Promise<void>; retry(): Promise<void> };

const initial: ChatState = { open: false, selectedShop: null, selectedConversation: null, conversations: [], messages: [], loading: false, error: '', unreadCount: 0, draft: '', sending: false, reconnecting: false };
const ChatContext = createContext<ChatContextValue>({ ...initial, openForShop: async () => undefined, openWidget: () => undefined, closeWidget: () => undefined, selectConversation: async () => undefined, markSelectedConversationRead: async () => undefined, setDraft: () => undefined, sendDraft: async () => undefined, retry: async () => undefined });
// The API accepts a presence lease as short as 10 seconds. Keep this below
// that minimum so a custom server lease cannot expire between heartbeats.
const CHAT_ACTIVITY_INTERVAL_MS = 5_000;

function preserveRealtimePresence(
  incoming: ChatConversationSummary,
  current: ChatConversationSummary | null | undefined,
): ChatConversationSummary {
  if (!current || current.id !== incoming.id || current.participant.userId !== incoming.participant.userId) return incoming;
  return {
    ...incoming,
    participant: {
      ...incoming.participant,
      presence: current.participant.presence,
    },
  };
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const auth = useAuthSession();
  const [state, setState] = useState<ChatState>(initial);
  const socket = useRef<Socket | null>(null);
  const handoffConsumed = useRef(false);
  const pendingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const widgetHydrated = useRef(false);
  const selectedConversationRef = useRef<ChatConversationSummary | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const loadingRef = useRef(false);
  const previousUserId = useRef<string | null>(null);
  const authStatus = auth.state.status;
  const authenticatedFetch = auth.authenticatedFetch;
  const authenticatedUserId = authStatus === 'authenticated' ? auth.state.user.id : null;
  const loadConversations = useCallback(async () => {
    if (authStatus !== 'authenticated') return;
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await listChatConversations({}, authenticatedFetch);
      setState((current) => ({ ...current, conversations: response.items, unreadCount: response.unreadCount, loading: false }));
    } catch { setState((current) => ({ ...current, loading: false, error: 'Chưa thể tải cuộc trò chuyện. Vui lòng thử lại.' })); }
  }, [authStatus, authenticatedFetch]);

  useEffect(() => {
    selectedConversationRef.current = state.selectedConversation;
    messagesRef.current = state.messages;
    loadingRef.current = state.loading;
  }, [state.selectedConversation, state.messages, state.loading]);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      socket.current?.disconnect(); socket.current = null; setState(initial); return;
    }
    void loadConversations();
    let disposed = false;
    let activityTimer: ReturnType<typeof setInterval> | undefined;
    void createChatRealtimeTicket(authenticatedFetch).then((ticket) => {
      if (disposed) return;
      const next = io(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}/chat`, { auth: { ticket: ticket.ticket }, transports: ['websocket', 'polling'] });
      socket.current = next;
      const sendActivity = () => {
        if (next.connected) next.emit('chat.activity');
      };
      // Keep the server-side presence lease alive while the account remains
      // logged in, even when the user is not actively typing or clicking.
      activityTimer = setInterval(sendActivity, CHAT_ACTIVITY_INTERVAL_MS);
      next.on('chat.message.accepted', (raw: unknown) => {
        const event = parseChatRealtimeEvent(raw);
        if (!event || event.type !== 'chat.message.accepted') return;
        setState((current) => {
          const existing = current.conversations.find((item) => item.id === event.conversation.id);
          const conversation = preserveRealtimePresence(
            event.conversation,
            existing ?? current.selectedConversation,
          );
          return {
            ...current,
            conversations: [conversation, ...current.conversations.filter((item) => item.id !== conversation.id)],
            selectedConversation: current.selectedConversation?.id === conversation.id
              ? preserveRealtimePresence(conversation, current.selectedConversation)
              : current.selectedConversation,
            messages: current.selectedConversation?.id === conversation.id
              ? [...current.messages.filter((message) => message.id !== event.message.id && message.clientMessageId !== event.message.clientMessageId), event.message].sort((a, b) => a.sequence - b.sequence)
              : current.messages,
            unreadCount: event.unreadTotal,
          };
        });
      });
      next.on('chat.conversation.updated', (raw: unknown) => {
        const event = parseChatRealtimeEvent(raw);
        if (!event || event.type !== 'chat.conversation.updated') return;
        setState((current) => {
          const existing = current.conversations.find((item) => item.id === event.conversation.id);
          const conversation = preserveRealtimePresence(
            event.conversation,
            existing ?? current.selectedConversation,
          );
          return {
            ...current,
            conversations: [conversation, ...current.conversations.filter((item) => item.id !== conversation.id)],
            selectedConversation: current.selectedConversation?.id === conversation.id
              ? preserveRealtimePresence(conversation, current.selectedConversation)
              : current.selectedConversation,
          };
        });
      });
      next.on('chat.read.updated', (raw: unknown) => {
        const event = parseChatRealtimeEvent(raw);
        if (!event || event.type !== 'chat.read.updated') return;
        setState((current) => ({ ...current, conversations: current.conversations.map((item) => item.id === event.conversationId ? { ...item, unreadCount: event.userId === authenticatedUserId ? event.unreadCount : item.unreadCount, lastReadSequence: event.userId === authenticatedUserId ? Math.max(item.lastReadSequence, event.throughSequence) : item.lastReadSequence } : item), messages: current.selectedConversation?.id === event.conversationId ? current.messages.map((message) => event.userId !== authenticatedUserId && message.senderUserId === authenticatedUserId && message.sequence <= event.throughSequence ? { ...message, isRead: true } : message) : current.messages, unreadCount: event.userId === authenticatedUserId ? event.unreadTotal : current.unreadCount }));
      });
      next.on('chat.unread.updated', (raw: unknown) => {
        const event = parseChatRealtimeEvent(raw);
        if (!event) return;
        if (event.type !== 'chat.unread.updated') return;
        setState((current) => ({ ...current, conversations: current.conversations.map((item) => item.id === event.conversationId ? { ...item, unreadCount: event.unreadCount } : item), unreadCount: event.unreadTotal }));
      });
      next.on('chat.presence.updated', (raw: unknown) => {
        const event = parseChatRealtimeEvent(raw);
        if (!event || event.type !== 'chat.presence.updated') return;
        const withPresence = (item: ChatConversationSummary) => item.participant.userId === event.userId ? { ...item, participant: { ...item.participant, presence: event.presence } } : item;
        setState((current) => ({ ...current, conversations: current.conversations.map(withPresence), selectedConversation: current.selectedConversation ? withPresence(current.selectedConversation) : null }));
      });
      next.on('connect', () => {
        sendActivity();
        setState((current) => ({ ...current, reconnecting: false }));
        void loadConversations();
        const selected = selectedConversationRef.current;
        if (!selected || selected.id.startsWith('new:')) return;
        const lastSequence = messagesRef.current.reduce((max, message) => Math.max(max, message.sequence), 0);
        void getChatMessages(selected.id, lastSequence > 0 ? { afterSequence: lastSequence } : {}, authenticatedFetch).then((page) => {
          setState((current) => ({ ...current, selectedConversation: page.conversation, messages: [...current.messages, ...page.items].filter((message, index, all) => all.findIndex((candidate) => candidate.id === message.id || candidate.clientMessageId === message.clientMessageId) === index).sort((a, b) => a.sequence - b.sequence) }));
        }).catch(() => undefined);
      });
      next.on('connect_error', () => {
        setState((current) => ({ ...current, reconnecting: true }));
        void createChatRealtimeTicket(authenticatedFetch).then((fresh) => { next.auth = { ticket: fresh.ticket }; next.connect(); }).catch(() => undefined);
      });
      next.on('disconnect', () => setState((current) => ({ ...current, reconnecting: true })));
    }).catch(() => undefined);
    return () => {
      disposed = true;
      if (activityTimer) clearInterval(activityTimer);
      socket.current?.disconnect();
      socket.current = null;
    };
  }, [authStatus, authenticatedFetch, authenticatedUserId, loadConversations]);

  useEffect(() => {
    const currentUserId = authenticatedUserId;
    if (previousUserId.current && previousUserId.current !== currentUserId) {
      try {
        const oldWidgetKey = `chat-widget-v1:${previousUserId.current}`;
        window.sessionStorage.removeItem(oldWidgetKey);
        const oldDraftPrefix = `chat-draft-v1:${previousUserId.current}:`;
        for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
          const key = window.sessionStorage.key(index);
          if (key?.startsWith(oldDraftPrefix)) window.sessionStorage.removeItem(key);
        }
      } catch { /* storage is optional */ }
      for (const timer of pendingTimers.current.values()) clearTimeout(timer);
      pendingTimers.current.clear();
    }
    previousUserId.current = currentUserId;
    if (authStatus !== 'authenticated') { widgetHydrated.current = false; handoffConsumed.current = false; setState(initial); return; }
    if (!widgetHydrated.current) {
      widgetHydrated.current = true;
      try { if (authenticatedUserId && window.sessionStorage.getItem(`chat-widget-v1:${authenticatedUserId}`) === 'open') setState((current) => ({ ...current, open: true })); } catch { /* storage is optional */ }
    }
  }, [authStatus, authenticatedUserId]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !widgetHydrated.current || !authenticatedUserId) return;
    try { window.sessionStorage.setItem(`chat-widget-v1:${authenticatedUserId}`, state.open ? 'open' : 'closed'); } catch { /* storage is optional */ }
  }, [authStatus, authenticatedUserId, state.open]);

  const openForShop = useCallback(async (shopId: string) => {
    if (auth.state.status !== 'authenticated') {
      const returnPath = `${window.location.pathname}${window.location.search}`;
      window.sessionStorage.setItem('chat-handoff-v1', JSON.stringify({ shopId, returnPath, source: 'shop-action' }));
      // The provider can also be mounted outside Next's router in tests/embedded shells.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/login?returnTo=${encodeURIComponent(returnPath)}`);
      return;
    }
    setState((current) => ({ ...current, open: true, loading: true, error: '' }));
    try {
      const target = await getChatTarget(shopId, auth.authenticatedFetch);
      if (!target.canMessage) { setState((current) => ({ ...current, selectedShop: target, loading: false })); return; }
      const existing = state.conversations.find((item) => item.participant.userId === target.ownerUserId);
      if (existing) await selectConversation(existing);
      else setState((current) => ({ ...current, selectedShop: target, selectedConversation: { id: `new:${target.ownerUserId}`, shopName: target.shopName, participant: { userId: target.ownerUserId, displayName: target.ownerDisplayName, avatarUrl: target.ownerAvatarUrl, presence: 'INACTIVE' }, lastMessagePreview: '', lastMessageAt: new Date().toISOString(), unreadCount: 0, lastReadSequence: 0, lastMessageSequence: 0 }, messages: [], loading: false }));
    } catch (error) { setState((current) => ({ ...current, loading: false, error: error instanceof ChatApiError && error.status === 403 ? 'Bạn không thể mở cuộc trò chuyện này.' : 'Chưa thể tải thông tin shop. Vui lòng thử lại.' })); }
  // selectConversation is declared immediately below; keeping the target callback stable
  // against conversation list updates avoids reconnecting the widget on every list refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, state.conversations]);

  useEffect(() => {
    if (auth.state.status !== 'authenticated' || handoffConsumed.current) return;
    handoffConsumed.current = true;
    try {
      const raw = window.sessionStorage.getItem('chat-handoff-v1');
      if (!raw) return;
      window.sessionStorage.removeItem('chat-handoff-v1');
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (typeof value.shopId === 'string' && typeof value.returnPath === 'string' && value.returnPath.startsWith('/')) void openForShop(value.shopId);
    } catch { window.sessionStorage.removeItem('chat-handoff-v1'); }
  }, [auth.state.status, openForShop]);

  const selectConversation = useCallback(async (conversation: ChatConversationSummary) => {
    setState((current) => ({ ...current, open: true, selectedConversation: conversation, selectedShop: null, loading: true, error: '' }));
    try { const page = await getChatMessages(conversation.id, {}, auth.authenticatedFetch); let draft = ''; try { draft = window.sessionStorage.getItem(`chat-draft-v1:${auth.state.status === 'authenticated' ? auth.state.user.id : 'guest'}:${conversation.participant.userId}`) ?? ''; } catch { /* storage is optional */ } setState((current) => ({ ...current, messages: page.items, selectedConversation: page.conversation, draft, loading: false })); const last = page.items.at(-1); if (last) { void markChatRead(conversation.id, last.sequence, auth.authenticatedFetch); setState((current) => ({ ...current, conversations: current.conversations.map((item) => item.id === conversation.id ? { ...item, unreadCount: 0, lastReadSequence: last.sequence } : item), unreadCount: Math.max(0, current.unreadCount - page.conversation.unreadCount) })); } }
    catch { setState((current) => ({ ...current, loading: false, error: 'Chưa thể tải tin nhắn. Vui lòng thử lại.' })); }
  }, [auth]);

  const markSelectedConversationRead = useCallback(async () => {
    if (auth.state.status !== 'authenticated') return;
    const conversation = selectedConversationRef.current;
    if (!conversation || conversation.id.startsWith('new:') || loadingRef.current) return;
    const throughSequence = messagesRef.current.reduce(
      (highest, message) => Math.max(highest, message.sequence),
      0,
    );
    if (throughSequence <= conversation.lastReadSequence) return;
    try {
      const response = await markChatRead(
        conversation.id,
        throughSequence,
        auth.authenticatedFetch,
      );
      setState((current) => {
        if (current.selectedConversation?.id !== response.conversationId) return current;
        return {
          ...current,
          selectedConversation: {
            ...current.selectedConversation,
            unreadCount: response.unreadCount,
            lastReadSequence: Math.max(
              current.selectedConversation.lastReadSequence,
              response.throughSequence,
            ),
          },
          conversations: current.conversations.map((item) =>
            item.id === response.conversationId
              ? {
                  ...item,
                  unreadCount: response.unreadCount,
                  lastReadSequence: Math.max(item.lastReadSequence, response.throughSequence),
                }
              : item,
          ),
          unreadCount: response.unreadTotal,
        };
      });
    } catch {
      // A later click or realtime refresh can retry the authoritative read update.
    }
  }, [auth]);

  const sendDraft = useCallback(async () => {
    const conversation = state.selectedConversation;
    const content = state.draft.trim();
    if (!conversation || !content || state.sending || auth.state.status !== 'authenticated') return;
    const messageId = crypto.randomUUID();
    setState((current) => ({ ...current, draft: '', sending: true, messages: [...current.messages, { id: messageId, conversationId: conversation.id, sequence: 0, senderUserId: auth.state.status === 'authenticated' ? auth.state.user.id : '', clientMessageId: messageId, content, createdAt: new Date().toISOString(), deliveryState: 'PENDING', isRead: false }] }));
    pendingTimers.current.set(messageId, setTimeout(() => setState((current) => ({ ...current, sending: false, error: 'Tin nhắn chưa được xác nhận sau 3 giây. Bạn có thể thử gửi lại.', messages: current.messages.map((item) => item.clientMessageId === messageId ? { ...item, deliveryState: 'FAILED' as const } : item) })), 3_000));
    try { const response = await sendChatMessage({ recipientUserId: conversation.participant.userId, clientMessageId: messageId, content }, auth.authenticatedFetch); const timer = pendingTimers.current.get(messageId); if (timer) clearTimeout(timer); pendingTimers.current.delete(messageId); setState((current) => ({ ...current, sending: false, conversations: [response.conversation, ...current.conversations.filter((item) => item.id !== response.conversation.id)], messages: current.messages.map((item) => item.clientMessageId === messageId ? response.message : item), selectedConversation: response.conversation })); }
    catch { const timer = pendingTimers.current.get(messageId); if (timer) clearTimeout(timer); pendingTimers.current.delete(messageId); setState((current) => ({ ...current, sending: false, error: 'Không thể gửi tin nhắn. Nội dung vẫn được giữ để thử lại.', messages: current.messages.map((item) => item.clientMessageId === messageId ? { ...item, deliveryState: 'FAILED' as const } : item) })); }
  }, [auth, state]);

  useEffect(() => {
    if (auth.state.status !== 'authenticated' || !state.selectedConversation) return;
    try {
      const key = `chat-draft-v1:${auth.state.user.id}:${state.selectedConversation.participant.userId}`;
      if (state.draft) window.sessionStorage.setItem(key, state.draft);
      else window.sessionStorage.removeItem(key);
    } catch { /* storage is optional */ }
  }, [auth.state, state.draft, state.selectedConversation]);

  const value = useMemo(() => ({ ...state, openForShop, openWidget: () => setState((current) => ({ ...current, open: true })), closeWidget: () => setState((current) => ({ ...current, open: false })), selectConversation, markSelectedConversationRead, setDraft: (draft: string) => setState((current) => ({ ...current, draft })), sendDraft, retry: loadConversations }), [loadConversations, markSelectedConversationRead, openForShop, selectConversation, sendDraft, state]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() { return useContext(ChatContext); }

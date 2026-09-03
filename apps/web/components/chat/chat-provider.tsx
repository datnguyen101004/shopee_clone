'use client';

import {
  isSafeAuthReturnTo,
  parseChatRealtimeEvent,
  type ChatConversationSummary,
  type ChatMessage,
  type ChatReportReceipt,
  type ChatReplyReference,
  type ChatTargetResponse,
} from '@shopee-clone/contracts';
import { io, type Socket } from 'socket.io-client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuthSession } from '../auth-session-provider';
import {
  ChatApiError,
  createChatRealtimeTicket,
  getChatMessages,
  getChatTarget,
  listChatConversations,
  markChatRead,
  blockChatUser,
  muteChatConversation,
  reportChat,
  unblockChatUser,
  unmuteChatConversation,
  updateChatAttention,
  sendChatMessage,
} from '../../lib/chat-api';

type ChatState = {
  open: boolean;
  selectedShop: ChatTargetResponse | null;
  selectedConversation: ChatConversationSummary | null;
  conversations: ChatConversationSummary[];
  messages: ChatMessage[];
  loading: boolean;
  historyLoading: boolean;
  olderLoading: boolean;
  error: string;
  listError: string;
  historyError: string;
  olderError: string;
  unreadCount: number;
  draft: string;
  sending: boolean;
  reconnecting: boolean;
  hasMoreBefore: boolean;
  oldestSequence: number | null;
  replyTo: ChatReplyReference | null;
};

type ChatContextValue = ChatState & {
  openForShop(shopId: string): Promise<void>;
  openWidget(): void;
  closeWidget(): void;
  selectConversation(conversation: ChatConversationSummary): Promise<void>;
  loadOlderMessages(): Promise<void>;
  loadReplyTarget(
    reference: Pick<ChatReplyReference, 'messageId' | 'sequence'>,
  ): Promise<'loaded' | 'unavailable' | 'error'>;
  markSelectedConversationRead(): Promise<void>;
  setDraft(value: string): void;
  sendDraft(): Promise<void>;
  retry(): Promise<void>;
  toggleMute(conversationId: string, muted: boolean): Promise<void>;
  toggleBlock(userId: string, blocked: boolean): Promise<void>;
  setReplyTo(reply: ChatReplyReference | null): void;
  openConversationFromNotification(conversationId: string, newestSequence?: number): Promise<boolean>;
  reportMessage(input: { conversationId: string; messageId?: string | null; reasonCode: string; details?: string | null }): Promise<ChatReportReceipt | null>;
};

const initial: ChatState = {
  open: false,
  selectedShop: null,
  selectedConversation: null,
  conversations: [],
  messages: [],
  loading: false,
  historyLoading: false,
  olderLoading: false,
  error: '',
  listError: '',
  historyError: '',
  olderError: '',
  unreadCount: 0,
  draft: '',
  sending: false,
  reconnecting: false,
  hasMoreBefore: false,
  oldestSequence: null,
  replyTo: null,
};

const ChatContext = createContext<ChatContextValue>({
  ...initial,
  openForShop: async () => undefined,
  openWidget: () => undefined,
  closeWidget: () => undefined,
  selectConversation: async () => undefined,
  loadOlderMessages: async () => undefined,
  loadReplyTarget: async () => 'unavailable',
  markSelectedConversationRead: async () => undefined,
  setDraft: () => undefined,
  sendDraft: async () => undefined,
  retry: async () => undefined,
  toggleMute: async () => undefined,
  toggleBlock: async () => undefined,
  setReplyTo: () => undefined,
  openConversationFromNotification: async () => false,
  reportMessage: async () => null,
});
const CHAT_ACTIVITY_INTERVAL_MS = 5_000;
const HANDOFF_MAX_AGE_MS = 10 * 60_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function preserveRealtimePresence(
  incoming: ChatConversationSummary,
  current: ChatConversationSummary | null | undefined,
): ChatConversationSummary {
  if (
    !current ||
    current.id !== incoming.id ||
    current.participant.userId !== incoming.participant.userId
  )
    return incoming;
  return {
    ...incoming,
    participant: { ...incoming.participant, presence: current.participant.presence },
  };
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const merged = [...current];
  for (const message of incoming) {
    const index = merged.findIndex(
      (candidate) =>
        candidate.id === message.id ||
        candidate.clientMessageId === message.clientMessageId ||
        (message.sequence > 0 && candidate.sequence === message.sequence),
    );
    if (index >= 0) merged[index] = message;
    else merged.push(message);
  }
  return merged.sort((a, b) => a.sequence - b.sequence || a.createdAt.localeCompare(b.createdAt));
}

function isValidChatHandoff(
  value: unknown,
): value is { shopId: string; returnPath: string; source: 'shop-action'; createdAt: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    uuid.test(String(candidate.shopId)) &&
    typeof candidate.returnPath === 'string' &&
    isSafeAuthReturnTo(candidate.returnPath) &&
    candidate.source === 'shop-action' &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    Date.now() - candidate.createdAt >= 0 &&
    Date.now() - candidate.createdAt <= HANDOFF_MAX_AGE_MS
  );
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const auth = useAuthSession();
  const [state, setState] = useState<ChatState>(initial);
  const socket = useRef<Socket | null>(null);
  const handoffConsumed = useRef(false);
  const pendingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingAttempts = useRef(
    new Map<
      string,
      { content: string; conversationId: string; afterClearRevision: number; failed: boolean }
    >(),
  );
  const widgetHydrated = useRef(false);
  const selectedConversationRef = useRef<ChatConversationSummary | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const loadingRef = useRef(false);
  const olderLoadingRef = useRef(false);
  const hasMoreBeforeRef = useRef(false);
  const oldestSequenceRef = useRef<number | null>(null);
  const draftRevisionRef = useRef(0);
  const previousUserId = useRef<string | null>(null);
  const clientInstanceId = useRef<string>('');
  const attentionEngaged = useRef(false);
  const authStatus = auth.state.status;
  const authenticatedFetch = auth.authenticatedFetch;
  const authenticatedUserId = authStatus === 'authenticated' ? auth.state.user.id : null;

  useEffect(() => {
    try {
      const key = 'chat-client-instance-v1';
      const existing = window.sessionStorage.getItem(key);
      clientInstanceId.current = existing ?? crypto.randomUUID();
      if (!existing) window.sessionStorage.setItem(key, clientInstanceId.current);
    } catch {
      clientInstanceId.current = crypto.randomUUID();
    }
  }, []);

  const loadConversations = useCallback(async () => {
    if (authStatus !== 'authenticated') return;
    setState((current) => ({ ...current, loading: true, listError: '', error: '' }));
    try {
      const response = await listChatConversations({}, authenticatedFetch);
      setState((current) => ({
        ...current,
        conversations: response.items,
        unreadCount: response.unreadCount,
        loading: false,
        listError: '',
      }));
    } catch {
      setState((current) => ({
        ...current,
        loading: false,
        listError: 'Chưa thể tải cuộc trò chuyện. Vui lòng thử lại.',
      }));
    }
  }, [authStatus, authenticatedFetch]);

  useEffect(() => {
    selectedConversationRef.current = state.selectedConversation;
    messagesRef.current = state.messages;
    loadingRef.current = state.loading || state.historyLoading;
    hasMoreBeforeRef.current = state.hasMoreBefore;
    oldestSequenceRef.current = state.oldestSequence;
  }, [
    state.selectedConversation,
    state.messages,
    state.loading,
    state.historyLoading,
    state.hasMoreBefore,
    state.oldestSequence,
  ]);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      socket.current?.disconnect();
      socket.current = null;
      setState(initial);
      return;
    }
    void loadConversations();
    let disposed = false;
    let activityTimer: ReturnType<typeof setInterval> | undefined;
    void createChatRealtimeTicket(authenticatedFetch)
      .then((ticket) => {
        if (disposed) return;
        const next = io(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'}/chat`, {
          auth: { ticket: ticket.ticket },
          transports: ['websocket', 'polling'],
        });
        socket.current = next;
        const sendActivity = () => {
          if (next.connected) next.emit('chat.activity');
        };
        activityTimer = setInterval(sendActivity, CHAT_ACTIVITY_INTERVAL_MS);
        next.on('chat.message.accepted', (raw: unknown) => {
          const event = parseChatRealtimeEvent(raw);
          if (!event || event.type !== 'chat.message.accepted') return;
          const attempt = pendingAttempts.current.get(event.message.clientMessageId);
          if (attempt) {
            const timer = pendingTimers.current.get(event.message.clientMessageId);
            if (timer) clearTimeout(timer);
            pendingTimers.current.delete(event.message.clientMessageId);
            pendingAttempts.current.delete(event.message.clientMessageId);
          }
          setState((current) => {
            const existing = current.conversations.find(
              (item) => item.id === event.conversation.id,
            );
            const conversation = preserveRealtimePresence(
              event.conversation,
              existing ?? current.selectedConversation,
            );
            const selected =
              current.selectedConversation?.id === conversation.id
                ? preserveRealtimePresence(conversation, current.selectedConversation)
                : current.selectedConversation;
            return {
              ...current,
              sending: attempt ? false : current.sending,
              conversations: [
                conversation,
                ...current.conversations.filter((item) => item.id !== conversation.id),
              ],
              selectedConversation: selected,
              messages: selected
                ? mergeMessages(current.messages, [event.message])
                : current.messages,
              unreadCount: event.unreadTotal,
            };
          });
        });
        next.on('chat.conversation.updated', (raw: unknown) => {
          const event = parseChatRealtimeEvent(raw);
          if (!event || event.type !== 'chat.conversation.updated') return;
          setState((current) => {
            const existing = current.conversations.find(
              (item) => item.id === event.conversation.id,
            );
            const conversation = preserveRealtimePresence(
              event.conversation,
              existing ?? current.selectedConversation,
            );
            return {
              ...current,
              conversations: [
                conversation,
                ...current.conversations.filter((item) => item.id !== conversation.id),
              ],
              selectedConversation:
                current.selectedConversation?.id === conversation.id
                  ? preserveRealtimePresence(conversation, current.selectedConversation)
                  : current.selectedConversation,
            };
          });
        });
        next.on('chat.read.updated', (raw: unknown) => {
          const event = parseChatRealtimeEvent(raw);
          if (!event || event.type !== 'chat.read.updated') return;
          setState((current) => ({
            ...current,
            conversations: current.conversations.map((item) =>
              item.id === event.conversationId
                ? {
                    ...item,
                    unreadCount:
                      event.userId === authenticatedUserId ? event.unreadCount : item.unreadCount,
                    lastReadSequence:
                      event.userId === authenticatedUserId
                        ? Math.max(item.lastReadSequence, event.throughSequence)
                        : item.lastReadSequence,
                  }
                : item,
            ),
            messages:
              current.selectedConversation?.id === event.conversationId
                ? current.messages.map((message) =>
                    event.userId !== authenticatedUserId &&
                    message.senderUserId === authenticatedUserId &&
                    message.sequence <= event.throughSequence
                      ? { ...message, isRead: true }
                      : message,
                  )
                : current.messages,
            unreadCount:
              event.userId === authenticatedUserId ? event.unreadTotal : current.unreadCount,
          }));
        });
        next.on('chat.unread.updated', (raw: unknown) => {
          const event = parseChatRealtimeEvent(raw);
          if (!event || event.type !== 'chat.unread.updated') return;
          setState((current) => ({
            ...current,
            conversations: current.conversations.map((item) =>
              item.id === event.conversationId ? { ...item, unreadCount: event.unreadCount } : item,
            ),
            unreadCount: event.unreadTotal,
          }));
        });
        next.on('chat.presence.updated', (raw: unknown) => {
          const event = parseChatRealtimeEvent(raw);
          if (!event || event.type !== 'chat.presence.updated') return;
          const withPresence = (item: ChatConversationSummary) =>
            item.participant.userId === event.userId
              ? { ...item, participant: { ...item.participant, presence: event.presence } }
              : item;
          setState((current) => ({
            ...current,
            conversations: current.conversations.map(withPresence),
            selectedConversation: current.selectedConversation
              ? withPresence(current.selectedConversation)
              : null,
          }));
        });
        next.on('chat.safety.updated', (raw: unknown) => {
          const event = parseChatRealtimeEvent(raw);
          if (!event || event.type !== 'chat.safety.updated') return;
          setState((current) => {
            const existing = current.conversations.find((item) => item.id === event.conversation.id);
            const conversation = preserveRealtimePresence(
              event.conversation,
              existing ?? current.selectedConversation,
            );
            return {
              ...current,
              conversations: [
                conversation,
                ...current.conversations.filter((item) => item.id !== conversation.id),
              ],
              selectedConversation:
                current.selectedConversation?.id === conversation.id
                  ? preserveRealtimePresence(conversation, current.selectedConversation)
                  : current.selectedConversation,
            };
          });
        });
        next.on('chat.notification.updated', (raw: unknown) => {
          const event = parseChatRealtimeEvent(raw);
          if (!event || event.type !== 'chat.notification.updated') return;
          window.dispatchEvent(new Event('chat-notification-sync'));
        });
        next.on('connect', () => {
          sendActivity();
          setState((current) => ({ ...current, reconnecting: false }));
          void loadConversations();
          const selected = selectedConversationRef.current;
          if (!selected || selected.id.startsWith('new:')) return;
          const lastSequence = messagesRef.current.reduce(
            (max, message) => Math.max(max, message.sequence),
            0,
          );
          void getChatMessages(
            selected.id,
            lastSequence > 0 ? { afterSequence: lastSequence } : {},
            authenticatedFetch,
          )
            .then((page) => {
              setState((current) => ({
                ...current,
                selectedConversation: preserveRealtimePresence(
                  page.conversation,
                  current.selectedConversation,
                ),
                messages: mergeMessages(current.messages, page.items),
                hasMoreBefore: current.hasMoreBefore || page.hasMoreBefore,
                oldestSequence: current.oldestSequence ?? page.items[0]?.sequence ?? null,
              }));
            })
            .catch(() => undefined);
        });
        next.on('connect_error', () => {
          setState((current) => ({ ...current, reconnecting: true }));
          void createChatRealtimeTicket(authenticatedFetch)
            .then((fresh) => {
              next.auth = { ticket: fresh.ticket };
              next.connect();
            })
            .catch(() => undefined);
        });
        next.on('disconnect', () => setState((current) => ({ ...current, reconnecting: true })));
      })
      .catch(() => undefined);
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
        window.sessionStorage.removeItem(`chat-widget-v1:${previousUserId.current}`);
        const oldDraftPrefix = `chat-draft-v1:${previousUserId.current}:`;
        for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
          const key = window.sessionStorage.key(index);
          if (key?.startsWith(oldDraftPrefix)) window.sessionStorage.removeItem(key);
        }
      } catch {
        /* storage is optional */
      }
      for (const timer of pendingTimers.current.values()) clearTimeout(timer);
      pendingTimers.current.clear();
      pendingAttempts.current.clear();
    }
    previousUserId.current = currentUserId;
    if (authStatus !== 'authenticated') {
      widgetHydrated.current = false;
      handoffConsumed.current = false;
      setState(initial);
      return;
    }
    if (!widgetHydrated.current) {
      widgetHydrated.current = true;
      try {
        if (
          authenticatedUserId &&
          window.sessionStorage.getItem(`chat-widget-v1:${authenticatedUserId}`) === 'open'
        )
          setState((current) => ({ ...current, open: true }));
      } catch {
        /* storage is optional */
      }
    }
  }, [authStatus, authenticatedUserId]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !widgetHydrated.current || !authenticatedUserId) return;
    try {
      window.sessionStorage.setItem(
        `chat-widget-v1:${authenticatedUserId}`,
        state.open ? 'open' : 'closed',
      );
    } catch {
      /* storage is optional */
    }
  }, [authStatus, authenticatedUserId, state.open]);

  useEffect(() => {
    const conversation = state.selectedConversation;
    if (
      authStatus !== 'authenticated' ||
      !state.open ||
      !conversation ||
      conversation.id.startsWith('new:') ||
      !attentionEngaged.current ||
      !clientInstanceId.current
    )
      return;
    const refresh = () =>
      void updateChatAttention(
        conversation.id,
        { clientInstanceId: clientInstanceId.current, engagedAtNewestRegion: true },
        authenticatedFetch,
      ).catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      window.clearInterval(timer);
      void updateChatAttention(
        conversation.id,
        { clientInstanceId: clientInstanceId.current, engagedAtNewestRegion: false },
        authenticatedFetch,
      ).catch(() => undefined);
    };
  }, [authStatus, authenticatedFetch, state.open, state.selectedConversation]);

  const selectConversation = useCallback(
    async (conversation: ChatConversationSummary) => {
      attentionEngaged.current = false;
      hasMoreBeforeRef.current = false;
      oldestSequenceRef.current = null;
      let draft = '';
      if (auth.state.status === 'authenticated') {
        try {
          draft =
            window.sessionStorage.getItem(
              `chat-draft-v1:${auth.state.user.id}:${conversation.participant.userId}`,
            ) ?? '';
        } catch {
          /* storage is optional */
        }
      }
      draftRevisionRef.current += 1;
      setState((current) => ({
        ...current,
        open: true,
        selectedConversation: conversation,
        selectedShop: null,
        draft,
        replyTo: null,
        messages: conversation.id.startsWith('new:') ? [] : current.messages,
        loading: !conversation.id.startsWith('new:'),
        historyLoading: !conversation.id.startsWith('new:'),
        historyError: '',
        olderError: '',
        hasMoreBefore: false,
        oldestSequence: null,
      }));
      if (conversation.id.startsWith('new:')) return;
      try {
        const page = await getChatMessages(conversation.id, {}, auth.authenticatedFetch);
        const oldest = page.items[0]?.sequence ?? null;
        hasMoreBeforeRef.current = page.hasMoreBefore;
        oldestSequenceRef.current = oldest;
        setState((current) => ({
          ...current,
          messages: page.items,
          selectedConversation: preserveRealtimePresence(
            page.conversation,
            current.selectedConversation,
          ),
          loading: false,
          historyLoading: false,
          historyError: '',
          hasMoreBefore: page.hasMoreBefore,
          oldestSequence: oldest,
        }));
        attentionEngaged.current = true;
        const throughSequence = page.items.reduce(
          (highest, message) => Math.max(highest, message.sequence),
          0,
        );
        if (throughSequence > page.conversation.lastReadSequence) {
          try {
            const read = await markChatRead(
              conversation.id,
              throughSequence,
              auth.authenticatedFetch,
            );
            setState((current) => ({
              ...current,
              selectedConversation:
                current.selectedConversation?.id === conversation.id
                  ? {
                      ...current.selectedConversation,
                      unreadCount: read.unreadCount,
                      lastReadSequence: Math.max(
                        current.selectedConversation.lastReadSequence,
                        read.throughSequence,
                      ),
                    }
                  : current.selectedConversation,
              conversations: current.conversations.map((item) =>
                item.id === conversation.id
                  ? {
                      ...item,
                      unreadCount: read.unreadCount,
                      lastReadSequence: Math.max(item.lastReadSequence, read.throughSequence),
                    }
                  : item,
              ),
              unreadCount: read.unreadTotal,
            }));
          } catch {
            /* explicit engagement will retry the read watermark */
          }
        }
      } catch {
        setState((current) => ({
          ...current,
          loading: false,
          historyLoading: false,
          historyError: 'Chưa thể tải tin nhắn. Vui lòng thử lại.',
        }));
      }
    },
    [auth],
  );

  const openForShop = useCallback(
    async (shopId: string) => {
      if (auth.state.status !== 'authenticated') {
        const returnPath = `${window.location.pathname}${window.location.search}`;
        try {
          window.sessionStorage.setItem(
            'chat-handoff-v1',
            JSON.stringify({ shopId, returnPath, source: 'shop-action', createdAt: Date.now() }),
          );
        } catch {
          /* storage is optional */
        }
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/login?returnTo=${encodeURIComponent(returnPath)}`);
        return;
      }
      setState((current) => ({ ...current, open: true, loading: true, error: '', listError: '' }));
      try {
        const target = await getChatTarget(shopId, auth.authenticatedFetch);
        if (target.canMessage === false && !target.existingConversation) {
          setState((current) => ({
            ...current,
            selectedShop: target,
            selectedConversation: null,
            messages: [],
            loading: false,
          }));
          return;
        }
        const existing =
          target.existingConversation ??
          state.conversations.find((item) => item.participant.userId === target.ownerUserId);
        if (existing) await selectConversation(existing);
        else
          setState((current) => ({
            ...current,
            selectedShop: target,
            selectedConversation: {
              id: `new:${target.ownerUserId}`,
              shopName: target.shopName,
              participant: {
                userId: target.ownerUserId,
                displayName: target.ownerDisplayName,
                avatarUrl: target.ownerAvatarUrl,
                presence: 'INACTIVE',
              },
              lastMessagePreview: '',
              lastMessageAt: new Date().toISOString(),
              unreadCount: 0,
              lastReadSequence: 0,
              lastMessageSequence: 0,
              canMessage: target.canMessage !== false,
            },
            messages: [],
            loading: false,
            historyLoading: false,
          }));
      } catch (error) {
        setState((current) => ({
          ...current,
          loading: false,
          error:
            error instanceof ChatApiError && error.status === 403
              ? 'Bạn không thể mở cuộc trò chuyện này.'
              : 'Chưa thể tải thông tin shop. Vui lòng thử lại.',
        }));
      }
    },
    [auth, selectConversation, state.conversations],
  );

  useEffect(() => {
    if (auth.state.status !== 'authenticated' || handoffConsumed.current) return;
    handoffConsumed.current = true;
    try {
      const raw = window.sessionStorage.getItem('chat-handoff-v1');
      window.sessionStorage.removeItem('chat-handoff-v1');
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (isValidChatHandoff(parsed)) void openForShop(parsed.shopId);
    } catch {
      window.sessionStorage.removeItem('chat-handoff-v1');
    }
  }, [auth.state.status, openForShop]);

  const loadOlderMessages = useCallback(async () => {
    const conversation = selectedConversationRef.current;
    const beforeSequence = oldestSequenceRef.current;
    if (
      !conversation ||
      conversation.id.startsWith('new:') ||
      !hasMoreBeforeRef.current ||
      beforeSequence === null ||
      olderLoadingRef.current
    )
      return;
    olderLoadingRef.current = true;
    setState((current) => ({ ...current, olderLoading: true, olderError: '' }));
    try {
      const page = await getChatMessages(
        conversation.id,
        { beforeSequence },
        auth.authenticatedFetch,
      );
      const merged = mergeMessages(messagesRef.current, page.items);
      hasMoreBeforeRef.current = page.hasMoreBefore;
      oldestSequenceRef.current =
        merged.find((message) => message.sequence > 0)?.sequence ?? beforeSequence;
      setState((current) => ({
        ...current,
        messages: merged,
        olderLoading: false,
        olderError: '',
        hasMoreBefore: page.hasMoreBefore,
        oldestSequence: oldestSequenceRef.current,
      }));
    } catch {
      setState((current) => ({
        ...current,
        olderLoading: false,
        olderError: 'Chưa thể tải tin cũ. Vui lòng thử lại.',
      }));
    } finally {
      olderLoadingRef.current = false;
    }
  }, [auth.authenticatedFetch]);

  const loadReplyTarget = useCallback(
    async (
      reference: Pick<ChatReplyReference, 'messageId' | 'sequence'>,
    ): Promise<'loaded' | 'unavailable' | 'error'> => {
      const conversation = selectedConversationRef.current;
      if (!conversation || conversation.id.startsWith('new:')) return 'unavailable';
      if (messagesRef.current.some((message) => message.id === reference.messageId))
        return 'loaded';
      if (olderLoadingRef.current) return 'error';

      let merged = messagesRef.current;
      let beforeSequence =
        oldestSequenceRef.current ??
        merged.find((message) => message.sequence > 0)?.sequence ??
        reference.sequence + 1;
      let hasMore = hasMoreBeforeRef.current || merged.length === 0;

      if (reference.sequence >= beforeSequence && merged.length > 0) return 'unavailable';

      olderLoadingRef.current = true;
      setState((current) => ({ ...current, olderLoading: true, olderError: '' }));
      try {
        while (hasMore && beforeSequence > reference.sequence) {
          const page = await getChatMessages(
            conversation.id,
            { beforeSequence },
            auth.authenticatedFetch,
          );
          const next = mergeMessages(merged, page.items);
          const nextOldest = next.find((message) => message.sequence > 0)?.sequence ?? null;
          merged = next;
          hasMore = page.hasMoreBefore;

          if (merged.some((message) => message.id === reference.messageId)) break;
          if (nextOldest === null || nextOldest >= beforeSequence) {
            hasMore = false;
            break;
          }
          beforeSequence = nextOldest;
        }

        const nextOldest = merged.find((message) => message.sequence > 0)?.sequence ?? null;
        messagesRef.current = merged;
        hasMoreBeforeRef.current = hasMore;
        oldestSequenceRef.current = nextOldest;
        setState((current) => ({
          ...current,
          messages: merged,
          olderLoading: false,
          olderError: '',
          hasMoreBefore: hasMore,
          oldestSequence: nextOldest,
        }));
        return merged.some((message) => message.id === reference.messageId)
          ? 'loaded'
          : 'unavailable';
      } catch {
        setState((current) => ({ ...current, olderLoading: false }));
        return 'error';
      } finally {
        olderLoadingRef.current = false;
      }
    },
    [auth.authenticatedFetch],
  );

  const markSelectedConversationRead = useCallback(async (
    conversationOverride?: ChatConversationSummary,
    messagesOverride?: ChatMessage[],
  ) => {
    if (auth.state.status !== 'authenticated') return;
    const conversation = conversationOverride ?? selectedConversationRef.current;
    if (
      !conversation ||
      conversation.id.startsWith('new:') ||
      (!conversationOverride && loadingRef.current)
    )
      return;
    attentionEngaged.current = true;
    const throughSequence = (messagesOverride ?? messagesRef.current).reduce(
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
        const nextRead = Math.max(
          current.selectedConversation.lastReadSequence,
          response.throughSequence,
        );
        return {
          ...current,
          selectedConversation: {
            ...current.selectedConversation,
            unreadCount: response.unreadCount,
            lastReadSequence: nextRead,
          },
          conversations: current.conversations.map((item) =>
            item.id === response.conversationId
              ? {
                  ...item,
                  unreadCount: response.unreadCount,
                  lastReadSequence: Math.max(item.lastReadSequence, nextRead),
                }
              : item,
          ),
          unreadCount: response.unreadTotal,
        };
      });
      window.dispatchEvent(new Event('chat-notification-sync'));
    } catch {
      /* next explicit engagement retries the authoritative update */
    }
  }, [auth]);

  const setDraft = useCallback((draft: string) => {
    draftRevisionRef.current += 1;
    setState((current) => ({ ...current, draft }));
  }, []);

  const sendDraft = useCallback(async () => {
    const conversation = selectedConversationRef.current;
    const content = state.draft.trim();
    const replyTo = state.replyTo;
    if (
      !conversation ||
      !content ||
      state.sending ||
      auth.state.status !== 'authenticated' ||
      conversation.canMessage === false
    )
      return;
    const messageId = crypto.randomUUID();
    draftRevisionRef.current += 1;
    const afterClearRevision = draftRevisionRef.current;
    pendingAttempts.current.set(messageId, {
      content,
      conversationId: conversation.id,
      afterClearRevision,
      failed: false,
    });
    setState((current) => ({
      ...current,
      draft: '',
      replyTo: null,
      sending: true,
      error: '',
      messages: mergeMessages(current.messages, [
        {
          id: messageId,
          conversationId: conversation.id,
          sequence: 0,
          senderUserId: auth.state.status === 'authenticated' ? auth.state.user.id : '',
          clientMessageId: messageId,
          content,
          createdAt: new Date().toISOString(),
          deliveryState: 'PENDING',
          isRead: false,
          replyTo: replyTo ?? null,
        },
      ]),
    }));
    const markFailed = (message: string) => {
      const attempt = pendingAttempts.current.get(messageId);
      if (!attempt) return;
      attempt.failed = true;
      setState((current) => {
        const canRestore =
          current.selectedConversation?.id === attempt.conversationId &&
          current.draft.trim() === '' &&
          draftRevisionRef.current === attempt.afterClearRevision;
        if (canRestore) draftRevisionRef.current += 1;
        return {
          ...current,
          sending: false,
          error: message,
          draft: canRestore ? attempt.content : current.draft,
          messages: current.messages.map((item) =>
            item.clientMessageId === messageId
              ? { ...item, deliveryState: 'FAILED' as const }
              : item,
          ),
        };
      });
    };
    pendingTimers.current.set(
      messageId,
      setTimeout(
        () =>
          markFailed('Tin nhắn chưa được xác nhận sau 3 giây. Nội dung đã được giữ trong ô soạn.'),
        3_000,
      ),
    );
    try {
      const response = await sendChatMessage(
        {
          recipientUserId: conversation.participant.userId,
          clientMessageId: messageId,
          content,
          replyToMessageId: replyTo?.messageId ?? null,
        },
        auth.authenticatedFetch,
      );
      const timer = pendingTimers.current.get(messageId);
      if (timer) clearTimeout(timer);
      pendingTimers.current.delete(messageId);
      pendingAttempts.current.delete(messageId);
      setState((current) => ({
        ...current,
        sending: false,
        conversations: [
          response.conversation,
          ...current.conversations.filter((item) => item.id !== response.conversation.id),
        ],
        messages: mergeMessages(
          current.messages.filter((item) => item.clientMessageId !== messageId),
          [response.message],
        ),
        selectedConversation: preserveRealtimePresence(
          response.conversation,
          current.selectedConversation,
        ),
      }));
    } catch {
      const timer = pendingTimers.current.get(messageId);
      if (timer) clearTimeout(timer);
      pendingTimers.current.delete(messageId);
      markFailed('Không thể gửi tin nhắn. Nội dung vẫn được giữ để thử lại bằng nút Gửi.');
      pendingAttempts.current.delete(messageId);
    }
  }, [auth, state.draft, state.replyTo, state.sending]);

  useEffect(() => {
    if (auth.state.status !== 'authenticated' || !state.selectedConversation) return;
    try {
      const key = `chat-draft-v1:${auth.state.user.id}:${state.selectedConversation.participant.userId}`;
      if (state.draft) window.sessionStorage.setItem(key, state.draft);
      else window.sessionStorage.removeItem(key);
    } catch {
      /* storage is optional */
    }
  }, [auth.state, state.draft, state.selectedConversation]);

  const toggleMute = useCallback(
    async (conversationId: string, muted: boolean) => {
      if (auth.state.status !== 'authenticated') return;
      try {
        const response = muted
          ? await muteChatConversation(conversationId, auth.authenticatedFetch)
          : await unmuteChatConversation(conversationId, auth.authenticatedFetch);
        setState((current) => ({
          ...current,
          conversations: current.conversations.map((item) =>
            item.id === conversationId
              ? { ...item, notificationsMuted: response.notificationsMuted }
              : item,
          ),
          selectedConversation:
            current.selectedConversation?.id === conversationId
              ? { ...current.selectedConversation, notificationsMuted: response.notificationsMuted }
              : current.selectedConversation,
          error: '',
        }));
      } catch {
        setState((current) => ({ ...current, error: 'Chưa thể thay đổi thông báo cuộc trò chuyện.' }));
      }
    },
    [auth],
  );

  const toggleBlock = useCallback(
    async (userId: string, blocked: boolean) => {
      if (auth.state.status !== 'authenticated') return;
      try {
        const response = blocked
          ? await blockChatUser(userId, auth.authenticatedFetch)
          : await unblockChatUser(userId, auth.authenticatedFetch);
        setState((current) => ({
          ...current,
          conversations: current.conversations.map((item) =>
            item.participant.userId === userId
              ? { ...item, blockedByMe: response.blockedByMe, canMessage: response.canMessage }
              : item,
          ),
          selectedConversation:
            current.selectedConversation?.participant.userId === userId
              ? {
                  ...current.selectedConversation,
                  blockedByMe: response.blockedByMe,
                  canMessage: response.canMessage,
                }
              : current.selectedConversation,
          error: '',
        }));
      } catch {
        setState((current) => ({ ...current, error: 'Chưa thể thay đổi trạng thái chặn.' }));
      }
    },
    [auth],
  );

  const setReplyTo = useCallback((replyTo: ChatReplyReference | null) => {
    setState((current) => ({ ...current, replyTo }));
  }, []);

  const openConversationFromNotification = useCallback(
    async (conversationId: string, newestSequence?: number): Promise<boolean> => {
      const existing = state.conversations.find((item) => item.id === conversationId);
      let conversation = existing;
      if (!conversation) {
        try {
          const response = await listChatConversations({}, auth.authenticatedFetch);
          conversation = response.items.find((item) => item.id === conversationId);
          if (conversation)
            setState((current) => ({ ...current, conversations: response.items, unreadCount: response.unreadCount }));
        } catch {
          return false;
        }
      }
      if (!conversation) return false;
      await selectConversation(conversation);
      await markSelectedConversationRead();
      void newestSequence;
      return true;
    },
    [auth.authenticatedFetch, markSelectedConversationRead, selectConversation, state.conversations],
  );

  const reportMessage = useCallback(
    async (input: { conversationId: string; messageId?: string | null; reasonCode: string; details?: string | null }) => {
      if (auth.state.status !== 'authenticated') return null;
      return reportChat(input, crypto.randomUUID(), auth.authenticatedFetch);
    },
    [auth],
  );

  const closeWidget = useCallback(() => {
    attentionEngaged.current = false;
    setState((current) => {
      const emptyTemporary =
        current.selectedConversation?.id.startsWith('new:') && !current.draft.trim();
      return emptyTemporary
        ? {
            ...current,
            open: false,
            selectedConversation: null,
            selectedShop: null,
            messages: [],
            hasMoreBefore: false,
            oldestSequence: null,
          }
        : { ...current, open: false };
    });
  }, []);
  const value = useMemo(
    () => ({
      ...state,
      openForShop,
      openWidget: () => setState((current) => ({ ...current, open: true })),
      closeWidget,
      selectConversation,
      loadOlderMessages,
      loadReplyTarget,
      markSelectedConversationRead,
      toggleMute,
      toggleBlock,
      setReplyTo,
      openConversationFromNotification,
      reportMessage,
      setDraft,
      sendDraft,
      retry: loadConversations,
    }),
    [
      closeWidget,
      loadConversations,
      loadOlderMessages,
      loadReplyTarget,
      markSelectedConversationRead,
      openConversationFromNotification,
      openForShop,
      reportMessage,
      selectConversation,
      setReplyTo,
      sendDraft,
      setDraft,
      state,
      toggleBlock,
      toggleMute,
    ],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  return useContext(ChatContext);
}

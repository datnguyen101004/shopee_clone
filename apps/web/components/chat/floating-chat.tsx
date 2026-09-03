'use client';

import { useChat } from './chat-provider';
import type {
  ChatConversationSummary,
  ChatMessage,
  ChatReplyReference,
} from '@shopee-clone/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuthSession } from '../auth-session-provider';

const messageTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Ho_Chi_Minh',
});

function formatMessageTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : messageTimeFormatter.format(date);
}

const messageDateFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeZone: 'Asia/Ho_Chi_Minh',
});

function formatMessageDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : messageDateFormatter.format(date);
}

function conversationLabel(conversation: {
  shopName?: string | null;
  participant: { displayName: string };
}): string {
  return conversation.shopName?.trim() || conversation.participant.displayName;
}

export function FloatingChat() {
  const chat = useChat();
  const auth = useAuthSession();
  const authenticatedUserId = auth.state.status === 'authenticated' ? auth.state.user.id : null;
  const { open } = chat;
  const { closeWidget } = chat;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const widgetRef = useRef<HTMLElement>(null);
  const messagesPaneRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const previousLatestMessageId = useRef<string | null>(null);
  const previousConversationId = useRef<string | null>(null);
  const previousOpen = useRef(false);
  const shouldAutoScroll = useRef(true);
  const [search, setSearch] = useState('');
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [pendingConversation, setPendingConversation] = useState<
    Parameters<typeof chat.selectConversation>[0] | null
  >(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [contactActionId, setContactActionId] = useState<string | null>(null);
  const [messageActionId, setMessageActionId] = useState<string | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [replyNavigationState, setReplyNavigationState] = useState<{
    replyMessageId: string;
    status: 'loading' | 'unavailable' | 'error';
  } | null>(null);
  const [reportTarget, setReportTarget] = useState<ChatMessage | null>(null);
  const [reportReason, setReportReason] = useState('HARASSMENT');
  const [reportDetails, setReportDetails] = useState('');
  const [reportError, setReportError] = useState('');
  const [reportSending, setReportSending] = useState(false);
  const [reportReceipt, setReportReceipt] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<ChatConversationSummary | null>(null);
  const pointerEngaged = useRef(false);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversations = useMemo(
    () =>
      chat.conversations.filter((conversation) => {
        const query = search.trim().toLocaleLowerCase('vi');
        return conversationLabel(conversation).toLocaleLowerCase('vi').includes(query);
      }),
    [chat.conversations, search],
  );
  const lastOwnMessageId = useMemo(() => {
    for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
      const message = chat.messages[index];
      if (message && authenticatedUserId !== null && message.senderUserId === authenticatedUserId) {
        return message.id;
      }
    }
    return null;
  }, [authenticatedUserId, chat.messages]);
  const latestMessage = chat.messages.at(-1) ?? null;
  const latestMessageId = latestMessage?.id ?? null;
  const latestMessageIsOwn =
    authenticatedUserId !== null && latestMessage?.senderUserId === authenticatedUserId;
  const selectedConversationLabel = chat.selectedConversation
    ? conversationLabel(chat.selectedConversation)
    : 'Người dùng';
  const loadOlderInFlight = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      requestAnimationFrame(() => {
        const firstField = widgetRef.current?.querySelector<HTMLElement>('input, textarea');
        (firstField ?? widgetRef.current?.querySelector<HTMLElement>('button'))?.focus();
      });
    }
    if (!open && wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (contactActionId || messageActionId) {
        setContactActionId(null);
        setMessageActionId(null);
        return;
      }
      if (reportTarget) {
        setReportTarget(null);
        return;
      }
      if (blockTarget) {
        setBlockTarget(null);
        return;
      }
      if (pendingConversation) {
        setPendingConversation(null);
        return;
      }
      closeWidget();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    open,
    closeWidget,
    pendingConversation,
    contactActionId,
    messageActionId,
    reportTarget,
    blockTarget,
  ]);

  useEffect(() => {
    if (!open || (!contactActionId && !messageActionId)) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.floating-chat__action-menu, .floating-chat__contact-actions, .floating-chat__message-actions')) return;
      setContactActionId(null);
      setMessageActionId(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open, contactActionId, messageActionId]);

  useEffect(() => {
    const reopened = open && !previousOpen.current;
    previousOpen.current = open;
    if (!open || !chat.selectedConversation || latestMessageId === null) return;
    const conversationChanged = previousConversationId.current !== chat.selectedConversation.id;
    if (conversationChanged || reopened) {
      shouldAutoScroll.current = true;
      setHasNewMessages(false);
    }
    const latestMessageChanged =
      previousLatestMessageId.current !== null &&
      previousLatestMessageId.current !== latestMessageId;
    if (latestMessageChanged && latestMessageIsOwn) {
      shouldAutoScroll.current = true;
      setHasNewMessages(false);
    } else if (latestMessageChanged && !shouldAutoScroll.current) {
      setHasNewMessages(true);
    }
    previousLatestMessageId.current = latestMessageId;
    previousConversationId.current = chat.selectedConversation.id;
    if (!shouldAutoScroll.current) return;
    const frame = requestAnimationFrame(() => {
      const pane = messagesPaneRef.current;
      if (pane) pane.scrollTop = pane.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [chat.selectedConversation, latestMessageId, latestMessageIsOwn, open]);

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    [],
  );

  const loadOlder = async () => {
    const pane = messagesPaneRef.current;
    if (!pane || loadOlderInFlight.current || !chat.hasMoreBefore) return;
    loadOlderInFlight.current = true;
    const previousHeight = pane.scrollHeight;
    const previousTop = pane.scrollTop;
    try {
      await chat.loadOlderMessages();
      requestAnimationFrame(() => {
        const nextPane = messagesPaneRef.current;
        if (nextPane) nextPane.scrollTop = previousTop + (nextPane.scrollHeight - previousHeight);
      });
    } finally {
      loadOlderInFlight.current = false;
    }
  };

  const findMessageElement = (messageId: string) =>
    messagesPaneRef.current?.querySelector<HTMLElement>(
      `[data-chat-message-id="${messageId}"]`,
    ) ?? null;

  const jumpToReplyTarget = async (
    replyMessageId: string,
    reference: ChatReplyReference,
  ) => {
    setMessageActionId(null);
    setReplyNavigationState(null);
    let target = findMessageElement(reference.messageId);
    if (!target) {
      setReplyNavigationState({ replyMessageId, status: 'loading' });
      const result = await chat.loadReplyTarget(reference);
      if (result !== 'loaded') {
        setReplyNavigationState({ replyMessageId, status: result });
        return;
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      target = findMessageElement(reference.messageId);
    }
    if (!target) {
      setReplyNavigationState({ replyMessageId, status: 'unavailable' });
      return;
    }

    shouldAutoScroll.current = false;
    setHasNewMessages(false);
    setReplyNavigationState(null);
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView?.({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'center',
    });
    target.focus({ preventScroll: true });
    setHighlightedMessageId(reference.messageId);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => {
      setHighlightedMessageId((current) =>
        current === reference.messageId ? null : current,
      );
      highlightTimer.current = null;
    }, 1_800);
  };

  const select = (conversation: Parameters<typeof chat.selectConversation>[0]) => {
    if (chat.selectedConversation?.id.startsWith('new:') && chat.draft.trim()) {
      setPendingConversation(conversation);
      return;
    }
    void Promise.resolve(chat.selectConversation(conversation)).then(() =>
      chat.markSelectedConversationRead(),
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="floating-chat-trigger"
        aria-label={chat.open ? 'Đóng trò chuyện' : 'Mở trò chuyện'}
        aria-expanded={chat.open}
        onClick={chat.open ? chat.closeWidget : chat.openWidget}
      >
        <span className="floating-chat-trigger__icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
            <circle cx="8" cy="10" r="1.5" />
            <circle cx="12" cy="10" r="1.5" />
            <circle cx="16" cy="10" r="1.5" />
          </svg>
        </span>
        <span className="floating-chat-trigger__text">Chat</span>
        {chat.unreadCount > 0 ? (
          <span className="floating-chat-badge">
            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
          </span>
        ) : null}
      </button>

      {chat.open ? (
        <section
          ref={widgetRef}
          className="floating-chat"
          role="dialog"
          aria-modal="false"
          aria-label="Trò chuyện"
          tabIndex={-1}
        >
          <header className={`floating-chat__header ${chat.unreadCount > 0 ? 'has-unread' : ''}`}>
            <div className="floating-chat__header-info">
              <div
                className="floating-chat__header-avatar"
                role="button"
                tabIndex={0}
                aria-label="Đánh dấu cuộc trò chuyện đã xem"
                onClick={() => void chat.markSelectedConversationRead()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    void chat.markSelectedConversationRead();
                  }
                }}
              >
                {chat.selectedConversation?.participant.avatarUrl ? (
                  <img
                    src={chat.selectedConversation.participant.avatarUrl}
                    alt=""
                    className="floating-chat__avatar-img"
                  />
                ) : (
                  <span className="floating-chat__avatar-letter">
                    {chat.selectedConversation
                      ? conversationLabel(chat.selectedConversation).charAt(0).toUpperCase()
                      : '💬'}
                  </span>
                )}
                {chat.selectedConversation ? (
                  <span
                    className={`floating-chat__presence-indicator ${
                      chat.selectedConversation.participant.presence === 'ACTIVE'
                        ? 'is-online'
                        : 'is-offline'
                    }`}
                  />
                ) : null}
              </div>
              <div className="floating-chat__header-titles">
                <strong>
                  {chat.selectedConversation
                    ? `Trò chuyện với ${conversationLabel(chat.selectedConversation)}`
                    : 'Trò chuyện'}
                </strong>
                <span className="floating-chat__header-subtitle">Shopee Chat</span>
              </div>
            </div>
            <div className="floating-chat__header-controls">
              <button
                type="button"
                className="floating-chat__close-btn"
                aria-label="Đóng trò chuyện"
                onClick={chat.closeWidget}
                title="Đóng trò chuyện"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </header>

          <div className="floating-chat__body">
            <aside aria-label="Danh sách liên hệ">
              <div className="floating-chat__search-box">
                <svg
                  className="floating-chat__search-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  aria-label="Tìm liên hệ"
                  placeholder="Tìm liên hệ"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div className="floating-chat__contacts-list">
                {chat.loading && !chat.conversations.length ? (
                  <div className="floating-chat__skeleton-list" aria-label="Đang tải liên hệ">
                    {Array.from({ length: 4 }, (_, index) => (
                      <span className="floating-chat__skeleton-contact" key={index} />
                    ))}
                    <span className="floating-chat__loading-label">Đang tải…</span>
                  </div>
                ) : null}
                {chat.listError && chat.conversations.length ? (
                  <p className="floating-chat__list-error" role="alert">
                    <span>{chat.listError}</span>
                    <button type="button" onClick={() => void chat.retry()}>
                      Thử lại
                    </button>
                  </p>
                ) : null}
                {!chat.loading && !chat.listError && !conversations.length ? (
                  <p className="floating-chat__list-notice">
                    {search.trim() ? 'Không tìm thấy liên hệ.' : 'Chưa có cuộc trò chuyện.'}
                  </p>
                ) : null}
                {conversations.map((conversation) => (
                  <div className="floating-chat__contact-row" key={conversation.id}>
                    <button
                      type="button"
                      className={`floating-chat__contact-item ${
                        chat.selectedConversation?.id === conversation.id ? 'is-selected' : ''
                      }`}
                      onClick={() => {
                        setContactActionId(null);
                        select(conversation);
                      }}
                    >
                      <div className="floating-chat__contact-avatar">
                        {conversation.participant.avatarUrl ? (
                          <img
                            src={conversation.participant.avatarUrl}
                            alt=""
                            className="floating-chat__avatar-img"
                          />
                        ) : (
                          <span>{conversationLabel(conversation).charAt(0).toUpperCase()}</span>
                        )}
                        <span
                          className={`floating-chat__presence-indicator ${
                            conversation.participant.presence === 'ACTIVE'
                              ? 'is-online'
                              : 'is-offline'
                          }`}
                        />
                      </div>
                      <div className="floating-chat__contact-info">
                        <div className="floating-chat__contact-headline">
                          <strong>{conversationLabel(conversation)}</strong>
                          {conversation.unreadCount ? (
                            <em aria-label={`${conversation.unreadCount} tin chưa đọc`}>
                              {conversation.unreadCount}
                            </em>
                          ) : null}
                        </div>
                        <small className="floating-chat__contact-preview">
                          {conversation.lastMessagePreview || 'Bắt đầu trò chuyện'}
                        </small>
                        <small className="floating-chat__contact-status">
                          {conversation.participant.presence === 'ACTIVE'
                            ? 'Đang hoạt động'
                            : 'Không hoạt động'}
                        </small>
                        {conversation.notificationsMuted ? (
                          <small className="floating-chat__contact-state">🔕 Đã tắt thông báo</small>
                        ) : null}
                        {conversation.blockedByMe ? (
                          <small className="floating-chat__contact-state">🚫 Đã chặn</small>
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="floating-chat__contact-actions"
                      aria-label="Tùy chọn cuộc trò chuyện"
                      aria-expanded={contactActionId === conversation.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setMessageActionId(null);
                        setContactActionId((current) =>
                          current === conversation.id ? null : conversation.id,
                        );
                      }}
                    >
                      ⋮
                    </button>
                    {contactActionId === conversation.id ? (
                      <div className="floating-chat__action-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            void chat.toggleMute(conversation.id, !conversation.notificationsMuted);
                            setContactActionId(null);
                          }}
                        >
                          {conversation.notificationsMuted ? 'Bật thông báo' : 'Tắt thông báo'}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            if (conversation.blockedByMe) {
                              void chat.toggleBlock(conversation.participant.userId, false);
                            } else {
                              setBlockTarget(conversation);
                            }
                            setContactActionId(null);
                          }}
                        >
                          {conversation.blockedByMe ? 'Bỏ chặn' : 'Chặn'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </aside>

            <main
              tabIndex={0}
              aria-label="Nội dung cuộc trò chuyện"
              onPointerDown={() => {
                pointerEngaged.current = true;
              }}
              onClick={() => {
                pointerEngaged.current = false;
                void chat.markSelectedConversationRead();
              }}
              onFocus={() => {
                if (!pointerEngaged.current) void chat.markSelectedConversationRead();
                pointerEngaged.current = false;
              }}
            >
              {chat.selectedConversation ? (
                <>
                  {chat.historyLoading ? (
                    <div className="floating-chat__history-skeleton" aria-label="Đang tải tin nhắn">
                      <span className="floating-chat__skeleton-bubble is-theirs" />
                      <span className="floating-chat__skeleton-bubble is-mine" />
                      <span className="floating-chat__skeleton-bubble is-theirs" />
                    </div>
                  ) : null}
                  {chat.historyError ? (
                    <div className="floating-chat__history-error" role="alert">
                      <span>{chat.historyError}</span>
                      <button
                        type="button"
                        onClick={() => void chat.selectConversation(chat.selectedConversation!)}
                      >
                        Thử lại
                      </button>
                    </div>
                  ) : null}
                  <div className="floating-chat__messages-shell">
                    <div
                      ref={messagesPaneRef}
                      className="floating-chat__messages"
                      aria-live="polite"
                      onScroll={() => {
                        const pane = messagesPaneRef.current;
                        if (!pane) return;
                        const atBottom = pane.scrollHeight - pane.scrollTop - pane.clientHeight <= 64;
                        shouldAutoScroll.current = atBottom;
                        if (atBottom) setHasNewMessages(false);
                        if (pane.scrollTop <= 48 && chat.hasMoreBefore && !chat.olderLoading)
                          void loadOlder();
                      }}
                    >
                    {!chat.hasMoreBefore && chat.messages.length > 0 ? (
                      <div className="floating-chat__beginning" role="status">
                        Bắt đầu cuộc trò chuyện
                      </div>
                    ) : null}
                    {chat.olderLoading ? (
                      <p className="floating-chat__older-loading" role="status">
                        Đang tải tin cũ…
                      </p>
                    ) : null}
                    {chat.olderError ? (
                      <p className="floating-chat__older-error" role="alert">
                        <span>{chat.olderError}</span>
                        <button type="button" onClick={() => void loadOlder()}>
                          Thử lại
                        </button>
                      </p>
                    ) : null}
                    {chat.messages.map((message, index) => {
                      const isOwnMessage =
                        authenticatedUserId !== null &&
                        message.senderUserId === authenticatedUserId;
                      const showReadState =
                        isOwnMessage &&
                        (message.id === lastOwnMessageId || expandedMessageId === message.id);
                      const showTime = message.id === latestMessageId;
                      const previous = chat.messages[index - 1];
                      const showDateBoundary =
                        !previous ||
                        formatMessageDate(previous.createdAt) !==
                          formatMessageDate(message.createdAt);
                      return (
                        <div
                          key={`message-group-${message.id}`}
                          className="floating-chat__message-group"
                        >
                          {showDateBoundary ? (
                            <div className="floating-chat__date-boundary">
                              {formatMessageDate(message.createdAt)}
                            </div>
                          ) : null}
                          <div
                            className={[
                              'floating-chat__message-line',
                              isOwnMessage ? 'is-mine' : 'is-theirs',
                              highlightedMessageId === message.id ? 'is-reply-target' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            data-chat-message-id={message.id}
                            tabIndex={-1}
                          >
                            <p
                              key={message.id}
                              className={[
                                isOwnMessage ? 'is-mine' : 'is-theirs',
                                message.deliveryState === 'FAILED' ? 'is-failed' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              onClick={(event) => {
                                event.stopPropagation();
                                setContactActionId(null);
                                setMessageActionId((current) =>
                                  current === message.id ? null : message.id,
                                );
                                setExpandedMessageId((current) =>
                                  current === message.id ? null : message.id,
                                );
                                void chat.markSelectedConversationRead();
                              }}
                            >
                              {message.replyTo ? (
                                <>
                                  <span className="floating-chat__reply-attribution">
                                    <span aria-hidden="true">↩</span>
                                    {isOwnMessage
                                      ? `Bạn đã trả lời ${selectedConversationLabel}`
                                      : `${selectedConversationLabel} đã trả lời bạn`}
                                  </span>
                                  <button
                                    type="button"
                                    className="floating-chat__reply-quote"
                                    aria-label={`Đi tới tin nhắn gốc của ${message.replyTo.senderLabel}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void jumpToReplyTarget(message.id, message.replyTo!);
                                    }}
                                  >
                                    <span>{message.replyTo.preview}</span>
                                  </button>
                                  {replyNavigationState?.replyMessageId === message.id ? (
                                    <small
                                      className="floating-chat__reply-navigation-state"
                                      role="status"
                                    >
                                      {replyNavigationState.status === 'loading'
                                        ? 'Đang mở tin nhắn gốc…'
                                        : replyNavigationState.status === 'error'
                                          ? 'Chưa thể tải tin nhắn gốc. Hãy thử lại.'
                                          : 'Tin nhắn gốc không còn khả dụng.'}
                                    </small>
                                  ) : null}
                                </>
                              ) : null}
                              <span className="floating-chat__message-main-row">
                                <span className="floating-chat__message-bubble">
                                  {message.content}
                                </span>
                                <button
                                  type="button"
                                  className="floating-chat__message-actions"
                                  aria-label={`Tùy chọn tin nhắn lúc ${formatMessageTime(message.createdAt)}`}
                                  aria-expanded={messageActionId === message.id}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setContactActionId(null);
                                    setMessageActionId((current) =>
                                      current === message.id ? null : message.id,
                                    );
                                  }}
                                >
                                  ⋮
                                </button>
                                {messageActionId === message.id ? (
                                  <span
                                    className="floating-chat__action-menu floating-chat__message-menu"
                                    role="menu"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        chat.setReplyTo({
                                          messageId: message.id,
                                          sequence: message.sequence,
                                          senderUserId: message.senderUserId,
                                          senderLabel: isOwnMessage
                                            ? 'Bạn'
                                            : (chat.selectedConversation?.participant.displayName ??
                                              'Người dùng'),
                                          preview: message.content.slice(0, 160),
                                        });
                                        setMessageActionId(null);
                                      }}
                                    >
                                      Trả lời
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        setReportTarget(message);
                                        setReportReason('HARASSMENT');
                                        setReportDetails('');
                                        setReportError('');
                                        setReportReceipt(null);
                                        setMessageActionId(null);
                                      }}
                                    >
                                      Báo cáo
                                    </button>
                                  </span>
                                ) : null}
                              </span>
                              <span className="floating-chat__message-footer">
                                {showTime ? (
                                  <small className="floating-chat__message-time">
                                    <time dateTime={message.createdAt}>
                                      {formatMessageTime(message.createdAt)}
                                    </time>
                                  </small>
                                ) : null}
                                {showReadState ? (
                                  <small className="floating-chat__message-state">
                                    {message.deliveryState === 'PENDING'
                                      ? 'Đang gửi…'
                                      : message.deliveryState === 'FAILED'
                                        ? 'Gửi thất bại'
                                        : message.isRead
                                          ? 'Đã xem'
                                          : 'Đã gửi'}
                                  </small>
                                ) : null}
                              </span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                    {hasNewMessages ? (
                      <button
                        type="button"
                        className="floating-chat__new-message"
                        onClick={() => {
                          shouldAutoScroll.current = true;
                          setHasNewMessages(false);
                          const pane = messagesPaneRef.current;
                          if (pane) pane.scrollTop = pane.scrollHeight;
                        }}
                      >
                        Tin nhắn mới
                      </button>
                    ) : null}
                  </div>

                  {chat.selectedConversation.canMessage === false ? (
                    <div className="floating-chat__forbidden" role="status">
                      Bạn không thể tiếp tục cuộc trò chuyện này
                    </div>
                  ) : (
                    <>
                      {chat.replyTo ? (
                        <div className="floating-chat__reply-composer" role="status">
                          <span>
                            Đang trả lời <strong>{chat.replyTo.senderLabel}</strong>: {chat.replyTo.preview}
                          </span>
                          <button type="button" onClick={() => chat.setReplyTo(null)}>
                            Hủy
                          </button>
                        </div>
                      ) : null}
                      <form
                        className="floating-chat__form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void chat.sendDraft();
                        }}
                      >
                      <textarea
                        aria-label="Nội dung tin nhắn"
                        value={chat.draft}
                        onChange={(event) => chat.setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            void chat.sendDraft();
                          }
                        }}
                        placeholder="Nhập tin nhắn…"
                        rows={1}
                      />
                      <button
                        type="submit"
                        disabled={chat.sending || !chat.draft.trim()}
                        className="floating-chat__send-button"
                      >
                        <span>Gửi</span>
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      </button>
                      </form>
                    </>
                  )}
                </>
              ) : (
                <div className="floating-chat__empty">
                  <div className="floating-chat__empty-icon" aria-hidden="true">
                    💬
                  </div>
                  <p>Chọn một liên hệ để bắt đầu.</p>
                </div>
              )}
            </main>
          </div>

          {chat.reconnecting ? (
            <p className="floating-chat__reconnecting" role="status" aria-live="polite">
              <span className="floating-chat__pulse-icon" />
              Đang kết nối lại… Nội dung đã tải vẫn được giữ.
            </p>
          ) : null}

          {chat.error ? (
            <p className="floating-chat__error" role="alert">
              <span>{chat.error}</span>
              <button type="button" onClick={() => void chat.retry()}>
                Thử lại
              </button>
            </p>
          ) : null}

          {pendingConversation ? (
            <div
              className="floating-chat__discard"
              role="alertdialog"
              aria-modal="true"
              aria-label="Xác nhận rời bản nháp"
            >
              <div className="floating-chat__discard-dialog">
                <div className="floating-chat__discard-header">
                  <strong>Bản nháp chưa gửi</strong>
                </div>
                <p>Bản nháp chưa gửi sẽ bị bỏ nếu chuyển liên hệ.</p>
                <div className="floating-chat__discard-buttons">
                  <button
                    type="button"
                    className="floating-chat__discard-confirm"
                    onClick={() => {
                      chat.setDraft('');
                      void Promise.resolve(chat.selectConversation(pendingConversation)).then(() =>
                        chat.markSelectedConversationRead(),
                      );
                      setPendingConversation(null);
                    }}
                  >
                    Bỏ bản nháp
                  </button>
                  <button
                    type="button"
                    className="floating-chat__discard-cancel"
                    onClick={() => setPendingConversation(null)}
                  >
                    Ở lại
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {reportTarget ? (
            <div className="floating-chat__report-overlay" role="dialog" aria-modal="true" aria-label="Báo cáo tin nhắn">
              <form
                className="floating-chat__report-dialog"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!chat.selectedConversation || reportSending) return;
                  setReportSending(true);
                  setReportError('');
                  try {
                    const receipt = await chat.reportMessage({
                      conversationId: chat.selectedConversation.id,
                      messageId: reportTarget.id,
                      reasonCode: reportReason,
                      details: reportDetails.trim() || null,
                    });
                    setReportTarget(null);
                    setReportDetails('');
                    setReportReceipt(receipt?.id ?? 'submitted');
                  } catch {
                    setReportError('Chưa thể gửi báo cáo. Vui lòng thử lại.');
                  } finally {
                    setReportSending(false);
                  }
                }}
              >
                <strong>Báo cáo tin nhắn</strong>
                <p>Tin nhắn này sẽ được gửi tới đội ngũ kiểm duyệt.</p>
                <label>
                  Lý do
                  <select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
                    <option value="HARASSMENT">Quấy rối hoặc xúc phạm</option>
                    <option value="SPAM">Tin nhắn rác</option>
                    <option value="SCAM">Lừa đảo</option>
                    <option value="INAPPROPRIATE_CONTENT">Nội dung không phù hợp</option>
                    <option value="OTHER">Lý do khác</option>
                  </select>
                </label>
                <label>
                  Mô tả thêm (không bắt buộc)
                  <textarea
                    value={reportDetails}
                    maxLength={1000}
                    minLength={reportReason === 'OTHER' ? 20 : undefined}
                    required={reportReason === 'OTHER'}
                    onChange={(event) => setReportDetails(event.target.value)}
                    placeholder="Bạn có thể giải thích thêm…"
                    rows={3}
                  />
                  <small>{reportDetails.length}/1000 ký tự{reportReason === 'OTHER' ? ' · cần ít nhất 20 ký tự' : ''}</small>
                </label>
                {reportError ? <span className="floating-chat__report-error" role="alert">{reportError}</span> : null}
                <div className="floating-chat__report-actions">
                  <button type="button" onClick={() => setReportTarget(null)} disabled={reportSending}>
                    Hủy
                  </button>
                  <button type="submit" className="is-primary" disabled={reportSending}>
                    {reportSending ? 'Đang gửi…' : 'Gửi báo cáo'}
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {reportReceipt ? (
            <p className="floating-chat__report-receipt" role="status" aria-live="polite">
              Đã gửi báo cáo. Mã biên nhận: {reportReceipt}
            </p>
          ) : null}

          {blockTarget ? (
            <div className="floating-chat__report-overlay" role="alertdialog" aria-modal="true" aria-label="Xác nhận chặn người dùng">
              <div className="floating-chat__report-dialog">
                <strong>Chặn {conversationLabel(blockTarget)}?</strong>
                <p>Bạn sẽ không thể gửi hoặc nhận tin nhắn mới từ người này. Lịch sử hiện tại vẫn được giữ lại.</p>
                <div className="floating-chat__report-actions">
                  <button type="button" onClick={() => setBlockTarget(null)}>Hủy</button>
                  <button
                    type="button"
                    className="is-primary"
                    onClick={() => {
                      void chat.toggleBlock(blockTarget.participant.userId, true);
                      setBlockTarget(null);
                    }}
                  >
                    Chặn
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

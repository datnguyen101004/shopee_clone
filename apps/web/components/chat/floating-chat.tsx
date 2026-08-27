'use client';

import { useChat } from './chat-provider';
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

function conversationLabel(conversation: { shopName?: string | null; participant: { displayName: string } }): string {
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
  const [pendingConversation, setPendingConversation] = useState<Parameters<typeof chat.selectConversation>[0] | null>(null);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const conversations = useMemo(
    () =>
      chat.conversations.filter((conversation) => {
        const query = search.trim().toLocaleLowerCase('vi');
        return (
          conversationLabel(conversation).toLocaleLowerCase('vi').includes(query) ||
          conversation.participant.displayName.toLocaleLowerCase('vi').includes(query)
        );
      }),
    [chat.conversations, search]
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
  const latestMessageId = chat.messages.at(-1)?.id ?? null;

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
      if (pendingConversation) {
        setPendingConversation(null);
        return;
      }
      closeWidget();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, closeWidget, pendingConversation]);

  useEffect(() => {
    const reopened = open && !previousOpen.current;
    previousOpen.current = open;
    if (!open || !chat.selectedConversation || latestMessageId === null) return;
    const conversationChanged = previousConversationId.current !== chat.selectedConversation.id;
    if (conversationChanged || reopened) {
      shouldAutoScroll.current = true;
      setHasNewMessages(false);
    }
    if (previousLatestMessageId.current && previousLatestMessageId.current !== latestMessageId && !shouldAutoScroll.current) {
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
  }, [chat.selectedConversation, latestMessageId, open]);

  const select = (conversation: Parameters<typeof chat.selectConversation>[0]) => {
    if (chat.selectedConversation?.id.startsWith('new:') && chat.draft.trim()) {
      setPendingConversation(conversation);
      return;
    }
    void chat.selectConversation(conversation);
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
          <header
            className={`floating-chat__header ${chat.unreadCount > 0 ? 'has-unread' : ''}`}
          >
            <div className="floating-chat__header-info">
              <div className="floating-chat__header-avatar">
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
                  <p className="floating-chat__list-notice">Đang tải…</p>
                ) : null}
                {!chat.loading && !conversations.length ? (
                  <p className="floating-chat__list-notice">Chưa có cuộc trò chuyện.</p>
                ) : null}
                {conversations.map((conversation) => (
                  <button
                    type="button"
                    key={conversation.id}
                    className={`floating-chat__contact-item ${
                      chat.selectedConversation?.id === conversation.id ? 'is-selected' : ''
                    }`}
                    onClick={() => select(conversation)}
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
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <main onClick={() => void chat.markSelectedConversationRead()}>
              {chat.selectedConversation ? (
                <>
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
                    }}
                  >
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
                    {chat.messages.map((message) => {
                      const isOwnMessage =
                        authenticatedUserId !== null && message.senderUserId === authenticatedUserId;
                      const showReadState =
                        isOwnMessage &&
                        (message.id === lastOwnMessageId || expandedMessageId === message.id);
                      const showTime = message.id === latestMessageId;
                      return (
                        <p
                          key={message.id}
                          className={[
                            isOwnMessage ? 'is-mine' : 'is-theirs',
                            message.deliveryState === 'FAILED' ? 'is-failed' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() =>
                            setExpandedMessageId((current) =>
                              current === message.id ? null : message.id
                            )
                          }
                        >
                          <span className="floating-chat__message-bubble">{message.content}</span>
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
                          {message.deliveryState === 'FAILED' ? (
                            <button
                              type="button"
                              className="floating-chat__retry-button"
                              onClick={() => {
                                chat.setDraft(message.content);
                              }}
                            >
                              Gửi lại
                            </button>
                          ) : null}
                        </p>
                      );
                    })}
                  </div>

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
                      void chat.selectConversation(pendingConversation);
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
        </section>
      ) : null}
    </>
  );
}

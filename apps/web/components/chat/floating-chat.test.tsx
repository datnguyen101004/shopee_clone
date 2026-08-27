import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChat } from './chat-provider';
import { FloatingChat } from './floating-chat';

vi.mock('./chat-provider', () => ({ useChat: vi.fn() }));
vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn(() => ({ state: { status: 'authenticated', user: { id: '00000000-0000-4000-8000-000000000001' } } })) }));

const ownerId = '00000000-0000-4000-8000-000000000001';
const secondOwnerId = '00000000-0000-4000-8000-000000000002';
const conversation = {
  id: '00000000-0000-4000-8000-000000000003',
  participant: { userId: ownerId, displayName: 'Shop Owner', avatarUrl: null, presence: 'ACTIVE' as const },
  lastMessagePreview: 'Xin chào',
  lastMessageAt: '2026-08-27T00:00:00.000Z',
  unreadCount: 2,
  lastReadSequence: 1,
  lastMessageSequence: 2,
};

describe('FloatingChat', () => {
  let chat: Record<string, unknown>;
  beforeEach(() => {
    vi.clearAllMocks();
    chat = { open: false, selectedShop: null, selectedConversation: null, conversations: [conversation], messages: [], loading: false, error: '', unreadCount: 120, draft: '', sending: false, openForShop: vi.fn(), openWidget: vi.fn(() => { chat.open = true; }), closeWidget: vi.fn(() => { chat.open = false; }), selectConversation: vi.fn(), markSelectedConversationRead: vi.fn(), setDraft: vi.fn(), sendDraft: vi.fn(), retry: vi.fn() };
    vi.mocked(useChat).mockImplementation(() => chat as never);
  });

  it('shows the overflow badge and moves focus into/out of the widget', async () => {
    const user = userEvent.setup();
    const view = render(<FloatingChat />);
    const trigger = screen.getByRole('button', { name: 'Mở trò chuyện' });
    expect(screen.getByText('99+')).toBeVisible();
    await user.click(trigger);
    chat.open = true;
    view.rerender(<FloatingChat />);
    await waitFor(() => expect(screen.getByLabelText('Tìm liên hệ')).toHaveFocus());
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(chat.closeWidget).toHaveBeenCalled();
  });

  it('uses the shop label instead of the owner account name', () => {
    const shopConversation = { ...conversation, shopName: 'Điện Thoại Hay' };
    chat.open = true;
    chat.selectedConversation = shopConversation;
    chat.conversations = [shopConversation];
    render(<FloatingChat />);
    expect(screen.getAllByText('Điện Thoại Hay').length).toBeGreaterThan(0);
    expect(screen.queryByText('Shop Owner')).toBeNull();
  });

  it('uses the orange header only while unread messages exist', () => {
    chat.open = true;
    chat.unreadCount = 0;
    const view = render(<FloatingChat />);
    const header = screen.getByRole('dialog').querySelector('.floating-chat__header');
    expect(header).not.toHaveClass('has-unread');

    chat.unreadCount = 1;
    view.rerender(<FloatingChat />);
    expect(header).toHaveClass('has-unread');
  });

  it('announces presence and protects an unsent temporary draft before switching', async () => {
    const user = userEvent.setup();
    const temporary = { ...conversation, id: `new:${ownerId}`, participant: { ...conversation.participant, userId: ownerId }, unreadCount: 0 };
    const other = { ...conversation, id: '00000000-0000-4000-8000-000000000004', participant: { ...conversation.participant, userId: secondOwnerId, displayName: 'Other Shop' } };
    chat.open = true;
    chat.selectedConversation = temporary;
    chat.conversations = [other];
    chat.draft = 'Bản nháp';
    render(<FloatingChat />);
    expect(screen.getByText('Đang hoạt động')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Other Shop/ }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Bản nháp chưa gửi');
    await user.click(screen.getByRole('button', { name: 'Ở lại' }));
    expect(chat.selectConversation).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Other Shop/ }));
    await user.click(screen.getByRole('button', { name: 'Bỏ bản nháp' }));
    expect(chat.setDraft).toHaveBeenCalledWith('');
    expect(chat.selectConversation).toHaveBeenCalledWith(other);
  });

  it('separates own messages and only shows sent/read state for them', () => {
    chat.open = true;
    chat.selectedConversation = conversation;
    chat.messages = [
      { id: '00000000-0000-4000-8000-000000000005', conversationId: conversation.id, sequence: 1, senderUserId: ownerId, clientMessageId: '00000000-0000-4000-8000-000000000005', content: 'Tin của tôi', createdAt: '2026-08-27T00:00:00.000Z', deliveryState: 'SENT', isRead: false },
      { id: '00000000-0000-4000-8000-000000000006', conversationId: conversation.id, sequence: 2, senderUserId: secondOwnerId, clientMessageId: '00000000-0000-4000-8000-000000000006', content: 'Tin của shop', createdAt: '2026-08-27T00:00:01.000Z', deliveryState: 'SENT', isRead: true },
    ];
    render(<FloatingChat />);
    const own = screen.getByText('Tin của tôi').closest('p');
    const incoming = screen.getByText('Tin của shop').closest('p');
    expect(own).toHaveClass('is-mine');
    expect(own).toHaveTextContent('Đã gửi');
    expect(incoming).toHaveClass('is-theirs');
    expect(incoming).not.toHaveTextContent('Đã xem');
  });

  it('keeps read state on the last own message and reveals it for an older message on click', async () => {
    const user = userEvent.setup();
    chat.open = true;
    chat.selectedConversation = conversation;
    chat.messages = [
      { id: '00000000-0000-4000-8000-000000000008', conversationId: conversation.id, sequence: 1, senderUserId: ownerId, clientMessageId: '00000000-0000-4000-8000-000000000008', content: 'Tin cũ của tôi', createdAt: '2026-08-27T00:00:00.000Z', deliveryState: 'SENT', isRead: true },
      { id: '00000000-0000-4000-8000-000000000009', conversationId: conversation.id, sequence: 2, senderUserId: ownerId, clientMessageId: '00000000-0000-4000-8000-000000000009', content: 'Tin cuối của tôi', createdAt: '2026-08-27T00:01:00.000Z', deliveryState: 'SENT', isRead: true },
    ];
    render(<FloatingChat />);
    const older = screen.getByText('Tin cũ của tôi').closest('p');
    const latest = screen.getByText('Tin cuối của tôi').closest('p');
    expect(older).not.toHaveTextContent('Đã xem');
    expect(latest).toHaveTextContent('Đã xem');
    expect(latest).toHaveTextContent('07:01');
    await user.click(screen.getByText('Tin cũ của tôi'));
    expect(older).toHaveTextContent('Đã xem');
    expect(older).not.toHaveTextContent('07:00');
  });

  it('scrolls to the latest message when a conversation opens or receives a new message', async () => {
    const view = render(<FloatingChat />);
    chat.open = true;
    chat.selectedConversation = conversation;
    chat.messages = [
      { id: '00000000-0000-4000-8000-000000000010', conversationId: conversation.id, sequence: 1, senderUserId: secondOwnerId, clientMessageId: '00000000-0000-4000-8000-000000000010', content: 'Tin đầu', createdAt: '2026-08-27T00:00:00.000Z', deliveryState: 'SENT', isRead: false },
    ];
    view.rerender(<FloatingChat />);
    const pane = screen.getByText('Tin đầu').closest('.floating-chat__messages');
    expect(pane).not.toBeNull();
    Object.defineProperty(pane, 'scrollHeight', { configurable: true, value: 480 });
    await waitFor(() => expect(pane).toHaveProperty('scrollTop', 480));

    chat.messages = [
      ...(chat.messages as unknown[]),
      { id: '00000000-0000-4000-8000-000000000011', conversationId: conversation.id, sequence: 2, senderUserId: secondOwnerId, clientMessageId: '00000000-0000-4000-8000-000000000011', content: 'Tin mới nhất', createdAt: '2026-08-27T00:01:00.000Z', deliveryState: 'SENT', isRead: false },
    ];
    view.rerender(<FloatingChat />);
    Object.defineProperty(pane, 'scrollHeight', { configurable: true, value: 960 });
    await waitFor(() => expect(pane).toHaveProperty('scrollTop', 960));
  });

  it('does not move a user reading older history and offers a new-message jump', async () => {
    chat.open = true;
    chat.selectedConversation = conversation;
    chat.messages = [{ id: '00000000-0000-0000-0000-000000000030', conversationId: conversation.id, sequence: 1, senderUserId: secondOwnerId, clientMessageId: '00000000-0000-0000-0000-000000000030', content: 'Tin đầu', createdAt: '2026-08-27T00:00:00.000Z', deliveryState: 'SENT', isRead: false }];
    const view = render(<FloatingChat />);
    const pane = screen.getByText('Tin đầu').closest('.floating-chat__messages')!;
    Object.defineProperty(pane, 'scrollHeight', { configurable: true, value: 800 });
    Object.defineProperty(pane, 'clientHeight', { configurable: true, value: 300 });
    await waitFor(() => expect(pane.scrollTop).toBe(800));
    pane.scrollTop = 100;
    fireEvent.scroll(pane);
    chat.messages = [...(chat.messages as unknown[]), { id: '00000000-0000-0000-0000-000000000031', conversationId: conversation.id, sequence: 2, senderUserId: secondOwnerId, clientMessageId: '00000000-0000-0000-0000-000000000031', content: 'Tin mới', createdAt: '2026-08-27T00:01:00.000Z', deliveryState: 'SENT', isRead: false }];
    Object.defineProperty(pane, 'scrollHeight', { configurable: true, value: 900 });
    view.rerender(<FloatingChat />);
    expect(pane.scrollTop).toBe(100);
    expect(screen.getByRole('button', { name: 'Tin nhắn mới' })).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tin nhắn mới' }));
    expect(pane.scrollTop).toBe(900);
  });

  it('marks the selected conversation read when the message pane is clicked', async () => {
    const user = userEvent.setup();
    chat.open = true;
    chat.selectedConversation = conversation;
    chat.messages = [
      { id: '00000000-0000-4000-8000-000000000007', conversationId: conversation.id, sequence: 2, senderUserId: secondOwnerId, clientMessageId: '00000000-0000-4000-8000-000000000007', content: 'Tin mới', createdAt: '2026-08-27T00:00:00.000Z', deliveryState: 'SENT', isRead: false },
    ];
    render(<FloatingChat />);
    await user.click(screen.getByText('Tin mới'));
    expect(chat.markSelectedConversationRead).toHaveBeenCalledTimes(1);
  });

  it('renders recoverable loading and error states with retry', async () => {
    const user = userEvent.setup();
    chat.open = true;
    chat.conversations = [];
    chat.loading = true;
    const view = render(<FloatingChat />);
    expect(screen.getByText('Đang tải…')).toBeVisible();

    chat.loading = false;
    chat.error = 'Chưa thể tải cuộc trò chuyện. Vui lòng thử lại.';
    view.rerender(<FloatingChat />);
    await user.click(view.getByRole('button', { name: 'Thử lại' }));
    expect(chat.retry).toHaveBeenCalled();
  });

  it('keeps failed content visible and restores it to the composer on retry', async () => {
    const user = userEvent.setup();
    chat.open = true;
    chat.selectedConversation = conversation;
    chat.messages = [{ id: '00000000-0000-4000-8000-000000000020', conversationId: conversation.id, sequence: 0, senderUserId: '00000000-0000-4000-8000-000000000001', clientMessageId: '00000000-0000-4000-8000-000000000020', content: 'Nội dung lỗi', createdAt: '2026-08-27T00:00:00.000Z', deliveryState: 'FAILED', isRead: false }];
    render(<FloatingChat />);
    expect(screen.getByText('Gửi thất bại')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Gửi lại' }));
    expect(chat.setDraft).toHaveBeenCalledWith('Nội dung lỗi');
  });
});

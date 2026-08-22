import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  getNotificationUnreadCount,
  listNotificationPopover,
  markNotificationRead,
} from '../../lib/notifications-api';
import { useAuthSession } from '../auth-session-provider';
import { NotificationBell } from './notification-bell';

vi.mock('../../lib/notifications-api', () => ({
  getNotificationUnreadCount: vi.fn(),
  listNotificationPopover: vi.fn(),
  markNotificationRead: vi.fn(),
}));
vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));

const notificationId = '00000000-0000-4000-8000-000000000301';
const timestamp = '2026-08-22T04:00:00.000Z';
const authenticatedFetch = vi.fn();

const authenticated = {
  state: {
    status: 'authenticated' as const,
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'buyer@example.test',
      displayName: 'Buyer',
      status: 'active' as const,
      roles: ['buyer'] as ['buyer'],
    },
  },
  authenticatedFetch,
};

const sampleItem = {
  id: notificationId,
  category: 'ORDERS' as const,
  type: 'ORDER_CONFIRMED' as const,
  title: 'Đơn hàng đã xác nhận',
  body: 'Đơn hàng của bạn đã được xác nhận.',
  metadata: {
    targetUrl: '/account/orders/0000-1111',
    thumbnailUrl: null,
    referenceId: '0000-1111',
    amountMinor: null,
    currency: null,
  },
  isRead: false,
  readAt: null,
  isArchived: false,
  createdAt: timestamp,
};

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthSession).mockReturnValue(authenticated as never);
    vi.mocked(getNotificationUnreadCount).mockResolvedValue({ unreadCount: 3 });
    vi.mocked(listNotificationPopover).mockResolvedValue({
      notificationVersion: 'notifications-v1',
      items: [sampleItem],
      nextCursor: null,
      unreadCount: 3,
    });
    vi.mocked(markNotificationRead).mockResolvedValue({
      id: notificationId,
      isRead: true,
      readAt: timestamp,
    });
  });

  it('renders nothing for guests', () => {
    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'guest', user: null },
      authenticatedFetch,
    } as never);
    const { container } = render(<NotificationBell />);
    expect(container).toBeEmptyDOMElement();
    expect(getNotificationUnreadCount).not.toHaveBeenCalled();
  });

  it('renders an unread badge when unread count is greater than zero', async () => {
    render(<NotificationBell />);
    const trigger = await screen.findByRole('button', { name: 'Thông báo, 3 chưa đọc' });
    expect(trigger).toBeInTheDocument();
    expect(trigger.querySelector('b')).toHaveTextContent('3');
  });

  it('opens the popover with latest notifications and a view-all link', async () => {
    const user = userEvent.setup();
    render(<NotificationBell />);
    await screen.findByRole('button', { name: 'Thông báo, 3 chưa đọc' });
    await user.click(screen.getByRole('button', { name: 'Thông báo, 3 chưa đọc' }));
    expect(await screen.findByRole('dialog', { name: 'Thông báo gần đây' })).toBeInTheDocument();
    expect(screen.getByText('Đơn hàng đã xác nhận')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem tất cả' })).toHaveAttribute(
      'href',
      '/account/notifications',
    );
    await waitFor(() => expect(listNotificationPopover).toHaveBeenCalled());
  });
});

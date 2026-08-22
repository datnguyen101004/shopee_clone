import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { listNotifications, markAllNotificationsRead } from '../../lib/notifications-api';
import { useAuthSession } from '../auth-session-provider';
import { NotificationInbox } from './notification-inbox';

vi.mock('../../lib/notifications-api', () => ({
  listNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
}));
vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));

const orderId = '00000000-0000-4000-8000-000000000401';
const promoId = '00000000-0000-4000-8000-000000000402';
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

function item(id: string, category: 'ORDERS' | 'PROMOTIONS' | 'SYSTEM' | 'ACCOUNT', title: string) {
  const type =
    category === 'PROMOTIONS'
      ? ('VOUCHER_ASSIGNED' as const)
      : category === 'ORDERS'
        ? ('ORDER_CONFIRMED' as const)
        : ('SYSTEM_NOTICE' as const);
  return {
    id,
    category,
    type,
    title,
    body: `${title} chi tiết`,
    metadata: {
      targetUrl: '/account/orders/0000-1111',
      thumbnailUrl: null,
      referenceId: null,
      amountMinor: null,
      currency: null,
    },
    isRead: false,
    readAt: null,
    isArchived: false,
    createdAt: timestamp,
  };
}

describe('NotificationInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthSession).mockReturnValue(authenticated as never);
    vi.mocked(listNotifications).mockImplementation(async (params) => {
      if (params.category === 'PROMOTIONS') {
        return {
          notificationVersion: 'notifications-v1',
          items: [item(promoId, 'PROMOTIONS', 'Voucher mới')],
          nextCursor: null,
          unreadCount: 1,
        };
      }
      if (params.category === 'SYSTEM' || params.category === 'ACCOUNT') {
        return {
          notificationVersion: 'notifications-v1',
          items:
            params.category === 'SYSTEM'
              ? [item('00000000-0000-4000-8000-000000000403', 'SYSTEM', 'Bảo trì hệ thống')]
              : [],
          nextCursor: null,
          unreadCount: 1,
        };
      }
      return {
        notificationVersion: 'notifications-v1',
        items: [item(orderId, 'ORDERS', 'Đơn hàng đã xác nhận')],
        nextCursor: null,
        unreadCount: 2,
      };
    });
    vi.mocked(markAllNotificationsRead).mockResolvedValue({
      updatedCount: 2,
      readAt: timestamp,
    });
  });

  it('loads the all tab and switches category filters', async () => {
    const user = userEvent.setup();
    render(<NotificationInbox />);

    expect(await screen.findByText('Đơn hàng đã xác nhận')).toBeInTheDocument();
    expect(listNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'ALL', limit: 20 }),
      authenticatedFetch,
    );

    await user.click(screen.getByRole('tab', { name: 'Khuyến mãi' }));
    expect(await screen.findByText('Voucher mới')).toBeInTheDocument();
    await waitFor(() =>
      expect(listNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'PROMOTIONS', limit: 20 }),
        authenticatedFetch,
      ),
    );

    await user.click(screen.getByRole('tab', { name: 'Hệ thống' }));
    expect(await screen.findByText('Bảo trì hệ thống')).toBeInTheDocument();
    await waitFor(() => {
      expect(listNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'SYSTEM' }),
        authenticatedFetch,
      );
      expect(listNotifications).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'ACCOUNT' }),
        authenticatedFetch,
      );
    });
  });

  it('marks all notifications as read from the inbox toolbar', async () => {
    const user = userEvent.setup();
    render(<NotificationInbox />);
    await screen.findByText('Đơn hàng đã xác nhận');
    await user.click(screen.getByRole('button', { name: 'Đánh dấu tất cả đã đọc' }));
    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalledWith(authenticatedFetch));
  });
});

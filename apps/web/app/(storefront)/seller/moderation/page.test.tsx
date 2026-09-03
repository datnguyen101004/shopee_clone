import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthSession } from '../../../../components/auth-session-provider';
import {
  listSellerModerationNotices,
  markSellerModerationNoticeRead,
} from '../../../../lib/seller-moderation-api';
import SellerModerationNoticesPage from './page';

vi.mock('../../../../components/auth-session-provider', () => ({ useAuthSession: vi.fn() }));
vi.mock('../../../../lib/seller-moderation-api', () => ({
  listSellerModerationNotices: vi.fn(),
  markSellerModerationNoticeRead: vi.fn(),
}));

const authenticatedFetch = vi.fn();
const notice = {
  id: '30000000-0000-4000-8000-000000000011',
  targetType: 'PRODUCT',
  targetId: '30000000-0000-4000-8000-000000000012',
  targetName: 'Sản phẩm bị đình chỉ',
  targetSlug: null,
  action: 'PRODUCT_SUSPENDED',
  reason: 'Sản phẩm vi phạm chính sách hàng giả.',
  effectiveAt: '2026-08-21T00:00:00.000Z',
  readAt: null,
  reporterOpaqueId: 'reporter-private',
  privateNote: 'private-note',
} as const;

describe('SellerModerationNoticesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthSession).mockReturnValue({
      state: {
        status: 'authenticated',
        user: { id: '30000000-0000-4000-8000-000000000013', roles: ['buyer', 'seller'] },
      },
      authenticatedFetch,
    } as unknown as ReturnType<typeof useAuthSession>);
  });

  it('shows only seller-safe data and acknowledges an unread notice idempotently', async () => {
    const user = userEvent.setup();
    vi.mocked(listSellerModerationNotices).mockResolvedValue({
      items: [notice],
      unreadCount: 1,
      nextCursor: null,
    } as never);
    vi.mocked(markSellerModerationNoticeRead).mockResolvedValue({
      noticeId: notice.id,
      readAt: '2026-08-21T01:00:00.000Z',
    });

    render(<SellerModerationNoticesPage />);

    expect(await screen.findByText('Sản phẩm bị đình chỉ')).toBeInTheDocument();
    expect(screen.queryByText('reporter-private')).not.toBeInTheDocument();
    expect(screen.queryByText('private-note')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đánh dấu đã đọc' }));
    await waitFor(() => expect(markSellerModerationNoticeRead).toHaveBeenCalledWith(authenticatedFetch, notice.id));
    expect(await screen.findByText('Đã đánh dấu thông báo là đã đọc.')).toBeInTheDocument();
  });

  it('reloads with the unread-only filter', async () => {
    const user = userEvent.setup();
    vi.mocked(listSellerModerationNotices).mockResolvedValue({
      items: [],
      unreadCount: 0,
      nextCursor: null,
    } as never);

    render(<SellerModerationNoticesPage />);
    await screen.findByText('Không có thông báo kiểm duyệt.');
    await user.click(screen.getByRole('checkbox', { name: 'Chỉ hiện chưa đọc' }));

    await waitFor(() => expect(listSellerModerationNotices).toHaveBeenLastCalledWith(
      authenticatedFetch,
      { unreadOnly: true, cursor: undefined },
    ));
  });
});

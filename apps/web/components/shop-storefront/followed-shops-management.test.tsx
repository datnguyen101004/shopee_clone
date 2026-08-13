import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { getFollowedShops, setShopFollowing } from '../../lib/shop-follow-api';
import { useAuthSession } from '../auth-session-provider';
import { FollowedShopsManagement } from './followed-shops-management';

const replace = vi.fn();
const push = vi.fn();
const router = { replace, push };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('../../lib/shop-follow-api', () => ({
  getFollowedShops: vi.fn(),
  setShopFollowing: vi.fn(),
}));
vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));

const firstShopId = '00000000-0000-4000-8000-000000000101';
const secondShopId = '00000000-0000-4000-8000-000000000102';
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
const populated = {
  items: [
    {
      availability: 'available' as const,
      shopId: firstShopId,
      followedAt: '2026-08-14T03:00:00.000Z',
      shop: {
        id: firstShopId,
        slug: 'demo-shop',
        name: 'Demo Shop',
        href: '/shops/demo-shop',
        location: 'Hà Nội',
        followerCount: 12,
      },
    },
    {
      availability: 'unavailable' as const,
      shopId: secondShopId,
      followedAt: '2026-08-13T03:00:00.000Z',
      shop: { id: secondShopId, name: 'Shop đã dừng', href: null },
    },
  ],
  pagination: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 },
};

describe('FollowedShopsManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthSession).mockReturnValue(authenticated as never);
    vi.mocked(getFollowedShops).mockResolvedValue(populated);
    vi.mocked(setShopFollowing).mockResolvedValue({
      shopId: firstShopId,
      isFollowing: false,
      followedAt: null,
      followerCount: 11,
    });
  });

  it('waits for session restoration and gives guests a safe login handoff', () => {
    vi.mocked(useAuthSession).mockReturnValue({
      ...authenticated,
      state: { status: 'loading', user: null },
    } as never);
    const { rerender } = render(<FollowedShopsManagement query={{ page: 1, pageSize: 20 }} />);
    expect(screen.getByText('Đang kiểm tra phiên đăng nhập…')).toBeInTheDocument();
    expect(getFollowedShops).not.toHaveBeenCalled();

    vi.mocked(useAuthSession).mockReturnValue({
      ...authenticated,
      state: { status: 'guest', user: null },
    } as never);
    rerender(<FollowedShopsManagement query={{ page: 1, pageSize: 20 }} />);
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Faccount%2Ffollowed-shops',
    );
    expect(localStorage).toHaveLength(0);
  });

  it('renders available links and a privacy-minimal unavailable card', async () => {
    render(<FollowedShopsManagement query={{ page: 1, pageSize: 20 }} />);
    expect(await screen.findByRole('link', { name: 'Xem gian hàng Demo Shop' })).toHaveAttribute(
      'href',
      '/shops/demo-shop',
    );
    expect(screen.getByText('Hà Nội · 12 người theo dõi')).toBeInTheDocument();
    const unavailable = screen.getByText('Shop đã dừng').closest<HTMLElement>('[data-shop-id]')!;
    expect(within(unavailable).getByText('Shop hiện không còn khả dụng')).toBeInTheDocument();
    expect(within(unavailable).queryByRole('link')).not.toBeInTheDocument();
    expect(unavailable).not.toHaveTextContent('slug');
    expect(unavailable).not.toHaveTextContent('người theo dõi');
  });

  it('retains a card while pending, prevents duplicates, and refetches after confirmation', async () => {
    let confirm!: () => void;
    vi.mocked(setShopFollowing).mockReturnValue(
      new Promise((resolve) => {
        confirm = () =>
          resolve({
            shopId: firstShopId,
            isFollowing: false,
            followedAt: null,
            followerCount: 11,
          });
      }),
    );
    vi.mocked(getFollowedShops)
      .mockResolvedValueOnce(populated)
      .mockResolvedValueOnce({
        items: [populated.items[1]!],
        pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      });
    const user = userEvent.setup();
    render(<FollowedShopsManagement query={{ page: 1, pageSize: 20 }} />);
    const button = await screen.findByRole('button', { name: 'Bỏ theo dõi Demo Shop' });
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button);
    expect(button).toBeDisabled();
    expect(screen.getByText('Demo Shop')).toBeInTheDocument();
    expect(setShopFollowing).toHaveBeenCalledTimes(1);
    confirm();
    await waitFor(() => expect(screen.queryByText('Demo Shop')).not.toBeInTheDocument());
    expect(getFollowedShops).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Đã bỏ theo dõi Demo Shop.');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Bỏ theo dõi Shop đã dừng' })).toHaveFocus(),
    );
  });

  it('keeps the card and announces a retryable mutation failure', async () => {
    vi.mocked(setShopFollowing).mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<FollowedShopsManagement query={{ page: 1, pageSize: 20 }} />);
    await user.click(await screen.findByRole('button', { name: 'Bỏ theo dõi Demo Shop' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Chưa thể bỏ theo dõi Demo Shop. Vui lòng thử lại.',
    );
    expect(screen.getByText('Demo Shop')).toBeInTheDocument();
  });

  it('handles empty, invalid, recoverable failure, and out-of-range pages', async () => {
    vi.mocked(getFollowedShops).mockResolvedValueOnce({
      items: [],
      pagination: { page: 3, pageSize: 20, totalItems: 21, totalPages: 2 },
    });
    const { unmount } = render(<FollowedShopsManagement query={{ page: 3, pageSize: 20 }} />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/account/followed-shops?page=2&pageSize=20'),
    );
    unmount();

    vi.mocked(getFollowedShops).mockRejectedValueOnce(new Error('offline'));
    const failed = render(<FollowedShopsManagement query={{ page: 1, pageSize: 20 }} />);
    expect(await screen.findByText('Chưa thể tải dữ liệu tài khoản')).toBeInTheDocument();
    failed.unmount();

    render(<FollowedShopsManagement query={null} />);
    expect(screen.getByText('Đường dẫn chưa hợp lệ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở danh sách từ trang đầu' })).toHaveAttribute(
      'href',
      '/account/followed-shops?page=1&pageSize=20',
    );
  });

  it('moves to the preceding page after removing the final item on a later page', async () => {
    vi.mocked(getFollowedShops)
      .mockResolvedValueOnce({
        items: [populated.items[0]!],
        pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 },
      })
      .mockResolvedValueOnce({
        items: [],
        pagination: { page: 2, pageSize: 20, totalItems: 20, totalPages: 1 },
      });
    const user = userEvent.setup();
    render(<FollowedShopsManagement query={{ page: 2, pageSize: 20 }} />);
    await user.click(await screen.findByRole('button', { name: 'Bỏ theo dõi Demo Shop' }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/account/followed-shops?page=1&pageSize=20'),
    );
  });
});

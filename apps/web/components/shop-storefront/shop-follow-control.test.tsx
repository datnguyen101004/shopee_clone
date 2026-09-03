import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { getShopFollowStatus, setShopFollowing } from '../../lib/shop-follow-api';
import { useAuthSession } from '../auth-session-provider';
import { ShopFollowControl } from './shop-follow-control';

vi.mock('../../lib/shop-follow-api', () => ({
  getShopFollowStatus: vi.fn(),
  setShopFollowing: vi.fn(),
  ShopFollowApiError: class ShopFollowApiError extends Error {
    status = 0;
  },
}));
vi.mock('../auth-session-provider', () => ({ useAuthSession: vi.fn() }));

const shopId = '00000000-0000-4000-8000-000000000101';
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

describe('ShopFollowControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthSession).mockReturnValue(authenticated as never);
    vi.mocked(getShopFollowStatus).mockResolvedValue({ items: [{ shopId, isFollowing: false }] });
  });

  it('hydrates after session restoration and confirms an optimistic follow', async () => {
    vi.mocked(setShopFollowing).mockResolvedValue({
      shopId,
      isFollowing: true,
      followedAt: '2026-08-14T03:00:00.000Z',
      followerCount: 11,
    });
    const user = userEvent.setup();
    render(
      <ShopFollowControl
        shopId={shopId}
        initialFollowerCount={10}
        loginHref="/login?returnTo=%2Fshops%2Fdemo-shop"
      />,
    );
    const button = await screen.findByRole('button', { name: 'Theo dõi' });
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(setShopFollowing).toHaveBeenCalledTimes(1));
    expect(screen.getByText('11 người theo dõi')).toBeInTheDocument();
  });

  it('prevents duplicate requests and rolls back failures accessibly', async () => {
    let reject!: () => void;
    vi.mocked(setShopFollowing).mockReturnValue(
      new Promise((_, fail) => {
        reject = () => fail(new Error('offline'));
      }),
    );
    const user = userEvent.setup();
    render(
      <ShopFollowControl
        shopId={shopId}
        initialFollowerCount={10}
        loginHref="/login?returnTo=%2Fshops%2Fdemo-shop"
      />,
    );
    const button = await screen.findByRole('button', { name: 'Theo dõi' });
    await user.click(button);
    await user.click(button);
    expect(setShopFollowing).toHaveBeenCalledTimes(1);
    reject();
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByRole('status')).toHaveTextContent('Thay đổi đã được hoàn tác');
    expect(screen.getByText('10 người theo dõi')).toBeInTheDocument();
  });

  it('renders only a safe sign-in handoff for guests', () => {
    vi.mocked(useAuthSession).mockReturnValue({
      ...authenticated,
      state: { status: 'guest', user: null },
    } as never);
    render(
      <ShopFollowControl
        shopId={shopId}
        initialFollowerCount={10}
        loginHref="/login?returnTo=%2Fshops%2Fdemo-shop"
      />,
    );
    expect(screen.getByRole('link', { name: 'Đăng nhập để theo dõi' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fshops%2Fdemo-shop',
    );
    expect(localStorage).toHaveLength(0);
  });
});

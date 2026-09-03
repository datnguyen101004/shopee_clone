import type { AuthUser } from '@shopee-clone/contracts';
import { render, screen, waitFor } from '@testing-library/react';

import { useAuthSession } from './auth-session-provider';
import { AdminEntryPage, SellerEntryPage } from './role-entry-pages';

vi.mock('./auth-session-provider', () => ({ useAuthSession: vi.fn() }));

const buyer: AuthUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'buyer@example.test',
  displayName: 'Buyer Example',
  status: 'active',
  roles: ['buyer'],
};
const authenticatedFetch = vi.fn();

function mockState(state: ReturnType<typeof useAuthSession>['state']) {
  vi.mocked(useAuthSession).mockReturnValue({
    state,
    authenticatedFetch,
  } as unknown as ReturnType<typeof useAuthSession>);
}

describe('role-aware operational entry pages', () => {
  beforeEach(() => {
    authenticatedFetch.mockReset();
    vi.mocked(useAuthSession).mockReset();
  });

  it('shows stable loading and guest sign-in guidance without protected requests', () => {
    mockState({ status: 'loading', user: null });
    const { rerender } = render(<SellerEntryPage />);
    expect(screen.getByText('Đang kiểm tra quyền truy cập')).toBeInTheDocument();
    mockState({ status: 'guest', user: null });
    rerender(<SellerEntryPage />);
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('shows a buyer forbidden state and never flashes seller data', () => {
    mockState({ status: 'authenticated', user: buyer });
    render(<SellerEntryPage />);
    expect(screen.getByText('Không có quyền truy cập')).toBeInTheDocument();
    expect(screen.queryByText('Seller Shop')).not.toBeInTheDocument();
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('loads only the current seller safe shop projection', async () => {
    mockState({ status: 'authenticated', user: { ...buyer, roles: ['buyer', 'seller'] } });
    authenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '00000000-0000-4000-8000-000000000101',
          slug: 'seller-shop',
          name: 'Seller Shop',
          status: 'active',
        }),
        { status: 200 },
      ),
    );
    render(<SellerEntryPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Seller Shop' })).toBeVisible());
    expect(screen.getByText('seller-shop')).toBeVisible();
  });

  it('keeps seller and admin routes isolated and handles stale-role denial', async () => {
    mockState({ status: 'authenticated', user: { ...buyer, roles: ['buyer', 'admin'] } });
    authenticatedFetch.mockResolvedValue(new Response(null, { status: 403 }));
    const { rerender } = render(<SellerEntryPage />);
    expect(screen.getByText('Không có quyền truy cập')).toBeInTheDocument();

    authenticatedFetch.mockResolvedValueOnce(new Response(null, { status: 403 }));
    rerender(<AdminEntryPage />);
    await waitFor(() =>
      expect(
        screen.getByText('Quyền hiện tại không còn đủ để truy cập khu vực này.'),
      ).toBeVisible(),
    );
  });
});

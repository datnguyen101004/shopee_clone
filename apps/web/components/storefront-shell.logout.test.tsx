import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { useAuthSession } from './auth-session-provider';
import { useCart } from './cart/cart-provider';
import { StorefrontShell } from './storefront-shell';

const testState = vi.hoisted(() => ({
  pathname: '/',
  router: {
    refresh: vi.fn(),
    replace: vi.fn(),
  },
  logout: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => testState.pathname,
  useRouter: () => testState.router,
}));

vi.mock('./auth-session-provider', () => ({
  useAuthSession: vi.fn(),
}));

vi.mock('./cart/cart-provider', () => ({
  useCart: vi.fn(),
}));

vi.mock('./chat/chat-provider', () => ({
  ChatProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./chat/floating-chat', () => ({
  FloatingChat: () => null,
}));

vi.mock('./notifications/notification-bell', () => ({
  NotificationBell: () => null,
}));

const authenticatedState = {
  status: 'authenticated' as const,
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'buyer@example.com',
    displayName: 'Buyer Example',
    status: 'active' as const,
    roles: ['buyer'] as ['buyer'],
  },
};

function renderShell() {
  return render(
    <StorefrontShell>
      <h1>Trang chủ</h1>
    </StorefrontShell>,
  );
}

async function logoutFromMenu() {
  const user = userEvent.setup();
  await user.hover(screen.getByLabelText('Tài khoản Buyer Example'));
  await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));
}

describe('StorefrontShell logout', () => {
  beforeEach(() => {
    testState.pathname = '/';
    testState.router.refresh.mockReset();
    testState.router.replace.mockReset();
    testState.logout.mockReset();
    testState.logout.mockResolvedValue(undefined);
    vi.mocked(useAuthSession).mockReturnValue({
      state: authenticatedState,
      logout: testState.logout,
    } as unknown as ReturnType<typeof useAuthSession>);
    vi.mocked(useCart).mockReturnValue({
      state: { status: 'unauthenticated', cart: null },
    } as ReturnType<typeof useCart>);
  });

  it('refreshes the anonymous homepage after logout from the homepage', async () => {
    renderShell();

    await logoutFromMenu();

    await waitFor(() => expect(testState.logout).toHaveBeenCalledTimes(1));
    expect(testState.router.refresh).toHaveBeenCalledTimes(1);
    expect(testState.router.replace).not.toHaveBeenCalled();
  });

  it('returns to the homepage after logout from another storefront route', async () => {
    testState.pathname = '/account/profile';
    renderShell();

    await logoutFromMenu();

    await waitFor(() => expect(testState.logout).toHaveBeenCalledTimes(1));
    expect(testState.router.replace).toHaveBeenCalledWith('/');
    expect(testState.router.refresh).not.toHaveBeenCalled();
  });
});

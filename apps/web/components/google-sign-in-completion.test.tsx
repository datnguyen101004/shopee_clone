import { render, screen, waitFor } from '@testing-library/react';

import { GoogleSignInCompletionView } from './google-sign-in-completion';
import { useAuthSession } from './auth-session-provider';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('./auth-session-provider', () => ({ useAuthSession: vi.fn() }));

describe('GoogleSignInCompletionView', () => {
  const completeGoogleSignIn = vi.fn();

  beforeEach(() => {
    replace.mockReset();
    completeGoogleSignIn.mockReset();
    vi.spyOn(window.history, 'replaceState');
    vi.mocked(useAuthSession).mockReturnValue({
      completeGoogleSignIn,
    } as unknown as ReturnType<typeof useAuthSession>);
  });

  afterEach(() => vi.restoreAllMocks());

  it('restores once, removes outcome parameters, and navigates to the safe path', async () => {
    completeGoogleSignIn.mockResolvedValue({ user: {} });
    render(
      <GoogleSignInCompletionView
        completion={{
          outcome: 'success',
          returnTo: '/products/00000000-0000-4000-8000-000000000010',
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Đang hoàn tất');
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/products/00000000-0000-4000-8000-000000000010'),
    );
    expect(completeGoogleSignIn).toHaveBeenCalledTimes(1);
    expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/login/google/complete');
  });

  it('keeps cancellation generic and does not attempt session restoration', () => {
    render(<GoogleSignInCompletionView completion={{ outcome: 'cancelled', returnTo: '/' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('hủy đăng nhập Google');
    expect(completeGoogleSignIn).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Quay lại đăng nhập' })).toHaveAttribute(
      'href',
      '/login',
    );
  });
});

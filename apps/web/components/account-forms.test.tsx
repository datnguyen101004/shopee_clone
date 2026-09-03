import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AuthApiError, requestPasswordReset } from '../lib/auth-api';
import { LoginForm, ForgotPasswordForm, RegisterForm } from './account-forms';
import { useAuthSession } from './auth-session-provider';

const replace = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('../lib/auth-api', () => ({
  AuthApiError: class AuthApiError extends Error {
    constructor(
      public readonly kind: 'transport' | 'status' | 'contract',
      public readonly status = 0,
      public readonly problem: { type: string } | null = null,
    ) {
      super('Authentication API error');
    }
  },
  googleSignInStartUrl: vi.fn(
    (returnTo?: string) =>
      `http://localhost:3001/api/v1/auth/google/start?returnTo=${encodeURIComponent(returnTo ?? '/')}`,
  ),
  requestPasswordReset: vi.fn(),
  resetAccountPassword: vi.fn(),
}));
vi.mock('./auth-session-provider', () => ({ useAuthSession: vi.fn() }));

describe('account forms', () => {
  const login = vi.fn();
  const register = vi.fn();

  beforeEach(() => {
    replace.mockReset();
    login.mockReset();
    register.mockReset();
    vi.mocked(requestPasswordReset).mockReset();
    vi.mocked(useAuthSession).mockReturnValue({
      state: { status: 'guest', user: null },
      login,
      register,
      logout: vi.fn(),
      restore: vi.fn(),
      completeGoogleSignIn: vi.fn(),
      authenticatedFetch: vi.fn(),
      sessionFetch: vi.fn(),
      synchronizeDisplayName: vi.fn(),
    } as ReturnType<typeof useAuthSession>);
  });

  it('labels login fields, clears a rejected password, and focuses the generic error', async () => {
    login.mockRejectedValue(new Error('internal secret'));
    const user = userEvent.setup();
    render(<LoginForm intent={null} />);
    expect(screen.getByRole('link', { name: 'Tiếp tục với Google' })).toHaveAttribute(
      'href',
      'http://localhost:3001/api/v1/auth/google/start?returnTo=%2F',
    );
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'Buyer@Example.com');
    const password = screen.getByLabelText('Mật khẩu');
    await user.type(password, 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không thể đăng nhập');
    expect(alert).toHaveFocus();
    expect(password).toHaveValue('');
    expect(login).toHaveBeenCalledWith({ email: 'buyer@example.com', password: 'wrong password' });
    expect(document.body).not.toHaveTextContent('internal secret');
  });

  it('shows the paired account and shop feedback for a verified suspended login', async () => {
    login.mockRejectedValue(
      new AuthApiError('status', 403, {
        type: 'https://shopee-clone.local/problems/account-and-shop-disabled',
        title: 'Account and shop disabled',
        status: 403,
        detail: 'The account and its shop have been disabled.',
      }),
    );
    const user = userEvent.setup();
    render(<LoginForm intent={null} />);
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'seller@example.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'correct passphrase');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tài khoản và shop của bạn đã bị vô hiệu hóa');
  });

  it('prevents duplicate login submission and returns only to an allowlisted product path', async () => {
    let resolveLogin!: () => void;
    login.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveLogin = resolve;
      }),
    );
    const user = userEvent.setup();
    const productId = '00000000-0000-4000-8000-000000000010';
    render(
      <LoginForm
        intent={{
          intent: 'buy-now',
          productId,
          variantId: '00000000-0000-4000-8000-000000000011',
          quantity: '1',
          returnTo: `/products/${productId}`,
        }}
      />,
    );
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'buyer@example.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'secure passphrase');
    const submit = screen.getByRole('button', { name: 'Đăng nhập' });
    await user.dblClick(submit);
    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Thao tác chưa được thực hiện/)).toBeInTheDocument();
    resolveLogin();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/products/${productId}`));
  });

  it('keeps password confirmation browser-only during registration', async () => {
    register.mockResolvedValue({});
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(screen.getByRole('textbox', { name: 'Tên hiển thị' }), 'Buyer Example');
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'buyer@example.com');
    await user.type(screen.getByLabelText('Mật khẩu'), 'safe passphrase 2026');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu'), 'safe passphrase 2026');
    await user.click(screen.getByRole('button', { name: 'Đăng ký' }));
    expect(register).toHaveBeenCalledWith({
      displayName: 'Buyer Example',
      email: 'buyer@example.com',
      password: 'safe passphrase 2026',
    });
    expect(register.mock.calls[0]?.[0]).not.toHaveProperty('confirmation');
  });

  it('always shows the same accepted recovery message', async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue();
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'unknown@example.com');
    await user.click(screen.getByRole('button', { name: 'Gửi hướng dẫn' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Nếu tài khoản đủ điều kiện');
  });
});

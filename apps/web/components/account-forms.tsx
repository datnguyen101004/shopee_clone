'use client';

import {
  AUTH_DISPLAY_NAME_MAX_LENGTH,
  AUTH_PASSWORD_MAX_LENGTH,
  isAcceptedAuthPassword,
  isValidAuthEmail,
  normalizeAuthEmail,
} from '@shopee-clone/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import {
  AuthApiError,
  googleSignInStartUrl,
  requestPasswordReset,
  resetAccountPassword,
} from '../lib/auth-api';
import type { ProductLoginIntent } from '../lib/login-intent';
import { useAuthSession } from './auth-session-provider';

function AccountError({ message }: { message: string }) {
  const reference = useRef<HTMLDivElement>(null);
  useEffect(() => reference.current?.focus(), [message]);
  return (
    <div ref={reference} className="account-form__message is-error" role="alert" tabIndex={-1}>
      {message}
    </div>
  );
}

function AccountSuccess({ children }: { children: string }) {
  return (
    <div className="account-form__message is-success" role="status" aria-live="polite">
      {children}
    </div>
  );
}

export function LoginForm({
  intent,
  resetSucceeded = false,
  returnTo = '/',
}: {
  intent: ProductLoginIntent | null;
  resetSucceeded?: boolean;
  returnTo?: string;
}) {
  const router = useRouter();
  const { login } = useAuthSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const email = normalizeAuthEmail(String(form.get('email') ?? ''));
    if (
      !isValidAuthEmail(email) ||
      password.length === 0 ||
      password.length > AUTH_PASSWORD_MAX_LENGTH
    ) {
      setError('Vui lòng nhập email và mật khẩu hợp lệ.');
      setPassword('');
      return;
    }
    setPending(true);
    setError('');
    try {
      await login({ email, password });
      router.replace(intent?.returnTo ?? returnTo);
    } catch (caught: unknown) {
      if (
        caught instanceof AuthApiError &&
        caught.problem?.type ===
          'https://shopee-clone.local/problems/account-and-shop-disabled'
      ) {
        setError('Tài khoản và shop của bạn đã bị vô hiệu hóa. Vui lòng liên hệ hỗ trợ.');
      } else {
        setError('Không thể đăng nhập. Vui lòng kiểm tra thông tin và thử lại.');
      }
      setPassword('');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="account-form" noValidate onSubmit={submit} aria-busy={pending}>
      {resetSucceeded ? (
        <AccountSuccess>Mật khẩu đã được đổi. Bạn có thể đăng nhập.</AccountSuccess>
      ) : null}
      {intent ? (
        <p className="account-form__intent">
          Đăng nhập để quay lại sản phẩm và tiếp tục thao tác{' '}
          {intent.intent === 'buy-now' ? 'Mua ngay' : 'Thêm vào giỏ hàng'}. Thao tác chưa được thực
          hiện.
        </p>
      ) : null}
      <a
        className="account-form__google"
        href={googleSignInStartUrl(intent?.returnTo ?? returnTo)}
        aria-label="Tiếp tục với Google"
      >
        <span aria-hidden="true">G</span>
        Tiếp tục với Google
      </a>
      <div className="account-form__separator" aria-hidden="true">
        <span>hoặc</span>
      </div>
      <label htmlFor="login-email">Email</label>
      <input id="login-email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="login-password">Mật khẩu</label>
      <input
        id="login-password"
        name="password"
        type="password"
        autoComplete="current-password"
        maxLength={AUTH_PASSWORD_MAX_LENGTH}
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {error ? <AccountError message={error} /> : null}
      <button type="submit" disabled={pending}>
        {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
      <div className="account-form__links">
        <Link href="/forgot-password">Quên mật khẩu?</Link>
        <Link href="/register">Tạo tài khoản</Link>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const { register } = useAuthSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get('displayName') ?? '').trim();
    const email = normalizeAuthEmail(String(form.get('email') ?? ''));
    if (
      displayName.length < 2 ||
      displayName.length > AUTH_DISPLAY_NAME_MAX_LENGTH ||
      !isValidAuthEmail(email) ||
      !isAcceptedAuthPassword(password) ||
      password !== confirmation
    ) {
      setError('Vui lòng kiểm tra tên, email và hai ô mật khẩu.');
      setPassword('');
      setConfirmation('');
      return;
    }
    setPending(true);
    setError('');
    try {
      await register({ displayName, email, password });
      router.replace('/');
    } catch {
      setError('Không thể tạo tài khoản với thông tin này. Vui lòng thử lại.');
      setPassword('');
      setConfirmation('');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="account-form" noValidate onSubmit={submit} aria-busy={pending}>
      <label htmlFor="register-name">Tên hiển thị</label>
      <input
        id="register-name"
        name="displayName"
        autoComplete="name"
        minLength={2}
        maxLength={AUTH_DISPLAY_NAME_MAX_LENGTH}
        required
      />
      <label htmlFor="register-email">Email</label>
      <input id="register-email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="register-password">Mật khẩu</label>
      <input
        id="register-password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={AUTH_PASSWORD_MAX_LENGTH}
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        aria-describedby="register-password-help"
      />
      <small id="register-password-help">Dùng 8–128 ký tự và tránh mật khẩu phổ biến.</small>
      <label htmlFor="register-confirmation">Nhập lại mật khẩu</label>
      <input
        id="register-confirmation"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      {error ? <AccountError message={error} /> : null}
      <button type="submit" disabled={pending}>
        {pending ? 'Đang tạo tài khoản…' : 'Đăng ký'}
      </button>
      <div className="account-form__links">
        <span>Đã có tài khoản?</span>
        <Link href="/login">Đăng nhập</Link>
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const email = normalizeAuthEmail(String(form.get('email') ?? ''));
    if (!isValidAuthEmail(email)) {
      setError('Vui lòng nhập email hợp lệ.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await requestPasswordReset({ email });
      setAccepted(true);
    } catch {
      setError('Chưa thể gửi yêu cầu. Vui lòng chờ một chút rồi thử lại.');
    } finally {
      setPending(false);
    }
  }

  if (accepted) {
    return (
      <div className="account-form">
        <AccountSuccess>
          Nếu tài khoản đủ điều kiện, hướng dẫn đặt lại mật khẩu đã được gửi.
        </AccountSuccess>
        <Link href="/login">Quay lại đăng nhập</Link>
      </div>
    );
  }
  return (
    <form className="account-form" noValidate onSubmit={submit} aria-busy={pending}>
      <label htmlFor="forgot-email">Email</label>
      <input id="forgot-email" name="email" type="email" autoComplete="email" required />
      {error ? <AccountError message={error} /> : null}
      <button type="submit" disabled={pending}>
        {pending ? 'Đang gửi…' : 'Gửi hướng dẫn'}
      </button>
      <Link href="/login">Quay lại đăng nhập</Link>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(token ? '' : 'Liên kết đặt lại mật khẩu không hợp lệ.');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !token) return;
    if (!isAcceptedAuthPassword(password) || password !== confirmation) {
      setError('Vui lòng nhập hai mật khẩu hợp lệ và giống nhau.');
      setPassword('');
      setConfirmation('');
      return;
    }
    setPending(true);
    setError('');
    try {
      await resetAccountPassword({ token, password });
      router.replace('/login?reset=success');
    } catch {
      setError('Liên kết không hợp lệ, đã hết hạn hoặc đã được sử dụng.');
      setPassword('');
      setConfirmation('');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="account-form" noValidate onSubmit={submit} aria-busy={pending}>
      <label htmlFor="reset-password">Mật khẩu mới</label>
      <input
        id="reset-password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={AUTH_PASSWORD_MAX_LENGTH}
        required
        disabled={!token}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <label htmlFor="reset-confirmation">Nhập lại mật khẩu mới</label>
      <input
        id="reset-confirmation"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
        disabled={!token}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      {error ? <AccountError message={error} /> : null}
      <button type="submit" disabled={pending || !token}>
        {pending ? 'Đang đổi mật khẩu…' : 'Đổi mật khẩu'}
      </button>
      <Link href="/forgot-password">Yêu cầu liên kết mới</Link>
    </form>
  );
}

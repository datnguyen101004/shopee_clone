'use client';

import type { GoogleSignInCompletion } from '@shopee-clone/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useAuthSession } from './auth-session-provider';

const outcomeMessage = {
  cancelled: 'Bạn đã hủy đăng nhập Google. Bạn có thể thử lại hoặc dùng email.',
  failed: 'Không thể xác minh đăng nhập Google. Vui lòng thử lại.',
  'account-method-required':
    'Email này đã có tài khoản. Vui lòng đăng nhập bằng phương thức đã sử dụng trước đó.',
} as const;

export function GoogleSignInCompletionView({ completion }: { completion: GoogleSignInCompletion }) {
  const router = useRouter();
  const { completeGoogleSignIn } = useAuthSession();
  const started = useRef(false);
  const [status, setStatus] = useState<'pending' | 'failed'>(
    completion.outcome === 'success' ? 'pending' : 'failed',
  );

  useEffect(() => {
    window.history.replaceState(null, '', '/login/google/complete');
    if (completion.outcome !== 'success' || started.current) return;
    started.current = true;
    void completeGoogleSignIn().then((session) => {
      if (session) router.replace(completion.returnTo);
      else setStatus('failed');
    });
  }, [completeGoogleSignIn, completion, router]);

  if (status === 'pending') {
    return (
      <div className="account-form" aria-busy="true">
        <div className="account-form__message" role="status" aria-live="polite">
          Đang hoàn tất đăng nhập Google…
        </div>
      </div>
    );
  }

  const message =
    completion.outcome === 'success'
      ? 'Không thể khôi phục phiên đăng nhập. Vui lòng thử lại.'
      : outcomeMessage[completion.outcome];
  return (
    <div className="account-form">
      <div className="account-form__message is-error" role="alert" tabIndex={-1}>
        {message}
      </div>
      <Link href="/login">Quay lại đăng nhập</Link>
    </div>
  );
}

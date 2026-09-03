import { isGoogleSignInCompletion, type GoogleSignInCompletion } from '@shopee-clone/contracts';
import type { Metadata } from 'next';

import { AccountPage } from '../../../../../components/account-page';
import { GoogleSignInCompletionView } from '../../../../../components/google-sign-in-completion';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function GoogleSignInCompletePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const candidate = {
    outcome: one(parameters.outcome),
    returnTo: one(parameters.returnTo),
  };
  const completion: GoogleSignInCompletion = isGoogleSignInCompletion(candidate)
    ? candidate
    : { outcome: 'failed', returnTo: '/' };
  return (
    <AccountPage
      eyebrow="TÀI KHOẢN NGƯỜI MUA"
      title="Đăng nhập Google"
      description="Shopee Clone đang hoàn tất phiên đăng nhập an toàn của bạn."
    >
      <GoogleSignInCompletionView completion={completion} />
    </AccountPage>
  );
}

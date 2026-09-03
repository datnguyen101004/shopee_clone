import type { Metadata } from 'next';

import { ResetPasswordForm } from '../../../components/account-forms';
import { AccountPage } from '../../../components/account-page';

export const metadata: Metadata = { referrer: 'no-referrer' };

export default async function ResetPasswordPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tokenValue = (await searchParams).token;
  const token = typeof tokenValue === 'string' ? tokenValue : null;
  return (
    <AccountPage
      eyebrow="BẢO MẬT TÀI KHOẢN"
      title="Đặt lại mật khẩu"
      description="Liên kết chỉ dùng một lần và có thời hạn 30 phút."
    >
      <ResetPasswordForm token={token} />
    </AccountPage>
  );
}

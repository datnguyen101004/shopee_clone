import { isSafeAuthReturnTo } from '@shopee-clone/contracts';

import { LoginForm } from '../../../components/account-forms';
import { AccountPage } from '../../../components/account-page';
import { safeProductLoginIntent, type ProductLoginIntent } from '../../../lib/login-intent';

export function LoginPageContent({
  intent,
  resetSucceeded = false,
  returnTo = '/',
}: {
  intent: ProductLoginIntent | null;
  resetSucceeded?: boolean;
  returnTo?: string;
}) {
  return (
    <AccountPage
      eyebrow="TÀI KHOẢN NGƯỜI MUA"
      title="Đăng nhập"
      description="Đăng nhập để quản lý phiên mua sắm của bạn trên Shopee Clone."
    >
      <LoginForm intent={intent} resetSucceeded={resetSucceeded} returnTo={returnTo} />
    </AccountPage>
  );
}

export default async function LoginPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  return (
    <LoginPageContent
      intent={safeProductLoginIntent(parameters)}
      resetSucceeded={parameters.reset === 'success'}
      returnTo={
        typeof parameters.returnTo === 'string' && isSafeAuthReturnTo(parameters.returnTo)
          ? parameters.returnTo
          : '/'
      }
    />
  );
}

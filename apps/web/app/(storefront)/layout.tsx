import type { ReactNode } from 'react';

import { AuthSessionProvider } from '../../components/auth-session-provider';
import { CartProvider } from '../../components/cart/cart-provider';
import { StorefrontShell } from '../../components/storefront-shell';

export default function StorefrontLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AuthSessionProvider>
      <CartProvider>
        <StorefrontShell>{children}</StorefrontShell>
      </CartProvider>
    </AuthSessionProvider>
  );
}

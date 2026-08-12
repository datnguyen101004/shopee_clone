import type { ReactNode } from 'react';

import { AuthSessionProvider } from '../../components/auth-session-provider';
import { StorefrontShell } from '../../components/storefront-shell';

export default function StorefrontLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AuthSessionProvider>
      <StorefrontShell>{children}</StorefrontShell>
    </AuthSessionProvider>
  );
}

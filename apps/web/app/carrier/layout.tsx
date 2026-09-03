import type { ReactNode } from 'react';

import { AuthSessionProvider } from '../../components/auth-session-provider';
import { CarrierShell } from '../../components/carrier/carrier-shell';

export default function CarrierLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <AuthSessionProvider>
      <CarrierShell>{children}</CarrierShell>
    </AuthSessionProvider>
  );
}

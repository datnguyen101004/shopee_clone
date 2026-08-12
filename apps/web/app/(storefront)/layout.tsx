import type { ReactNode } from 'react';

import { StorefrontShell } from '../../components/storefront-shell';

export default function StorefrontLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <StorefrontShell>{children}</StorefrontShell>;
}

import type { ReactNode } from 'react';
import { SellerCenterLayout } from '../../../components/seller-center-layout';

export default function SellerLayout({ children }: { children: ReactNode }) {
  return <SellerCenterLayout>{children}</SellerCenterLayout>;
}

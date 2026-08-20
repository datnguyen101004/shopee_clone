import type { ReactNode } from 'react';
import { AdminCenterLayout } from '../../../components/admin/admin-center-layout';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminCenterLayout>{children}</AdminCenterLayout>;
}

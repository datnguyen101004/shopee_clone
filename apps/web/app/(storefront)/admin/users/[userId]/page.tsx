import { AdminUserDetailPage } from '../../../../../components/admin/admin-entity-detail-pages';

export default async function AdminUserDetailRoute({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  return <AdminUserDetailPage userId={userId} />;
}

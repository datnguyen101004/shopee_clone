import { AdminShopDetailPage } from '../../../../../components/admin/admin-entity-detail-pages';

export default async function AdminShopDetailRoute({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = await params;
  return <AdminShopDetailPage shopId={shopId} />;
}

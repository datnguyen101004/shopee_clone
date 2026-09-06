import { AdminProductDetailPage } from '../../../../../components/admin/admin-entity-detail-pages';

export default async function AdminProductDetailRoute({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <AdminProductDetailPage productId={productId} />;
}

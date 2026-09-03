import { AdminReturnDetailScreen } from '../../../../../components/returns/return-workflows';

export default async function AdminReturnDetailPage({
  params,
}: { params: Promise<{ returnReference: string }> }) {
  const { returnReference } = await params;
  return <AdminReturnDetailScreen returnReference={returnReference} />;
}

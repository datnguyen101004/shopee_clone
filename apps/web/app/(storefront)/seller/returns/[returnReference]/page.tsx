import { SellerReturnDetailScreen } from '../../../../../components/returns/return-workflows';

export default async function SellerReturnDetailPage({
  params,
}: { params: Promise<{ returnReference: string }> }) {
  const { returnReference } = await params;
  return <SellerReturnDetailScreen returnReference={returnReference} />;
}

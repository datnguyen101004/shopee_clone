import { BuyerReturnDetailScreen } from '../../../../../components/returns/return-workflows';

export default async function BuyerReturnDetailPage({
  params,
}: { params: Promise<{ returnReference: string }> }) {
  const { returnReference } = await params;
  return <BuyerReturnDetailScreen returnReference={returnReference} />;
}

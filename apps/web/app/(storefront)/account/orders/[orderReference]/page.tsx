import { BuyerOrderDetailScreen } from '../../../../../components/orders/buyer-order-history';

export default async function BuyerOrderDetailPage({
  params,
}: { params: Promise<{ orderReference: string }> }) {
  const { orderReference } = await params;
  return <BuyerOrderDetailScreen orderReference={orderReference} />;
}

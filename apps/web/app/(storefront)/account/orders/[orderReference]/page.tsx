import { BuyerOrderDetailScreen } from '../../../../../components/orders/buyer-order-history';

export default async function BuyerOrderDetailPage({
  params,
}: PageProps<'/account/orders/[orderReference]'>) {
  const { orderReference } = await params;
  return <BuyerOrderDetailScreen orderReference={orderReference} />;
}

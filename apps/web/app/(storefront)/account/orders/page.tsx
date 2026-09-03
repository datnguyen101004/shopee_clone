import { BuyerOrderListScreen } from '../../../../components/orders/buyer-order-history';
import { pickBuyerOrderFilter } from '../../../../lib/order-history-query';
import { redirect } from 'next/navigation';

export default async function BuyerOrdersPage({ searchParams }: PageProps<'/account/orders'>) {
  const params = await searchParams;
  if (params.filter === 'AWAITING_PICKUP') redirect('/account/orders?filter=SHIPPING');
  return <BuyerOrderListScreen filter={pickBuyerOrderFilter(params)} />;
}

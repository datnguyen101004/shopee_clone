import { BuyerOrderListScreen } from '../../../../components/orders/buyer-order-history';
import { pickBuyerOrderFilter } from '../../../../lib/order-history-query';

export default async function BuyerOrdersPage({ searchParams }: PageProps<'/account/orders'>) {
  return <BuyerOrderListScreen filter={pickBuyerOrderFilter(await searchParams)} />;
}

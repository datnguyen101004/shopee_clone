import { SellerOrderDetailScreen } from '../../../../../components/seller-order-management';

export default async function SellerOrderDetailPage({ params }: { params: Promise<{ orderReference: string }> }) {
  const { orderReference } = await params;
  return <SellerOrderDetailScreen orderReference={orderReference} />;
}

import { SellerOrderDetailScreen } from '../../../../../../components/seller-order-management';

export default async function SellerOrderPrintPage({ params }: { params: Promise<{ orderReference: string }> }) {
  const { orderReference } = await params;
  return <SellerOrderDetailScreen orderReference={orderReference} printOnly />;
}

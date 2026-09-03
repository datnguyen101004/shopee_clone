import { Container } from '@shopee-clone/ui';
import { SellerOrderDetailScreen } from '../../../../../../components/seller-order-management';

export default async function SellerOrderPrintPage({ params }: { params: Promise<{ orderReference: string }> }) {
  const { orderReference } = await params;
  return <Container className="operational-page"><SellerOrderDetailScreen orderReference={orderReference} printOnly /></Container>;
}

import { Container } from '@shopee-clone/ui';
import { SellerProductEditor } from '../../../../../../components/seller-product-management';

export default async function EditSellerProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return <Container className="operational-page"><SellerProductEditor productId={productId} /></Container>;
}

import { Container } from '@shopee-clone/ui';
import { SellerProductDetailView } from '../../../../../components/seller-product-detail';
export default async function SellerProductPage({ params }: { params: Promise<{ productId: string }> }) { const { productId } = await params; return <Container className="operational-page"><SellerProductDetailView productId={productId} /></Container>; }

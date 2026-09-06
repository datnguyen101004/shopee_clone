import { SellerProductDetailView } from '../../../../../components/seller-product-detail';
export default async function SellerProductPage({ params }: { params: Promise<{ productId: string }> }) { const { productId } = await params; return <SellerProductDetailView productId={productId} />; }

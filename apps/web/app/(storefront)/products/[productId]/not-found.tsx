import { Container } from '@shopee-clone/ui';
import Link from 'next/link';

export default function ProductNotFound() {
  return (
    <Container className="product-detail-page product-detail-state">
      <h1>Không tìm thấy sản phẩm</h1>
      <p>Sản phẩm có thể không còn được bán hoặc đường dẫn không hợp lệ.</p>
      <Link href="/search">Khám phá sản phẩm</Link>
    </Container>
  );
}

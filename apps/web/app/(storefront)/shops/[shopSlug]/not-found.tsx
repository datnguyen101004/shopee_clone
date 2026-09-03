import { Container } from '@shopee-clone/ui';
import Link from 'next/link';

export default function ShopNotFound() {
  return (
    <Container className="shop-page shop-page__failure">
      <h1>Không tìm thấy shop</h1>
      <p>Shop không tồn tại hoặc hiện không còn hoạt động.</p>
      <Link href="/search">Khám phá sản phẩm khác</Link>
    </Container>
  );
}

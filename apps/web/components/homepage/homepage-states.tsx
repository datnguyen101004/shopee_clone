import { ButtonLink, Card, Container } from '@shopee-clone/ui';

export function HomepageEmptyState() {
  return (
    <Container className="homepage-state">
      <Card>
        <p className="placeholder-eyebrow">SHOPEE CLONE</p>
        <h1>Gian hàng đang được cập nhật</h1>
        <p>Chưa có chương trình phù hợp lúc này. Bạn vẫn có thể khám phá danh mục sản phẩm.</p>
        <ButtonLink href="/search">Khám phá sản phẩm</ButtonLink>
      </Card>
    </Container>
  );
}

export function HomepageErrorState() {
  return (
    <Container className="homepage-state" role="alert">
      <Card>
        <p className="placeholder-eyebrow">KẾT NỐI TẠM GIÁN ĐOẠN</p>
        <h1>Chưa thể tải nội dung mua sắm</h1>
        <p>Vui lòng thử lại. Thanh tìm kiếm và điều hướng vẫn sẵn sàng.</p>
        <ButtonLink href="/">Thử lại</ButtonLink>
      </Card>
    </Container>
  );
}

import { ButtonLink, Card, Container } from '@shopee-clone/ui';

export default async function ProductHandoffPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return (
    <Container className="placeholder-page">
      <Card>
        <p className="placeholder-eyebrow">XEM TRƯỚC SẢN PHẨM</p>
        <h1>Trang sản phẩm đang được hoàn thiện</h1>
        <p>
          Mã sản phẩm: <code>{productId}</code>. Gallery, biến thể và tồn kho chi tiết sẽ được triển
          khai trong T10.
        </p>
        <ButtonLink href="/">Về trang chủ</ButtonLink>
      </Card>
    </Container>
  );
}

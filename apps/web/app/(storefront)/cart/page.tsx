import { ButtonLink, Card, Container, EmptyState, Stack } from '@shopee-clone/ui';

export default function CartPlaceholderPage() {
  return (
    <Container className="placeholder-page">
      <Stack gap="6">
        <div>
          <p className="placeholder-eyebrow">GIỎ HÀNG · 0 SẢN PHẨM</p>
          <h1>Giỏ hàng của bạn</h1>
          <p>Chưa có sản phẩm nào được lưu trong phiên này.</p>
        </div>
        <Card>
          <EmptyState
            title="Giỏ hàng đang trống"
            description="T06 chỉ cung cấp điểm vào nhất quán. Thêm sản phẩm và lưu giỏ hàng sẽ được triển khai ở giai đoạn Commerce MVP."
            action={<ButtonLink href="/">Khám phá sản phẩm</ButtonLink>}
          />
        </Card>
      </Stack>
    </Container>
  );
}

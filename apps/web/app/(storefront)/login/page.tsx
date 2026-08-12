import { Badge, ButtonLink, Card, Container, EmptyState, Stack } from '@shopee-clone/ui';

export default function LoginPlaceholderPage() {
  return (
    <Container className="placeholder-page">
      <Stack gap="6">
        <div>
          <Badge variant="info">TÀI KHOẢN</Badge>
          <h1>Đăng nhập</h1>
          <p>Bạn đang sử dụng Shopee Clone với trạng thái khách.</p>
        </div>
        <Card>
          <EmptyState
            title="Đăng nhập sẽ có trong T11"
            description="Trang này giữ ổn định điểm đến của header; chưa thu thập tài khoản, mật khẩu hoặc tạo phiên đăng nhập."
            action={<ButtonLink href="/">Tiếp tục mua sắm</ButtonLink>}
          />
        </Card>
      </Stack>
    </Container>
  );
}

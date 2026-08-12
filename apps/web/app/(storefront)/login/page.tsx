import { isCanonicalProductId } from '@shopee-clone/contracts';
import { Badge, ButtonLink, Card, Container, EmptyState, Stack } from '@shopee-clone/ui';

function one(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

type LoginIntent = {
  intent: 'add-to-cart' | 'buy-now';
  productId: string;
  quantity: string;
  returnTo: string;
};

function safeIntent(
  searchParams: Record<string, string | string[] | undefined>,
): LoginIntent | null {
  const intent = one(searchParams.intent);
  const productId = one(searchParams.productId);
  const variantId = one(searchParams.variantId);
  const quantity = one(searchParams.quantity);
  const returnTo = one(searchParams.returnTo);
  if (
    !['add-to-cart', 'buy-now'].includes(intent ?? '') ||
    !productId ||
    !variantId ||
    !isCanonicalProductId(productId) ||
    !isCanonicalProductId(variantId) ||
    !quantity ||
    !/^[1-9]\d*$/.test(quantity) ||
    !Number.isSafeInteger(Number(quantity)) ||
    returnTo !== `/products/${productId}`
  )
    return null;
  return { intent: intent as LoginIntent['intent'], productId, quantity, returnTo };
}

export function LoginPlaceholderContent({ intent }: { intent: LoginIntent | null }) {
  const label = intent?.intent === 'buy-now' ? 'Mua ngay' : 'Thêm vào giỏ hàng';
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
            description={
              intent
                ? `${label} ${intent.quantity} sản phẩm đang chờ đăng nhập. Trang này chưa thu thập tài khoản, mật khẩu hoặc tạo phiên đăng nhập.`
                : 'Trang này chưa thu thập tài khoản, mật khẩu hoặc tạo phiên đăng nhập.'
            }
            action={
              <ButtonLink href={intent?.returnTo ?? '/'}>
                {intent ? 'Quay lại sản phẩm' : 'Tiếp tục mua sắm'}
              </ButtonLink>
            }
          />
        </Card>
      </Stack>
    </Container>
  );
}

export default async function LoginPlaceholderPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <LoginPlaceholderContent intent={safeIntent(await searchParams)} />;
}

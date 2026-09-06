import { StorefrontContainer } from '@shopee-clone/ui';

export default function ShopLoading() {
  return (
    <StorefrontContainer className="shop-page shop-page__failure" aria-busy="true">
      <h1>Đang tải shop…</h1>
      <p>Đang chuẩn bị thông tin và sản phẩm của shop.</p>
    </StorefrontContainer>
  );
}

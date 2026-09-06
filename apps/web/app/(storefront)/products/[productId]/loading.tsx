import { StorefrontContainer } from '@shopee-clone/ui';

export default function ProductDetailLoading() {
  return (
    <StorefrontContainer
      className="product-detail-page product-detail-loading"
      aria-busy="true"
      aria-label="Đang tải sản phẩm"
    >
      <span />
      <span />
      <span />
    </StorefrontContainer>
  );
}

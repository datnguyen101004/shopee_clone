import { StorefrontContainer } from '@shopee-clone/ui';

export default function CatalogLoading() {
  return (
    <StorefrontContainer
      className="catalog-page catalog-loading"
      aria-label="Đang tải danh mục sản phẩm"
      aria-busy="true"
    >
      <span className="catalog-skeleton catalog-skeleton--heading" />
      <div className="catalog-grid" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <span className="catalog-skeleton catalog-skeleton--card" key={index} />
        ))}
      </div>
    </StorefrontContainer>
  );
}

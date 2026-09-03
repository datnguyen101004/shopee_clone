import { ButtonLink, Card } from '@shopee-clone/ui';

export function CatalogEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <Card className="catalog-state">
      <h2>Chưa tìm thấy sản phẩm phù hợp</h2>
      <p>
        {filtered
          ? 'Hãy bỏ bớt bộ lọc, đổi khoảng giá hoặc thử một từ khóa khác.'
          : 'Danh mục sản phẩm đang được cập nhật.'}
      </p>
      <div className="catalog-state__actions">
        {filtered ? <ButtonLink href="/search">Xóa tất cả bộ lọc</ButtonLink> : null}
        <ButtonLink href="/" variant={filtered ? 'secondary' : 'primary'}>
          Về trang chủ
        </ButtonLink>
      </div>
    </Card>
  );
}

export function CatalogErrorState({ retryHref }: { retryHref: string }) {
  return (
    <Card className="catalog-state" role="alert">
      <h2>Chưa thể tải danh mục sản phẩm</h2>
      <p>Kết nối dữ liệu đang gián đoạn hoặc đường dẫn chứa bộ lọc không hợp lệ.</p>
      <ButtonLink href={retryHref}>Thử lại</ButtonLink>
    </Card>
  );
}

import { ButtonLink, Card } from '@shopee-clone/ui';

export function CatalogEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <Card className="catalog-state">
      <h2>Chưa tìm thấy sản phẩm phù hợp</h2>
      <p>
        {filtered
          ? 'Danh mục hoặc từ khóa này hiện chưa có sản phẩm hiển thị.'
          : 'Danh mục sản phẩm đang được cập nhật.'}
      </p>
      <div className="catalog-state__actions">
        {filtered ? <ButtonLink href="/search">Xem tất cả sản phẩm</ButtonLink> : null}
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
      <p>Kết nối dữ liệu đang gián đoạn. Bạn có thể thử lại mà không mất ngữ cảnh đang xem.</p>
      <ButtonLink href={retryHref}>Thử lại</ButtonLink>
    </Card>
  );
}

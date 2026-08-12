import { Badge, ButtonLink, Card, Container, EmptyState, Stack } from '@shopee-clone/ui';

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[]; category?: string | string[] }>;
};

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const parameters = await searchParams;
  const query = firstValue(parameters.q).trim();
  const category = firstValue(parameters.category);
  const context = query ? `“${query}”` : category ? `danh mục “${category}”` : 'tất cả sản phẩm';

  return (
    <Container className="placeholder-page">
      <Stack gap="6">
        <div>
          <Badge variant="brand">CATALOGUE PREVIEW</Badge>
          <h1>Kết quả tìm kiếm</h1>
          <p>Đang hiển thị trạng thái chuẩn bị cho {context}.</p>
        </div>
        <Card>
          <EmptyState
            title="Danh mục sản phẩm sắp được cập nhật"
            description="T06 đã kết nối đúng đường dẫn tìm kiếm. Dữ liệu, bộ lọc và độ liên quan sẽ được triển khai trong T08–T09."
            action={<ButtonLink href="/">Về trang chủ</ButtonLink>}
          />
        </Card>
      </Stack>
    </Container>
  );
}

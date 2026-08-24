import { Badge, Container } from '@shopee-clone/ui';

import {
  CatalogContent,
  DiscoveryControls,
  type CatalogRouteContext,
} from '../../../components/catalog/catalog';
import { CatalogEmptyState, CatalogErrorState } from '../../../components/catalog/catalog-states';
import { fetchCatalogProducts } from '../../../lib/catalog-api';
import { catalogSearchHref, pickCatalogQuery } from '../../../lib/catalog-query';

export const dynamic = 'force-dynamic';

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const requested = pickCatalogQuery(await searchParams);
  let response = null;
  try {
    response = await fetchCatalogProducts(requested);
  } catch {
    // The explicit error composition below keeps the shared storefront shell available.
  }

  if (!response) {
    return (
      <Container className="catalog-page">
        <header className="catalog-heading">
          <Badge variant="brand">SHOPEE CLONE</Badge>
          <h1>Khám phá sản phẩm</h1>
          <p>
            Đường dẫn hoặc dịch vụ tìm kiếm hiện chưa thể xử lý. Hãy kiểm tra bộ lọc và thử lại.
          </p>
        </header>
        <CatalogErrorState retryHref={catalogSearchHref(requested)} />
      </Container>
    );
  }

  const context: CatalogRouteContext = {
    ...response.query,
    pageSize: response.pagination.pageSize,
  };
  const isFiltered = [
    response.query.q,
    response.query.category,
    response.query.minPrice,
    response.query.maxPrice,
    response.query.rating,
    response.query.location,
    response.query.availability,
    response.query.promotion,
  ].some((value) => value !== null);

  return (
    <Container className="catalog-page">
      <header className="catalog-heading">
        <Badge variant="brand">SHOPEE CLONE</Badge>
        <h1>{response.query.q ? `Kết quả cho “${response.query.q}”` : 'Khám phá sản phẩm'}</h1>
        <p>Tìm kiếm, lọc và sắp xếp sản phẩm từ các gian hàng đang hoạt động.</p>
      </header>
      <div className="shopee-search-layout">
        <DiscoveryControls response={response} context={context} />
        {response.items.length ? (
          <CatalogContent response={response} context={context} />
        ) : (
          <CatalogEmptyState filtered={isFiltered} />
        )}
      </div>
    </Container>
  );
}

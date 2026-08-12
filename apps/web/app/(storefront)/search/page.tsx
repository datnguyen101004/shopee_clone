import {
  CatalogContent,
  catalogPageHref,
  type CatalogRouteContext,
} from '../../../components/catalog/catalog';
import { CatalogEmptyState, CatalogErrorState } from '../../../components/catalog/catalog-states';
import { fetchCatalogProducts } from '../../../lib/catalog-api';
import { Badge, Container } from '@shopee-clone/ui';

export const dynamic = 'force-dynamic';

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value?: string | string[]): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function positiveInteger(value: string, maximum?: number): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && (!maximum || parsed <= maximum) ? parsed : undefined;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const raw = await searchParams;
  const category = firstValue(raw.category) || undefined;
  const q = firstValue(raw.q) || undefined;
  const page = positiveInteger(firstValue(raw.page)) ?? 1;
  const pageSize = positiveInteger(firstValue(raw.pageSize), 48);
  const context: CatalogRouteContext = {
    ...(category ? { category } : {}),
    ...(q ? { q } : {}),
    ...(pageSize ? { pageSize } : {}),
  };
  const retryHref = catalogPageHref(context, page);

  let response = null;
  try {
    response = await fetchCatalogProducts({ category, page, pageSize });
  } catch {
    // The explicit error composition below keeps the shared storefront shell available.
  }

  const content = response ? (
    response.items.length ? (
      <CatalogContent response={response} context={context} />
    ) : (
      <CatalogEmptyState filtered={Boolean(category || q)} />
    )
  ) : (
    <CatalogErrorState retryHref={retryHref} />
  );

  const description = q
    ? `Từ khóa “${q}” được giữ cho T09; hiện đang hiển thị catalog theo danh mục.`
    : category
      ? `Sản phẩm trong danh mục “${category}” và các danh mục con.`
      : 'Khám phá sản phẩm mới nhất từ các gian hàng.';

  return (
    <Container className="catalog-page">
      <header className="catalog-heading">
        <Badge variant="brand">SHOPEE CLONE</Badge>
        <h1>Danh mục sản phẩm</h1>
        <p>{description}</p>
      </header>
      {content}
    </Container>
  );
}

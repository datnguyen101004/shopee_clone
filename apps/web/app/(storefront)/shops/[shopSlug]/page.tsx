import { isCanonicalShopSlug, type ShopCatalogQuery } from '@shopee-clone/contracts';
import { Badge, Container } from '@shopee-clone/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ShopCatalog } from '../../../../components/shop-storefront/shop-catalog';
import { ShopFollowControl } from '../../../../components/shop-storefront/shop-follow-control';
import { ReportButton } from '../../../../components/reporting/report-button';
import {
  fetchPublicShopCatalog,
  fetchPublicShopProfile,
  ShopStorefrontApiError,
} from '../../../../lib/shop-storefront-api';
import {
  pickShopCatalogQuery,
  ShopRouteQueryError,
  shopLoginHref,
  shopStorefrontHref,
} from '../../../../lib/shop-storefront-query';

export const dynamic = 'force-dynamic';

type ShopPageProps = {
  params: Promise<{ shopSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const formatNumber = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
const formatDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', { month: '2-digit', year: 'numeric' }).format(new Date(value));

export async function generateMetadata({ params }: ShopPageProps): Promise<Metadata> {
  const { shopSlug } = await params;
  if (!isCanonicalShopSlug(shopSlug)) return { title: 'Shop không tồn tại | Shopee Clone' };
  try {
    const shop = await fetchPublicShopProfile(shopSlug);
    return {
      title: `${shop.name} | Shopee Clone`,
      description: `Khám phá ${formatNumber(shop.activeProductCount)} sản phẩm từ ${shop.name}.`,
      alternates: { canonical: `/shops/${shop.slug}` },
    };
  } catch {
    return { title: 'Shop | Shopee Clone' };
  }
}

export default async function ShopStorefrontPage({ params, searchParams }: ShopPageProps) {
  const { shopSlug } = await params;
  if (!isCanonicalShopSlug(shopSlug)) notFound();

  let shop;
  try {
    shop = await fetchPublicShopProfile(shopSlug);
  } catch (error) {
    if (error instanceof ShopStorefrontApiError && error.kind === 'not-found') notFound();
    return (
      <Container className="shop-page shop-page__failure">
        <Badge variant="danger">TẠM THỜI GIÁN ĐOẠN</Badge>
        <h1>Chưa thể tải shop</h1>
        <p>Dịch vụ shop đang gặp sự cố. Vui lòng thử lại sau.</p>
        <Link href={shopStorefrontHref(shopSlug)}>Thử lại</Link>
      </Container>
    );
  }

  let query: ShopCatalogQuery | null = null;
  let catalog = null;
  let catalogMessage: string | null = null;
  try {
    query = pickShopCatalogQuery(await searchParams);
    catalog = await fetchPublicShopCatalog(shopSlug, query);
  } catch (error) {
    catalogMessage =
      error instanceof ShopRouteQueryError ||
      (error instanceof ShopStorefrontApiError && error.kind === 'validation')
        ? 'Bộ lọc sản phẩm không hợp lệ. Hãy xóa bộ lọc và thử lại.'
        : 'Danh sách sản phẩm tạm thời chưa tải được. Thông tin shop vẫn khả dụng.';
  }

  const currentQuery = query
    ? {
        q: query.q,
        category: query.category,
        sort: query.sort,
        page: query.page,
        pageSize: query.pageSize,
      }
    : {};

  return (
    <Container className="shop-page">
      <nav className="shop-breadcrumb" aria-label="Điều hướng shop">
        <Link href="/">Trang chủ</Link>
        <span>/</span>
        <span>{shop.name}</span>
      </nav>
      <header className="shop-profile">
        <div className="shop-profile__banner" aria-hidden="true" />
        <div className="shop-profile__identity">
          <span className="shop-profile__initial" aria-hidden="true">
            {shop.name.trim().charAt(0).toLocaleUpperCase('vi')}
          </span>
          <div>
            <Badge variant="brand">SHOP</Badge>
            <h1>{shop.name}</h1>
            <p>
              {shop.location} · Tham gia {formatDate(shop.joinedAt)}
            </p>
          </div>
          <div className="shop-profile__actions">
            <ShopFollowControl
              shopId={shop.id}
              initialFollowerCount={shop.followerCount}
              loginHref={shopLoginHref(shopSlug, currentQuery)}
            />
            <ReportButton
              targetType="SHOP"
              targetId={shop.id}
              targetName={shop.name}
              label="Tố cáo Shop"
            />
          </div>
        </div>
        <dl className="shop-profile__metrics">
          <div>
            <dt>Sản phẩm</dt>
            <dd>{formatNumber(shop.activeProductCount)}</dd>
          </div>
          <div>
            <dt>Đánh giá</dt>
            <dd>{shop.ratingCount === 0 ? 'Chưa có đánh giá' : `★ ${(shop.ratingAverageBasisPoints / 100).toFixed(1)} (${formatNumber(shop.ratingCount)})`}</dd>
          </div>
          <div>
            <dt>Đã bán</dt>
            <dd>{formatNumber(shop.soldCount)}</dd>
          </div>
          <div>
            <dt>Phản hồi</dt>
            <dd>Chưa có dữ liệu</dd>
          </div>
        </dl>
        <p className="shop-profile__response-note">{shop.responseMetadata.message}</p>
      </header>

      {catalog && query ? (
        <ShopCatalog shopSlug={shopSlug} response={catalog} query={query} />
      ) : (
        <section
          className="shop-catalog shop-catalog__failure"
          aria-labelledby="shop-products-title"
        >
          <h2 id="shop-products-title">Sản phẩm của shop</h2>
          <p role="alert">{catalogMessage}</p>
          <Link href={shopStorefrontHref(shopSlug)}>Xóa bộ lọc và thử lại</Link>
        </section>
      )}
    </Container>
  );
}

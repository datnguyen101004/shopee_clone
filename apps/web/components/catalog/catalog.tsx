import type { CatalogProductCard, CatalogProductsResponse } from '@shopee-clone/contracts';
import { Badge, Card } from '@shopee-clone/ui';
import Image from 'next/image';
import Link from 'next/link';

export interface CatalogRouteContext {
  category?: string;
  q?: string;
  pageSize?: number;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

function ProductCard({ product }: { product: CatalogProductCard }) {
  return (
    <Card className="catalog-card" data-testid="catalog-card">
      <Link href={product.href} className="catalog-card__link" aria-label={`Xem ${product.name}`}>
        <div className="catalog-card__media">
          {product.imageUrl ? (
            <Image src={product.imageUrl} alt={product.imageAlt} width={360} height={360} />
          ) : (
            <span role="img" aria-label={product.imageAlt} className="catalog-card__fallback">
              S
            </span>
          )}
          {product.discountPercent ? (
            <Badge variant="danger">-{product.discountPercent}%</Badge>
          ) : null}
        </div>
        <div className="catalog-card__body">
          <h2>{product.name}</h2>
          <p className="catalog-card__shop">{product.shop.name}</p>
          <div className="catalog-card__price">
            <strong>₫{formatNumber(product.priceMinor)}</strong>
            {product.compareAtPriceMinor ? (
              <del>₫{formatNumber(product.compareAtPriceMinor)}</del>
            ) : null}
          </div>
          <div className="catalog-card__facts">
            <span aria-label={`${(product.ratingAverageBasisPoints / 100).toFixed(1)} trên 5 sao`}>
              ★ {(product.ratingAverageBasisPoints / 100).toFixed(1)} (
              {formatNumber(product.ratingCount)})
            </span>
            <span>Đã bán {formatNumber(product.soldCount)}</span>
          </div>
          <span className="catalog-card__location">{product.shop.location}</span>
        </div>
      </Link>
    </Card>
  );
}

export function catalogPageHref(context: CatalogRouteContext, page: number): string {
  const parameters = new URLSearchParams();
  if (context.category) parameters.set('category', context.category);
  if (context.q) parameters.set('q', context.q);
  if (context.pageSize) parameters.set('pageSize', String(context.pageSize));
  parameters.set('page', String(page));
  return `/search?${parameters.toString()}`;
}

function pageNumbers(current: number, total: number): number[] {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function CatalogPagination({
  response,
  context,
}: {
  response: CatalogProductsResponse;
  context: CatalogRouteContext;
}) {
  const { page, totalPages } = response.pagination;
  if (totalPages <= 1) return null;
  return (
    <nav className="catalog-pagination" aria-label="Phân trang sản phẩm">
      {page > 1 ? (
        <Link href={catalogPageHref(context, page - 1)} aria-label="Trang trước">
          ‹
        </Link>
      ) : (
        <span aria-disabled="true" aria-label="Trang trước">
          ‹
        </span>
      )}
      {pageNumbers(page, totalPages).map((number) =>
        number === page ? (
          <span key={number} aria-current="page" aria-label={`Trang ${number}`}>
            {number}
          </span>
        ) : (
          <Link key={number} href={catalogPageHref(context, number)} aria-label={`Trang ${number}`}>
            {number}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link href={catalogPageHref(context, page + 1)} aria-label="Trang sau">
          ›
        </Link>
      ) : (
        <span aria-disabled="true" aria-label="Trang sau">
          ›
        </span>
      )}
    </nav>
  );
}

export function CatalogContent({
  response,
  context,
}: {
  response: CatalogProductsResponse;
  context: CatalogRouteContext;
}) {
  return (
    <>
      <div className="catalog-grid" aria-label="Danh sách sản phẩm">
        {response.items.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      <CatalogPagination response={response} context={context} />
    </>
  );
}

import type { PublicShopCatalogPage, ShopCatalogQuery } from '@shopee-clone/contracts';
import Link from 'next/link';

import { shopStorefrontHref } from '../../lib/shop-storefront-query';
import { CatalogContent } from '../catalog/catalog';

export function ShopCatalog({
  shopSlug,
  response,
  query,
}: {
  shopSlug: string;
  response: PublicShopCatalogPage;
  query: ShopCatalogQuery;
}) {
  const baseQuery = {
    q: response.query.q,
    category: response.query.category,
    sort: response.query.sort,
    pageSize: response.pagination.pageSize,
  };
  return (
    <section className="shop-catalog" aria-labelledby="shop-products-title">
      <div className="shop-catalog__heading">
        <h2 id="shop-products-title">Sản phẩm của shop</h2>
        <strong>
          {new Intl.NumberFormat('vi-VN').format(response.pagination.totalItems)} sản phẩm
        </strong>
      </div>
      <form
        className="shop-catalog__controls"
        action={`/shops/${encodeURIComponent(shopSlug)}`}
        method="get"
        role="search"
        aria-label="Tìm sản phẩm trong shop"
      >
        <label>
          Từ khóa
          <input name="q" type="search" maxLength={120} defaultValue={query.q ?? ''} />
        </label>
        <label>
          Danh mục
          <select name="category" defaultValue={query.category ?? ''}>
            <option value="">Tất cả danh mục</option>
            {response.categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name} ({category.productCount})
              </option>
            ))}
          </select>
        </label>
        <label>
          Sắp xếp
          <select name="sort" defaultValue={query.sort}>
            <option value="relevance">Liên quan nhất</option>
            <option value="newest">Mới nhất</option>
            <option value="best-selling">Bán chạy</option>
            <option value="price-asc">Giá thấp đến cao</option>
            <option value="price-desc">Giá cao đến thấp</option>
          </select>
        </label>
        {query.pageSize !== 12 ? (
          <input type="hidden" name="pageSize" value={query.pageSize} />
        ) : null}
        <button type="submit">Áp dụng</button>
        <Link href={shopStorefrontHref(shopSlug)}>Xóa lọc</Link>
      </form>
      {query.q || query.category ? (
        <div className="shop-catalog__active" aria-label="Bộ lọc đang áp dụng">
          {query.q ? <span>Từ khóa: {query.q}</span> : null}
          {query.category ? <span>Danh mục: {query.category}</span> : null}
        </div>
      ) : null}
      {response.items.length > 0 ? (
        <CatalogContent
          response={response}
          pageHrefBuilder={(page) => shopStorefrontHref(shopSlug, { ...baseQuery, page })}
        />
      ) : (
        <div className="shop-catalog__empty" role="status">
          <h3>Không tìm thấy sản phẩm phù hợp</h3>
          <p>Hãy thử từ khóa hoặc danh mục khác.</p>
          <Link href={shopStorefrontHref(shopSlug)}>Xem tất cả sản phẩm</Link>
        </div>
      )}
    </section>
  );
}

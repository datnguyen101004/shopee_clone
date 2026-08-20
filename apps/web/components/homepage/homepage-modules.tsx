import type {
  HomepageCampaignModule,
  HomepageCategoryModule,
  HomepageModule,
  HomepageProductModule,
  HomepageProductSummary,
} from '@shopee-clone/contracts';
import { Badge, Card, Container, Truck } from '@shopee-clone/ui';
import Image from 'next/image';
import Link from 'next/link';

import { MarketplaceProductImage } from '../marketplace-product-image';
import { FavoriteButton } from '../engagement/favorite-button';
import { FavoriteStateProvider } from '../engagement/favorite-state-provider';

const icons: Record<string, string> = { device: '⚡', phone: '📱', home: '🏠', kitchen: '🍳' };

function CampaignSection({ module }: { module: HomepageCampaignModule }) {
  return (
    <section
      className="homepage-campaign"
      aria-labelledby={`module-${module.id}`}
      data-module-type={module.type}
    >
      {module.banners.map((banner) => (
        <div className="hero" key={banner.id}>
          <div className="hero__content">
            {banner.eyebrow ? <Badge variant="brand">{banner.eyebrow}</Badge> : null}
            <h1 id={`module-${module.id}`}>{banner.title}</h1>
            {banner.description ? <p>{banner.description}</p> : null}
            <Link className="homepage-primary-action" href={banner.href}>
              Săn deal ngay
            </Link>
          </div>
          <div className="hero__art">
            {banner.imageUrl ? (
              <Image src={banner.imageUrl} alt={banner.altText} width={420} height={320} priority />
            ) : (
              <span className="homepage-media-fallback" role="img" aria-label={banner.altText}>
                88
              </span>
            )}
          </div>
        </div>
      ))}
      <div className="benefit-strip" aria-label="Quyền lợi mua sắm" tabIndex={0}>
        <span>
          <Truck aria-hidden="true" /> Miễn phí vận chuyển
        </span>
        <span>✓ Thanh toán an toàn</span>
        <span>↩ Đổi trả dễ dàng</span>
      </div>
    </section>
  );
}

function CategorySection({ module }: { module: HomepageCategoryModule }) {
  return (
    <section aria-labelledby={`module-${module.id}`} data-module-type={module.type}>
      <div className="section-heading">
        <h2 id={`module-${module.id}`}>{module.title}</h2>
        <p>{module.subtitle}</p>
      </div>
      <div className="category-grid">
        {module.categories.map((category) => (
          <Link
            className="category-card"
            href={category.href}
            key={category.id}
            aria-label={`Xem danh mục ${category.label}`}
          >
            <span aria-hidden="true">{icons[category.icon] ?? '🛍️'}</span>
            <strong>{category.label}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

function ProductCard({ product }: { product: HomepageProductSummary }) {
  return (
    <Card className="product-card">
      <Link href={product.href} className="product-card__link" aria-label={`Xem ${product.name}`}>
        <div
          className={`product-card__image${product.imageUrl ? '' : ' product-card__image--fallback'}`}
        >
          {product.imageUrl ? (
            <MarketplaceProductImage
              src={product.imageUrl}
              alt={product.imageAlt}
              width={320}
              height={320}
            />
          ) : (
            <span className="homepage-media-fallback" role="img" aria-label={product.imageAlt}>
              S
            </span>
          )}
          {product.label ? (
            <Badge variant={product.label === 'Mall' ? 'danger' : 'brand'}>{product.label}</Badge>
          ) : null}
        </div>
        <div className="product-card__body">
          <h3>{product.name}</h3>
          <p className="product-card__shop">{product.shopName}</p>
          <div className="product-card__price">
            <strong>₫{formatMoney(product.priceMinor)}</strong>
            {product.compareAtPriceMinor ? (
              <del>₫{formatMoney(product.compareAtPriceMinor)}</del>
            ) : null}
          </div>
          {product.scheduledPrice ? <small aria-label={`Giảm giá sản phẩm ${Math.floor(product.scheduledPrice.discountBasisPoints / 100)} phần trăm`}>Đang giảm {Math.floor(product.scheduledPrice.discountBasisPoints / 100)}%</small> : null}
          {product.soldCount !== undefined ? (
            <span className="product-card__sold">Đã bán {formatMoney(product.soldCount)}</span>
          ) : null}
        </div>
      </Link>
      <FavoriteButton productId={product.id} compact />
    </Card>
  );
}

function ProductSection({ module }: { module: HomepageProductModule }) {
  return (
    <section
      className={`homepage-product-section homepage-product-section--${module.type}`}
      aria-labelledby={`module-${module.id}`}
      data-module-type={module.type}
    >
      <div className="section-heading">
        <div>
          {module.type === 'flash-sale' ? <Badge variant="danger">FLASH</Badge> : null}
          <h2 id={`module-${module.id}`}>{module.title}</h2>
        </div>
        <p>{module.subtitle}</p>
      </div>
      <div className="product-grid">
        {module.products.map((product) => (
          <ProductCard product={product} key={product.id} />
        ))}
      </div>
    </section>
  );
}

export function HomepageModules({ modules }: { modules: HomepageModule[] }) {
  const productIds = modules.flatMap((module) =>
    'products' in module ? module.products.map(({ id }) => id) : [],
  );
  return (
    <FavoriteStateProvider productIds={productIds}>
      <Container className="home-flow">
        {modules.map((module) => {
          if (module.type === 'campaign-banner')
            return <CampaignSection module={module} key={module.id} />;
          if (module.type === 'category-shortcuts')
            return <CategorySection module={module} key={module.id} />;
          if (
            ['flash-sale', 'top-selling', 'mall', 'daily-recommendations'].includes(module.type)
          ) {
            return <ProductSection module={module as HomepageProductModule} key={module.id} />;
          }
          return null;
        })}
      </Container>
    </FavoriteStateProvider>
  );
}

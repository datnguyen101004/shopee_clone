'use client';

import {
  buyerDisplayProductPriceMinor,
  parseHomepageResponse,
  type HomepageCampaignModule,
  type HomepageCategoryModule,
  type HomepageModule,
  type HomepageProductModule,
  type HomepageProductSummary,
} from '@shopee-clone/contracts';
import { Badge, Card, Container, RotateCcw, ShieldCheck, Truck } from '@shopee-clone/ui';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MarketplaceProductImage } from '../marketplace-product-image';
import { FavoriteStateProvider } from '../engagement/favorite-state-provider';
import { useAuthSession } from '../auth-session-provider';

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-z0-9]/g, '');
}

const iconMatcherList: Array<{ keywords: string[]; path: string }> = [
  {
    keywords: ['bachhoa', 'grocery', 'taphoa', 'thucpham', 'anvat', 'sieuthi'],
    path: '/media/categories/grocery.png',
  },
  {
    keywords: ['mypham', 'lamdep', 'sacdep', 'beauty', 'skincare', 'son', 'makeup'],
    path: '/media/categories/beauty-personal-care.png',
  },
  {
    keywords: ['noithat', 'nhacua', 'doisong', 'homeliving', 'living', 'furniture', 'nhabep'],
    path: '/media/categories/home-living.png',
  },
  {
    keywords: ['thethao', 'dulich', 'sport', 'outdoor', 'gym', 'bongda', 'chaybo'],
    path: '/media/categories/sport-outdoor.png',
  },
  {
    keywords: [
      'thoitrang',
      'quanao',
      'fashion',
      'clothes',
      'nam',
      'nu',
      'aothun',
      'vay',
      'dam',
      'ao',
      'quan',
    ],
    path: '/media/categories/men-clothes.png',
  },
  {
    keywords: ['thietbidientu', 'dientu', 'electronic', 'amthanh', 'tivi', 'loa'],
    path: '/media/categories/consumer-electronics.png',
  },
  {
    keywords: [
      'dienthoai',
      'phukien',
      'gadget',
      'smartphone',
      'iphone',
      'samsung',
      'tainghe',
      'phone',
      'device',
    ],
    path: '/media/categories/mobile-gadgets.png',
  },
  {
    keywords: ['giadung', 'dogiadung', 'kitchen', 'appliance', 'noicom', 'mayxay', 'bep'],
    path: '/media/categories/home-appliances.png',
  },
  {
    keywords: ['suckhoe', 'health', 'thuoc', 'vitamin', 'khautrang', 'yte'],
    path: '/media/categories/health.png',
  },
  {
    keywords: ['maytinh', 'laptop', 'pc', 'computer', 'banphim', 'chuot', 'manhinh'],
    path: '/media/categories/computer-accessories.png',
  },
  {
    keywords: ['mayanh', 'camera', 'quayphim', 'lens', 'flycam'],
    path: '/media/categories/cameras.png',
  },
  {
    keywords: ['dongho', 'watch', 'smartwatch'],
    path: '/media/categories/watches.png',
  },
  {
    keywords: ['giay', 'giaydep', 'shoes', 'sneaker', 'sandal', 'dep'],
    path: '/media/categories/men-shoes.png',
  },
  {
    keywords: ['tuivi', 'balo', 'tui', 'vi', 'bag', 'wallet', 'backpack', 'cap'],
    path: '/media/categories/women-bags.png',
  },
  {
    keywords: ['mebe', 'treem', 'sosinh', 'bim', 'sua', 'baby', 'mom', 'kids'],
    path: '/media/categories/moms-kids-babies.png',
  },
  {
    keywords: ['dochoi', 'toy', 'lego', 'figure', 'mohinh', 'bupbe'],
    path: '/media/categories/toys.png',
  },
  {
    keywords: ['thucung', 'pet', 'chomeo', 'poodle', 'meo', 'cho'],
    path: '/media/categories/pets.png',
  },
  {
    keywords: ['sach', 'nhasach', 'book', 'vanphongpham', 'truyen', 'vo', 'but'],
    path: '/media/categories/books-stationery.png',
  },
  {
    keywords: ['oto', 'xemay', 'xedap', 'motor', 'car', 'bike', 'auto', 'phutung'],
    path: '/media/categories/automotive.png',
  },
  {
    keywords: ['voucher', 'dichvu', 'service', 've', 'coupon', 'napthe'],
    path: '/media/categories/tickets-vouchers-services.png',
  },
  {
    keywords: ['dungcu', 'thietbi', 'tool', 'khoan', 'kem', 'tovit', 'suachua'],
    path: '/media/categories/tools-home-improvement.png',
  },
  {
    keywords: ['trangsuc', 'phukiennu', 'jewelry', 'nhan', 'daychuyen', 'vongtay', 'bongtai'],
    path: '/media/categories/fashion-accessories.png',
  },
  {
    keywords: ['giatgiu', 'vesinh', 'tayrua', 'homecare', 'nuocgiat', 'nuocxa'],
    path: '/media/categories/home-care.png',
  },
];

function getCategoryIcon(iconKey?: string, href?: string, label?: string): string {
  const combined = [iconKey, href, label].filter(Boolean).join(' ');
  const normalized = normalizeText(combined);

  for (const entry of iconMatcherList) {
    if (entry.keywords.some((k) => normalized.includes(k))) {
      return entry.path;
    }
  }
  return '/media/categories/grocery.png';
}

function getBannerImage(url?: string | null): string {
  if (
    !url ||
    url.includes('campaign-88') ||
    url.includes('campaign-mega-sale') ||
    url.includes('campaign-compact') ||
    url.includes('campaign-square') ||
    url.includes('campaign-wide')
  ) {
    return '/media/homepage/campaign-banner.jpg';
  }
  return url;
}

function CampaignSection({ module }: { module: HomepageCampaignModule }) {
  return (
    <section
      className="homepage-campaign"
      aria-labelledby={`module-${module.id}`}
      data-module-type={module.type}
    >
      {module.banners.map((banner) => (
        <Link
          key={banner.id}
          href={banner.href}
          className="hero-banner-link"
          aria-label={banner.title || 'Chiến dịch siêu hội mua sắm'}
        >
          <h1 id={`module-${module.id}`} className="sr-only">
            {banner.title}
          </h1>
          <div className="hero-banner-container">
            <Image
              src={getBannerImage(banner.imageUrl)}
              alt={banner.altText || banner.title || 'Shopee Clone Siêu Sale Đại Tiệc'}
              width={1400}
              height={410}
              priority
              unoptimized
              className="hero-banner-img"
            />
          </div>
        </Link>
      ))}

      <div className="benefit-strip" aria-label="Quyền lợi mua sắm" tabIndex={0}>
        <span>
          <Truck aria-hidden="true" /> Miễn phí vận chuyển
        </span>
        <span>
          <ShieldCheck aria-hidden="true" /> Thanh toán an toàn
        </span>
        <span>
          <RotateCcw aria-hidden="true" /> Đổi trả dễ dàng
        </span>
      </div>
    </section>
  );
}

function CategorySection({ module }: { module: HomepageCategoryModule }) {
  return (
    <section
      className="homepage-categories"
      aria-labelledby={`module-${module.id}`}
      data-module-type={module.type}
    >
      <div className="section-heading">
        <h2 id={`module-${module.id}`}>{module.title}</h2>
        <p>{module.subtitle}</p>
      </div>
      <div className="category-grid">
        {module.categories.map((category) => {
          const iconSrc = getCategoryIcon(category.icon, category.href, category.label);
          return (
            <Link
              className="category-card"
              href={category.href}
              key={category.id}
              aria-label={`Xem danh mục ${category.label}`}
            >
              <span aria-hidden="true" className="category-card__icon">
                <Image
                  src={iconSrc}
                  alt={category.label}
                  width={48}
                  height={48}
                  className="category-card__img"
                />
              </span>
              <strong>{category.label}</strong>
            </Link>
          );
        })}
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
            <strong>₫{formatMoney(buyerDisplayProductPriceMinor(product))}</strong>
            {product.compareAtPriceMinor ? (
              <del>₫{formatMoney(product.compareAtPriceMinor)}</del>
            ) : null}
          </div>
          {product.buyerBestPrice?.merchandiseDiscountMinor ? (
            <small>Giá tốt nhất dự kiến · Voucher đã áp dụng</small>
          ) : null}
          {product.scheduledPrice ? (
            <small
              aria-label={`Giảm giá sản phẩm ${Math.floor(product.scheduledPrice.discountBasisPoints / 100)} phần trăm`}
            >
              Đang giảm {Math.floor(product.scheduledPrice.discountBasisPoints / 100)}%
            </small>
          ) : null}
          {product.soldCount !== undefined ? (
            <span className="product-card__sold">Đã bán {formatMoney(product.soldCount)}</span>
          ) : null}
        </div>
      </Link>
    </Card>
  );
}

function DailyRecommendationsSection({ module }: { module: HomepageProductModule }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(true);

  const checkScrollability = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollPrev(el.scrollLeft > 5);
    setCanScrollNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  }, []);

  useEffect(() => {
    checkScrollability();
    const el = containerRef.current;
    if (!el) return;
    const handleResize = () => checkScrollability();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [checkScrollability, module.products]);

  const scroll = (direction: 'prev' | 'next') => {
    const el = containerRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.9;
    el.scrollBy({
      left: direction === 'next' ? scrollAmount : -scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <section
      className={`homepage-product-section homepage-product-section--${module.type}`}
      aria-labelledby={`module-${module.id}`}
      data-module-type={module.type}
    >
      <div className="section-heading">
        <div>
          <h2 id={`module-${module.id}`}>{module.title}</h2>
        </div>
        {module.subtitle ? <p>{module.subtitle}</p> : null}
      </div>
      <div className="carousel-wrapper">
        <button
          type="button"
          className="carousel-btn carousel-btn--prev"
          aria-label="Sản phẩm trước"
          disabled={!canScrollPrev}
          onClick={() => scroll('prev')}
        >
          ‹
        </button>
        <div
          className="carousel-container"
          ref={containerRef}
          onScroll={checkScrollability}
        >
          <div className="carousel-track">
            {module.products.map((product) => (
              <div className="carousel-item" key={product.id}>
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="carousel-btn carousel-btn--next"
          aria-label="Sản phẩm tiếp theo"
          disabled={!canScrollNext}
          onClick={() => scroll('next')}
        >
          ›
        </button>
      </div>
    </section>
  );
}

function ProductSection({ module }: { module: HomepageProductModule }) {
  if (module.type === 'daily-recommendations') {
    return <DailyRecommendationsSection module={module} />;
  }

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
  const { state: authState, authenticatedFetch } = useAuthSession();
  const [personalizedModules, setPersonalizedModules] = useState<{
    source: HomepageModule[];
    modules: HomepageModule[];
  } | null>(null);
  const displayModules =
    personalizedModules?.source === modules ? personalizedModules.modules : modules;
  useEffect(() => {
    if (authState.status !== 'authenticated') {
      setPersonalizedModules(null);
      return;
    }
    const controller = new AbortController();
    const endpoint = new URL(
      '/api/v1/homepage',
      process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
    );
    void authenticatedFetch(endpoint, { cache: 'no-store', signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) return;
        const parsed = parseHomepageResponse(await result.json());
        if (parsed) setPersonalizedModules({ source: modules, modules: parsed.modules });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [authState.status, authenticatedFetch, modules]);

  const productIds = displayModules.flatMap((module) =>
    'products' in module ? module.products.map(({ id }) => id) : [],
  );
  return (
    <FavoriteStateProvider productIds={productIds}>
      <Container className="home-flow">
        {displayModules.map((module) => {
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

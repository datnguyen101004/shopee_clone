'use client';

import {
  buyerDisplayProductPriceMinor,
  parseHomepageResponse,
  type HomepageBanner,
  type HomepageCampaignModule,
  type HomepageCategoryModule,
  type HomepageModule,
  type HomepageProductModule,
  type HomepageProductSummary,
} from '@shopee-clone/contracts';
import {
  Badge,
  ProductCard as UiProductCard,
  RotateCcw,
  SectionHeader,
  ShieldCheck,
  StorefrontContainer,
  StorefrontSection,
  Truck,
} from '@shopee-clone/ui';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MarketplaceProductImage } from '../marketplace-product-image';
import { FavoriteStateProvider } from '../engagement/favorite-state-provider';
import { useAuthSession } from '../auth-session-provider';
import {
  clickstreamImpressionKey,
  createClickstreamCorrelationId,
  createClickstreamImpressionDeduper,
  submitClickstreamEvent,
} from '../../lib/clickstream';

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

function CampaignBannerVisual({
  banner,
  inert = false,
}: {
  banner: HomepageBanner;
  inert?: boolean;
}) {
  const image = (
    <div className="hero-banner-container">
      <Image
        src={getBannerImage(banner.imageUrl)}
        alt={banner.altText || banner.title || 'Shopee Clone Siêu Sale Đại Tiệc'}
        width={1400}
        height={410}
        priority={!inert}
        unoptimized
        className="hero-banner-img"
      />
    </div>
  );

  if (banner.href && !inert) {
    return (
      <Link
        href={banner.href}
        className="hero-banner-link"
        aria-label={banner.title || 'Chiến dịch siêu hội mua sắm'}
      >
        {image}
      </Link>
    );
  }

  return (
    <div className="hero-banner-link hero-banner-link--static" aria-label={banner.title}>
      {image}
    </div>
  );
}

function CampaignSection({ module }: { module: HomepageCampaignModule }) {
  const [trackIndex, setTrackIndex] = useState(module.banners.length > 1 ? 1 : 0);
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const [isInViewport, setIsInViewport] = useState(true);
  const bannerFrameRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const banners = module.banners;
  const hasMultipleBanners = banners.length > 1;
  const activeIndex = hasMultipleBanners ? (trackIndex - 1 + banners.length) % banners.length : 0;
  const activeBanner = banners[Math.min(activeIndex, Math.max(0, banners.length - 1))];
  const trackBanners = hasMultipleBanners
    ? [banners[banners.length - 1]!, ...banners, banners[0]!]
    : banners;

  const goNext = useCallback(() => {
    if (!hasMultipleBanners) return;
    setTransitionEnabled(true);
    setTrackIndex((current) => (current >= banners.length + 1 ? 2 : current + 1));
  }, [banners.length, hasMultipleBanners]);

  const goPrevious = useCallback(() => {
    if (!hasMultipleBanners) return;
    setTransitionEnabled(true);
    setTrackIndex((current) => (current <= 0 ? banners.length - 1 : current - 1));
  }, [banners.length, hasMultipleBanners]);

  const goTo = useCallback(
    (index: number) => {
      if (!hasMultipleBanners) return;
      const nextIndex = (index + banners.length) % banners.length;
      if (nextIndex === activeIndex) return;

      setTransitionEnabled(true);
      setTrackIndex(nextIndex + 1);
    },
    [activeIndex, banners.length, hasMultipleBanners],
  );

  useEffect(() => {
    const node = bannerFrameRef.current;
    if (!node || !('IntersectionObserver' in window)) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInViewport(Boolean(entry?.isIntersecting && entry.intersectionRatio > 0));
      },
      { threshold: [0, 0.01] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!hasMultipleBanners || !isInViewport) return undefined;
    const timer = window.setTimeout(() => {
      goNext();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [activeIndex, goNext, hasMultipleBanners, isInViewport]);

  useEffect(() => {
    if (!hasMultipleBanners || (trackIndex !== 0 && trackIndex !== banners.length + 1)) {
      return undefined;
    }

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(
      () => {
        setTransitionEnabled(false);
        setTrackIndex(trackIndex === 0 ? banners.length : 1);
      },
      reducedMotion ? 0 : 620,
    );
    return () => window.clearTimeout(timer);
  }, [banners.length, hasMultipleBanners, trackIndex]);

  useEffect(() => {
    if (transitionEnabled) return undefined;
    const frame = window.requestAnimationFrame(() => setTransitionEnabled(true));
    return () => window.cancelAnimationFrame(frame);
  }, [transitionEnabled]);

  return (
    <StorefrontSection
      className="homepage-campaign"
      aria-labelledby={`module-${module.id}`}
      data-module-type={module.type}
      role={hasMultipleBanners ? 'region' : undefined}
      aria-roledescription={hasMultipleBanners ? 'carousel' : undefined}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 40) return;
        if (end < start) goNext();
        else goPrevious();
      }}
    >
      {activeBanner && (
        <div className="hero-banner-frame" ref={bannerFrameRef}>
          <h1 id={`module-${module.id}`} className="sr-only">
            {activeBanner.title}
          </h1>
          <div className="hero-banner-viewport">
            <div
              className="hero-banner-track"
              style={{
                transform: `translate3d(-${trackIndex * 100}%, 0, 0)`,
                transition: transitionEnabled ? undefined : 'none',
              }}
              onTransitionEnd={(event) => {
                if (event.target !== event.currentTarget || event.propertyName !== 'transform') {
                  return;
                }
                if (trackIndex === 0) {
                  setTransitionEnabled(false);
                  setTrackIndex(banners.length);
                } else if (trackIndex === banners.length + 1) {
                  setTransitionEnabled(false);
                  setTrackIndex(1);
                }
              }}
            >
              {trackBanners.map((banner, index) => {
                const isActive = index === trackIndex;
                return (
                  <div
                    key={`${banner.id}-${index}`}
                    className={`hero-banner-slide${isActive ? ' is-active' : ''}`}
                    aria-hidden={!isActive}
                  >
                    <CampaignBannerVisual banner={banner} inert={!isActive} />
                  </div>
                );
              })}
            </div>
          </div>
          {hasMultipleBanners && (
            <div className="hero-banner-controls" aria-label="Điều khiển banner">
              <button
                type="button"
                className="carousel-btn carousel-btn--prev hero-banner-control"
                onClick={goPrevious}
                aria-label="Banner trước"
              >
                ‹
              </button>
              <div className="hero-banner-indicators" role="tablist" aria-label="Chọn banner">
                {banners.map((banner, index) => (
                  <button
                    key={banner.id}
                    type="button"
                    role="tab"
                    aria-selected={index === activeIndex}
                    aria-label={`Banner ${index + 1}`}
                    className={`hero-banner-indicator${index === activeIndex ? ' is-active' : ''}`}
                    onClick={() => goTo(index)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="carousel-btn carousel-btn--next hero-banner-control"
                onClick={goNext}
                aria-label="Banner tiếp theo"
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}

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
    </StorefrontSection>
  );
}

function CategorySection({ module }: { module: HomepageCategoryModule }) {
  return (
    <StorefrontSection
      className="homepage-categories"
      aria-labelledby={`module-${module.id}`}
      data-module-type={module.type}
    >
      <SectionHeader id={`module-${module.id}`} title={module.title} subtitle={module.subtitle} />
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
    </StorefrontSection>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value);
}

function ProductCard({
  product,
  tracking,
}: {
  product: HomepageProductSummary;
  tracking?: {
    eventType: 'product_clicked' | 'recommendation_clicked';
    requestId: string;
    placement: string;
    position: number;
    recommendationId?: string;
  };
}) {
  const { sessionFetch } = useAuthSession();
  return (
    <UiProductCard
      className="product-card"
      onClick={
        tracking
          ? () =>
              submitClickstreamEvent(
                tracking.eventType === 'recommendation_clicked'
                  ? {
                      eventType: tracking.eventType,
                      surface: 'homepage',
                      productId: product.id,
                      placement: tracking.placement,
                      position: tracking.position,
                      recommendationId: tracking.recommendationId ?? tracking.requestId,
                      properties: {},
                    }
                  : {
                      eventType: tracking.eventType,
                      surface: 'homepage',
                      productId: product.id,
                      placement: tracking.placement,
                      position: tracking.position,
                      requestId: tracking.requestId,
                      properties: {},
                },
                1_500,
                sessionFetch,
              )
          : undefined
      }
      linkClassName="product-card__link"
      linkComponent={Link}
      href={product.href}
      linkAriaLabel={`Xem ${product.name}`}
      image={
        product.imageUrl ? (
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
        )
      }
      mediaClassName={!product.imageUrl ? 'product-card__image--fallback' : undefined}
      badge={
        product.label ? (
          <Badge variant={product.label === 'Mall' ? 'danger' : 'brand'}>{product.label}</Badge>
        ) : null
      }
      name={product.name}
      titleHeadingLevel="h3"
      shopName={product.shopName}
      shopNameClassName="product-card__shop"
      price={`₫${formatMoney(buyerDisplayProductPriceMinor(product))}`}
      compareAtPrice={
        product.compareAtPriceMinor ? `₫${formatMoney(product.compareAtPriceMinor)}` : undefined
      }
      bestPriceBadge={
        product.buyerBestPrice?.merchandiseDiscountMinor ? (
          <small>Giá tốt nhất dự kiến · Voucher đã áp dụng</small>
        ) : null
      }
      scheduledDeal={
        product.scheduledPrice ? (
          <small
            aria-label={`Giảm giá sản phẩm ${Math.floor(product.scheduledPrice.discountBasisPoints / 100)} phần trăm`}
          >
            Đang giảm {Math.floor(product.scheduledPrice.discountBasisPoints / 100)}%
          </small>
        ) : null
      }
      soldCount={
        product.soldCount !== undefined ? `Đã bán ${formatMoney(product.soldCount)}` : undefined
      }
    />
  );
}

function DailyRecommendationsSection({ module }: { module: HomepageProductModule }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(true);
  const { sessionFetch } = useAuthSession();
  const resultSetKey = `${module.id}:${module.products.map(({ id }) => id).join(',')}`;
  const requestId = useMemo(() => createClickstreamCorrelationId(resultSetKey), [resultSetKey]);
  const [deduper] = useState(createClickstreamImpressionDeduper);

  useEffect(() => {
    for (const [position, product] of module.products.entries()) {
      const placement = `homepage:${module.type}`;
      const key = clickstreamImpressionKey({
        requestId,
        placement,
        productId: product.id,
        position,
      });
      if (deduper.seen(key))
        submitClickstreamEvent(
          {
            eventType: 'recommendation_impression',
            surface: 'homepage',
            productId: product.id,
            placement,
            position,
            recommendationId: requestId,
            properties: {},
          },
          1_500,
          sessionFetch,
        );
    }
    return () => deduper.clear();
  }, [deduper, module.products, module.type, requestId, sessionFetch]);

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
    <StorefrontSection
      className={`homepage-product-section homepage-product-section--${module.type}`}
      aria-labelledby={`module-${module.id}`}
      data-module-type={module.type}
    >
      <SectionHeader id={`module-${module.id}`} title={module.title} subtitle={module.subtitle} />
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
        <div className="carousel-container" ref={containerRef} onScroll={checkScrollability}>
          <div className="carousel-track">
            {module.products.map((product, position) => (
              <div className="carousel-item" key={product.id}>
                <ProductCard
                  product={product}
                  tracking={{
                    eventType: 'recommendation_clicked',
                    requestId,
                    placement: `homepage:${module.type}`,
                    position,
                    recommendationId: requestId,
                  }}
                />
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
    </StorefrontSection>
  );
}

function ProductSection({ module }: { module: HomepageProductModule }) {
  const resultSetKey = `${module.id}:${module.products.map(({ id }) => id).join(',')}`;
  const requestId = useMemo(() => createClickstreamCorrelationId(resultSetKey), [resultSetKey]);
  if (module.type === 'daily-recommendations') {
    return <DailyRecommendationsSection module={module} />;
  }

  if (module.type === 'flash-sale' && module.products.length === 0) {
    return null;
  }

  const titleContent =
    module.type === 'flash-sale' ? (
      <span className="homepage-section-title--flash">
        <Badge variant="danger">FLASH</Badge>
        <span>{module.title}</span>
      </span>
    ) : (
      module.title
    );

  return (
    <StorefrontSection
      className={`homepage-product-section homepage-product-section--${module.type}`}
      aria-labelledby={`module-${module.id}`}
      data-module-type={module.type}
    >
      <SectionHeader id={`module-${module.id}`} title={titleContent} subtitle={module.subtitle} />
      <div className="product-grid">
        {module.products.map((product, position) => (
          <ProductCard
            product={product}
            key={product.id}
            tracking={{
              eventType: 'product_clicked',
              requestId,
              placement: `homepage:${module.type}`,
              position,
            }}
          />
        ))}
      </div>
    </StorefrontSection>
  );
}

export function HomepageModules({ modules }: { modules: HomepageModule[] }) {
  const { state: authState, authenticatedFetch } = useAuthSession();
  const authenticatedUserId = authState.status === 'authenticated' ? authState.user.id : null;
  const [personalizedModules, setPersonalizedModules] = useState<{
    userId: string;
    source: HomepageModule[];
    modules: HomepageModule[];
  } | null>(null);
  const displayModules =
    authenticatedUserId !== null &&
    personalizedModules?.userId === authenticatedUserId &&
    personalizedModules.source === modules
      ? personalizedModules.modules
      : modules;
  useEffect(() => {
    if (authenticatedUserId === null) return;
    const controller = new AbortController();
    const endpoint = new URL(
      '/api/v1/homepage',
      process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001',
    );
    void authenticatedFetch(endpoint, { cache: 'no-store', signal: controller.signal })
      .then(async (result) => {
        if (!result.ok) return;
        const parsed = parseHomepageResponse(await result.json());
        if (parsed)
          setPersonalizedModules({
            userId: authenticatedUserId,
            source: modules,
            modules: parsed.modules,
          });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [authenticatedUserId, authenticatedFetch, modules]);

  const productIds = displayModules.flatMap((module) =>
    'products' in module ? module.products.map(({ id }) => id) : [],
  );
  return (
    <FavoriteStateProvider productIds={productIds}>
      <StorefrontContainer className="home-flow">
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
      </StorefrontContainer>
    </FavoriteStateProvider>
  );
}

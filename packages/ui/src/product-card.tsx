import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from 'react';

import { Card } from './display';
import { cn } from './utils';

export interface ProductCardProps extends HTMLAttributes<HTMLDivElement> {
  image: ReactNode;
  name: ReactNode;
  price: ReactNode;
  compareAtPrice?: ReactNode;
  discountPercent?: number;
  badge?: ReactNode;
  dealBadge?: ReactNode;
  bestPriceBadge?: ReactNode;
  scheduledDeal?: ReactNode;
  soldCount?: ReactNode;
  rating?: ReactNode;
  location?: ReactNode;
  shopName?: ReactNode;
  href?: string;
  linkComponent?: ElementType;
  linkAriaLabel?: string;
  linkClassName?: string;
  mediaClassName?: string;
  discountBadgeClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  shopNameClassName?: string;
  locationClassName?: string;
  titleHeadingLevel?: 'h2' | 'h3' | 'h4';
  titleClassName?: string;
}

export const ProductCard = forwardRef<HTMLDivElement, ProductCardProps>(function ProductCard(
  {
    image,
    name,
    price,
    compareAtPrice,
    discountPercent,
    badge,
    dealBadge,
    bestPriceBadge,
    scheduledDeal,
    soldCount,
    rating,
    location,
    shopName,
    href,
    linkComponent,
    linkAriaLabel,
    linkClassName,
    mediaClassName,
    discountBadgeClassName,
    bodyClassName,
    footerClassName,
    shopNameClassName,
    locationClassName,
    titleHeadingLevel = 'h3',
    titleClassName,
    className,
    ...props
  },
  ref,
) {
  const TitleTag = titleHeadingLevel;
  const accessibleLinkLabel = linkAriaLabel ?? (props['aria-label'] as string | undefined);

  const innerMedia = (
    <div className={cn('sc-product-card__media', mediaClassName)}>
      {image}
      {discountPercent ? (
        <div
          className={cn('sc-product-card__discount', discountBadgeClassName)}
          aria-label={`Giảm ${discountPercent}%`}
        >
          <span className="sc-product-card__discount-percent">-{discountPercent}%</span>
          <span className="sc-product-card__discount-label">GIẢM</span>
        </div>
      ) : null}
      {badge ? <div className="sc-product-card__badge">{badge}</div> : null}
    </div>
  );

  const innerBody = (
    <div className={cn('sc-product-card__body', bodyClassName)}>
      <TitleTag className={cn('sc-product-card__title', titleClassName)}>{name}</TitleTag>
      {shopName ? (
        <p className={cn('sc-product-card__shop', shopNameClassName)}>{shopName}</p>
      ) : null}

      <div className="sc-product-card__price-row">
        <span className="sc-product-card__price">{price}</span>
        {compareAtPrice ? (
          <del className="sc-product-card__compare-price">{compareAtPrice}</del>
        ) : null}
      </div>

      {dealBadge ? <div className="sc-product-card__deal">{dealBadge}</div> : null}
      {bestPriceBadge ? (
        <div className="sc-product-card__best-price">{bestPriceBadge}</div>
      ) : null}
      {scheduledDeal ? (
        <div className="sc-product-card__scheduled-deal">{scheduledDeal}</div>
      ) : null}

      {rating || soldCount ? (
        <div className={cn('sc-product-card__footer', footerClassName)}>
          {rating ? <span className="sc-product-card__rating">{rating}</span> : null}
          {soldCount ? (
            <span className="sc-product-card__sold">
              {typeof soldCount === 'number' ? `Đã bán ${soldCount}` : soldCount}
            </span>
          ) : null}
        </div>
      ) : null}

      {location ? (
        <span className={cn('sc-product-card__location', locationClassName)}>{location}</span>
      ) : null}
    </div>
  );

  const LinkComponent = linkComponent ?? 'a';

  if (href) {
    return (
      <Card
        ref={ref}
        interactive
        className={cn('sc-product-card', className)}
        {...props}
      >
        <LinkComponent
          href={href}
          className={cn('sc-product-card-link', linkClassName)}
          aria-label={accessibleLinkLabel}
        >
          {innerMedia}
          {innerBody}
        </LinkComponent>
      </Card>
    );
  }

  return (
    <Card
      ref={ref}
      interactive
      className={cn('sc-product-card', className)}
      {...props}
    >
      {innerMedia}
      {innerBody}
    </Card>
  );
});

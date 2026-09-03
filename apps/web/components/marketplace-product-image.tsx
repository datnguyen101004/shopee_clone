'use client';

import Image from 'next/image';
import { useState } from 'react';

import { isApiMediaUrl, marketplaceMediaUrl } from '../lib/marketplace-media-url';

const PRODUCT_PLACEHOLDER = '/media/products/product-placeholder.svg';

export function MarketplaceProductImage({
  src,
  alt,
  width,
  height,
  fill = false,
  sizes,
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = marketplaceMediaUrl(src);
  const sizingProps = fill
    ? { fill: true as const, sizes: sizes ?? '100vw' }
    : { width, height };
  return (
    <Image
      src={failed ? PRODUCT_PLACEHOLDER : resolvedSrc}
      alt={alt}
      {...sizingProps}
      unoptimized={failed || src.endsWith('.gif') || isApiMediaUrl(resolvedSrc)}
      onError={() => setFailed(true)}
    />
  );
}

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
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
}) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = marketplaceMediaUrl(src);
  return (
    <Image
      src={failed ? PRODUCT_PLACEHOLDER : resolvedSrc}
      alt={alt}
      width={width}
      height={height}
      unoptimized={failed || src.endsWith('.gif') || isApiMediaUrl(resolvedSrc)}
      onError={() => setFailed(true)}
    />
  );
}

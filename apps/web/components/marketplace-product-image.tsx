'use client';

import Image from 'next/image';
import { useState } from 'react';

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
  return (
    <Image
      src={failed ? PRODUCT_PLACEHOLDER : src}
      alt={alt}
      width={width}
      height={height}
      unoptimized={failed || src.endsWith('.gif')}
      onError={() => setFailed(true)}
    />
  );
}

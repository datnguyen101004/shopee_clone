import type { HTMLAttributes } from 'react';

import { cn } from './utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sc-skeleton', className)} aria-hidden="true" {...props} />;
}

export function ProductCardSkeleton({ label = 'Đang tải sản phẩm' }: { label?: string }) {
  return (
    <div className="sc-card sc-product-skeleton" role="status" aria-label={label}>
      <Skeleton className="sc-product-skeleton__image" />
      <Skeleton className="sc-product-skeleton__line" />
      <Skeleton className="sc-product-skeleton__line sc-product-skeleton__line--short" />
      <span className="sc-visually-hidden">{label}</span>
    </div>
  );
}

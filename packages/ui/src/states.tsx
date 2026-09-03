import { AlertTriangle, PackageOpen, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from './button';
import { ProductCardSkeleton } from './skeleton';

export function LoadingState({
  label = 'Đang tải dữ liệu',
  count = 4,
}: {
  label?: string;
  count?: number;
}) {
  return (
    <section className="sc-state" aria-busy="true" aria-label={label}>
      <div className="sc-product-grid">
        {Array.from({ length: count }, (_, index) => (
          <ProductCardSkeleton key={index} label={label} />
        ))}
      </div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="sc-state sc-state--message">
      <PackageOpen aria-hidden="true" size={44} />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}

export function ErrorState({
  title = 'Không thể tải dữ liệu',
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <section className="sc-state sc-state--message" role="alert">
      <AlertTriangle aria-hidden="true" size={44} />
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry ? (
        <Button
          variant="outline"
          leadingIcon={<RotateCcw aria-hidden="true" size={18} />}
          onClick={onRetry}
        >
          Thử lại
        </Button>
      ) : null}
    </section>
  );
}

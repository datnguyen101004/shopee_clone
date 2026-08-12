import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from './utils';

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({
  variant = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return <span className={cn('sc-badge', className)} data-variant={variant} {...props} />;
}

export const Card = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { interactive?: boolean }
>(function Card({ interactive = false, className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('sc-card', className)}
      data-interactive={interactive || undefined}
      {...props}
    />
  );
});

export function Divider({ className, ...props }: HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn('sc-divider', className)} {...props} />;
}

export function Icon({
  icon: Glyph,
  label,
  size = 20,
  ...props
}: { icon: LucideIcon; label?: string; size?: number } & Omit<
  HTMLAttributes<SVGElement>,
  'children'
>) {
  return (
    <Glyph
      size={size}
      strokeWidth={1.8}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
      {...props}
    />
  );
}

export function Price({
  value,
  originalValue,
  currency = '₫',
  label = 'Giá sản phẩm',
}: {
  value: number;
  originalValue?: number;
  currency?: string;
  label?: string;
}) {
  const format = (amount: number) => new Intl.NumberFormat('vi-VN').format(amount);
  return (
    <span className="sc-price" aria-label={`${label}: ${format(value)} ${currency}`}>
      {originalValue ? (
        <del>
          {format(originalValue)}
          {currency}
        </del>
      ) : null}
      <strong>
        <span aria-hidden="true">{currency}</span>
        {format(value)}
      </strong>
    </span>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sc-visually-hidden">{children}</span>;
}

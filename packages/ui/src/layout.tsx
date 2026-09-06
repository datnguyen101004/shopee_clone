import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from './utils';

export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sc-container', className)} {...props} />;
}

export function Stack({
  gap = '4',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { gap?: '2' | '3' | '4' | '6' | '8' }) {
  return <div className={cn('sc-stack', className)} data-gap={gap} {...props} />;
}

export function Inline({
  gap = '3',
  align = 'center',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  gap?: '2' | '3' | '4' | '6';
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <div className={cn('sc-inline', className)} data-gap={gap} data-align={align} {...props} />
  );
}

export function Cluster({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sc-cluster', className)} {...props} />;
}

export function Grid({
  minItemWidth = '220px',
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement> & { minItemWidth?: string }) {
  return (
    <div
      className={cn('sc-grid', className)}
      style={{ ...style, '--sc-grid-min': minItemWidth } as CSSProperties}
      {...props}
    />
  );
}

export const ResponsiveGrid = Grid;

export function StorefrontContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sc-container sc-storefront-container', className)} {...props} />;
}

export function Section({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('sc-section', className)} {...props} />;
}

export function StorefrontSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('sc-section sc-storefront-section', className)} {...props} />;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className,
  id,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={cn('sc-section-header', className)} {...props}>
      <div>
        <h2 className="sc-section-header__title" id={id}>
          {title}
        </h2>
        {subtitle ? <p className="sc-section-header__subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="sc-section-header__action">{action}</div> : null}
    </div>
  );
}

export function SellerShell({
  sidebar,
  header,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  sidebar?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={cn('sc-seller-shell', className)} data-density="compact" {...props}>
      {sidebar ? <aside className="sc-seller-shell__sidebar">{sidebar}</aside> : null}
      <div className="sc-seller-shell__main">
        {header ? <header className="sc-seller-shell__header">{header}</header> : null}
        <div className="sc-seller-shell__content">{children}</div>
      </div>
    </div>
  );
}

export const Main = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(function Main(
  { className, ...props },
  ref,
) {
  return (
    <main
      ref={ref}
      id="main-content"
      tabIndex={-1}
      className={cn('sc-main', className)}
      {...props}
    />
  );
});

export function PageShell({
  header,
  navigation,
  footer,
  children,
  className,
}: {
  header?: ReactNode;
  navigation?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('sc-app', className)}>
      <a className="sc-skip-link" href="#main-content">
        Bỏ qua đến nội dung chính
      </a>
      {header ? <header className="sc-shell-header">{header}</header> : null}
      {navigation ? (
        <nav className="sc-shell-nav" aria-label="Điều hướng chính">
          {navigation}
        </nav>
      ) : null}
      <Main>{children}</Main>
      {footer ? <footer className="sc-shell-footer">{footer}</footer> : null}
    </div>
  );
}

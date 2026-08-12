import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

import { cn } from './utils';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

type SharedButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & SharedButtonProps;

function ButtonContent({
  children,
  leadingIcon,
  trailingIcon,
  loading,
}: SharedButtonProps & { children: ReactNode }) {
  return (
    <>
      {loading ? <span className="sc-spinner" aria-hidden="true" /> : leadingIcon}
      <span>{children}</span>
      {loading ? <span className="sc-visually-hidden">Đang xử lý</span> : trailingIcon}
    </>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    disabled,
    className,
    children,
    leadingIcon,
    trailingIcon,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('sc-button', className)}
      data-variant={variant}
      data-size={size}
      data-full-width={fullWidth || undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <ButtonContent loading={loading} leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
        {children}
      </ButtonContent>
    </button>
  );
});

export type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> &
  SharedButtonProps & { disabled?: boolean };

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    disabled = false,
    className,
    children,
    leadingIcon,
    trailingIcon,
    onClick,
    tabIndex,
    ...props
  },
  ref,
) {
  const unavailable = disabled || loading;
  return (
    <a
      ref={ref}
      className={cn('sc-button', className)}
      data-variant={variant}
      data-size={size}
      data-full-width={fullWidth || undefined}
      aria-disabled={unavailable || undefined}
      aria-busy={loading || undefined}
      tabIndex={unavailable ? -1 : tabIndex}
      onClick={(event) => {
        if (unavailable) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...props}
    >
      <ButtonContent loading={loading} leadingIcon={leadingIcon} trailingIcon={trailingIcon}>
        {children}
      </ButtonContent>
    </a>
  );
});

'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, CircleAlert, CircleX, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

import type { BadgeVariant } from './display';

export type ToastInput = {
  title: string;
  description?: string;
  variant?: Exclude<BadgeVariant, 'neutral' | 'brand'>;
  action?: { label: string; altText: string; onClick: () => void };
  duration?: number;
};

type ToastRecord = ToastInput & { id: number };
type ToastContextValue = { toast: (input: ToastInput) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

const icons = {
  success: CheckCircle2,
  warning: CircleAlert,
  danger: CircleX,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);
  const toast = useCallback((input: ToastInput) => {
    nextId.current += 1;
    setToasts((current) => [...current.slice(-2), { ...input, id: nextId.current }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((item) => {
          const variant = item.variant ?? 'info';
          const Glyph = icons[variant];
          return (
            <ToastPrimitive.Root
              key={item.id}
              className="sc-toast"
              data-variant={variant}
              duration={item.duration ?? 4500}
              type={variant === 'danger' || variant === 'warning' ? 'foreground' : 'background'}
              onOpenChange={(open) => {
                if (!open) setToasts((current) => current.filter(({ id }) => id !== item.id));
              }}
            >
              <Glyph className="sc-toast__icon" aria-hidden="true" size={20} />
              <div>
                <ToastPrimitive.Title className="sc-toast__title">
                  {item.title}
                </ToastPrimitive.Title>
                {item.description ? (
                  <ToastPrimitive.Description className="sc-toast__description">
                    {item.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              {item.action ? (
                <ToastPrimitive.Action
                  className="sc-toast__action"
                  altText={item.action.altText}
                  onClick={item.action.onClick}
                >
                  {item.action.label}
                </ToastPrimitive.Action>
              ) : null}
              <ToastPrimitive.Close className="sc-toast__close" aria-label="Đóng thông báo">
                <X aria-hidden="true" size={18} />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="sc-toast-viewport" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

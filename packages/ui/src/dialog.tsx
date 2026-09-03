'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from './utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  preventOutsideClose = false,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
  children: ReactNode;
  preventOutsideClose?: boolean;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="sc-dialog__overlay" />
      <DialogPrimitive.Content
        className={cn('sc-dialog__content', className)}
        onInteractOutside={
          preventOutsideClose ? (event) => event.preventDefault() : props.onInteractOutside
        }
        {...props}
      >
        <div className="sc-dialog__header">
          <div>
            <DialogPrimitive.Title className="sc-dialog__title">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="sc-dialog__description">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close className="sc-icon-button" aria-label="Đóng hộp thoại">
            <X aria-hidden="true" size={20} />
          </DialogPrimitive.Close>
        </div>
        <div className="sc-dialog__body">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

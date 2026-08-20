'use client';

import type { VoucherSelectionResult } from '@shopee-clone/contracts';

export type CartVoucherOption = {
  code: string;
  name: string;
  minimumSpendMinor: number;
  estimatedDiscountMinor: number;
  remainingCount: number;
};
import { useEffect, useId, useRef, useState } from 'react';

import { voucherRejectionMessage } from './voucher-code-control';

function money(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
}

function remainingLabel(count: number | undefined) {
  return count === undefined ? '' : `Còn ${count} lượt`;
}

function spendHint(item: { minimumSpendMinor: number } | undefined) {
  if (!item) return '';
  return item.minimumSpendMinor > 0
    ? `Đơn từ ${money(item.minimumSpendMinor)}`
    : 'Không yêu cầu đơn tối thiểu';
}

function VoucherTicket({
  code,
  title,
  remaining,
  hint,
  discountLabel,
  action,
  selected = false,
  empty = false,
  expanded,
  disabled,
  onClick,
  labelledBy,
  listId,
}: {
  code: string;
  title: string;
  remaining?: string;
  hint: string;
  discountLabel: string;
  action?: string;
  selected?: boolean;
  empty?: boolean;
  expanded?: boolean;
  disabled?: boolean;
  onClick(): void;
  labelledBy?: string;
  listId?: string;
}) {
  return (
    <button
      type="button"
      className="shop-voucher-ticket"
      data-empty={empty || undefined}
      data-selected={selected || undefined}
      role={labelledBy ? undefined : 'option'}
      aria-selected={labelledBy ? undefined : selected}
      aria-label={labelledBy}
      aria-haspopup={labelledBy ? 'listbox' : undefined}
      aria-controls={listId}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="shop-voucher-ticket__value">{discountLabel}</span>
      <span className="shop-voucher-ticket__body">
        <strong>{code}</strong>
        {remaining ? <em className="shop-voucher-ticket__remaining">{remaining}</em> : null}
        <span>{title}</span>
        {hint ? <small>{hint}</small> : null}
      </span>
      {action ? <span className="shop-voucher-ticket__action">{action}</span> : null}
    </button>
  );
}

export function ShopVoucherPicker({
  label,
  appliedCode,
  result,
  options,
  pending,
  onApply,
}: {
  label: string;
  appliedCode?: string;
  result?: VoucherSelectionResult;
  options: CartVoucherOption[];
  pending: boolean;
  onApply(code: string | null): void;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const currentResult = result?.code === appliedCode ? result : undefined;
  const selected = options.find((item) => item.code === appliedCode);
  const displayCode = currentResult?.status === 'REJECTED' ? undefined : appliedCode;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div className="shop-voucher-picker" ref={rootRef}>
      <span className="shop-voucher-picker__label">{label}</span>
      <div className="shop-voucher-picker__entry">
        <VoucherTicket
          labelledBy={label}
          listId={listId}
          empty={!displayCode}
          selected={Boolean(displayCode)}
          expanded={open}
          disabled={pending}
          code={displayCode ?? 'Chọn voucher phù hợp'}
          title={
            selected
              ? selected.name
              : options.length
                ? `${options.length} mã đang khả dụng`
                : 'Chưa có mã phù hợp với đơn này'
          }
          remaining={remainingLabel(selected?.remainingCount)}
          hint={spendHint(selected)}
          discountLabel={selected ? `−${money(selected.estimatedDiscountMinor)}` : 'Voucher'}
          action={open ? 'Đóng' : 'Chọn'}
          onClick={() => setOpen((current) => !current)}
        />
        {open ? (
          <ul className="shop-voucher-picker__list" id={listId} role="listbox" aria-label={label}>
            {displayCode ? (
              <li>
                <button
                  type="button"
                  className="shop-voucher-picker__clear"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onApply(null);
                    setOpen(false);
                  }}
                >
                  Bỏ chọn voucher
                </button>
              </li>
            ) : null}
            {options.length ? (
              options.map((item) => (
                <li key={item.code}>
                  <VoucherTicket
                    selected={item.code === displayCode}
                    code={item.code}
                    title={item.name}
                    remaining={remainingLabel(item.remainingCount)}
                    hint={spendHint(item)}
                    discountLabel={`−${money(item.estimatedDiscountMinor)}`}
                    action={item.code === displayCode ? 'Đã chọn' : 'Dùng'}
                    onClick={() => {
                      onApply(item.code);
                      setOpen(false);
                    }}
                  />
                </li>
              ))
            ) : (
              <li className="shop-voucher-picker__empty">Chưa có voucher phù hợp với đơn hiện tại.</li>
            )}
          </ul>
        ) : null}
      </div>
      <span
        className={
          currentResult?.status === 'REJECTED' ? 'voucher-control__message is-error' : 'voucher-control__message'
        }
        aria-live="polite"
        role={currentResult?.status === 'REJECTED' ? 'alert' : 'status'}
      >
        {pending && displayCode
          ? `Đang kiểm tra mã ${displayCode}…`
          : currentResult?.status === 'APPLIED'
            ? `Đã áp dụng ${currentResult.name ?? currentResult.code}: giảm ${money(currentResult.discountMinor)}.`
            : currentResult?.status === 'REJECTED'
              ? voucherRejectionMessage(currentResult.rejectionReason)
              : displayCode
                ? `Đang chờ báo giá cho mã ${displayCode}.`
                : options.length
                  ? 'Chọn một mã phù hợp với số tiền đơn hàng.'
                  : 'Tăng giá trị đơn để hiện voucher khả dụng.'}
      </span>
    </div>
  );
}

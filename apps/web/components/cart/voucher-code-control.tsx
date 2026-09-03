'use client';

import {
  normalizeVoucherCode,
  type VoucherRejectionReason,
  type VoucherSelectionResult,
} from '@shopee-clone/contracts';
import { useState } from 'react';

const rejectionCopy: Record<VoucherRejectionReason, string> = {
  NOT_FOUND: 'Không tìm thấy mã giảm giá này.',
  DISABLED: 'Mã giảm giá đang tạm ngưng.',
  NOT_STARTED: 'Mã giảm giá chưa đến thời gian sử dụng.',
  EXPIRED: 'Mã giảm giá đã hết hạn.',
  GLOBAL_LIMIT_REACHED: 'Mã giảm giá đã hết lượt sử dụng.',
  BUYER_LIMIT_REACHED: 'Bạn đã dùng hết lượt của mã này.',
  TYPE_MISMATCH: 'Mã không đúng loại ưu đãi tại vị trí này.',
  SCOPE_MISMATCH: 'Mã không áp dụng cho shop hoặc sản phẩm đã chọn.',
  NO_ELIGIBLE_ITEMS: 'Không có sản phẩm phù hợp với mã này.',
  MINIMUM_SPEND_NOT_MET: 'Đơn hàng chưa đạt giá trị tối thiểu của mã.',
};

function money(value: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(value)}₫`;
}

export function voucherRejectionMessage(reason: VoucherRejectionReason | null): string {
  return reason ? rejectionCopy[reason] : 'Mã giảm giá chưa thể áp dụng.';
}

export function VoucherCodeControl({
  label,
  appliedCode,
  result,
  pending,
  onApply,
}: {
  label: string;
  appliedCode?: string;
  result?: VoucherSelectionResult;
  pending: boolean;
  onApply(code: string | null): void;
}) {
  const [draft, setDraft] = useState(appliedCode ?? '');
  const [localError, setLocalError] = useState('');
  const currentResult = result?.code === appliedCode ? result : undefined;

  return (
    <form
      className="voucher-control"
      onSubmit={(event) => {
        event.preventDefault();
        const normalized = normalizeVoucherCode(draft);
        if (!normalized) {
          setLocalError('Mã gồm 4–32 ký tự chữ, số hoặc dấu gạch ngang.');
          return;
        }
        setDraft(normalized);
        setLocalError('');
        onApply(normalized);
      }}
    >
      <label>
        {label}
        <span className="voucher-control__entry">
          <input
            value={draft}
            maxLength={32}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="Nhập mã giảm giá"
            onChange={(event) => {
              setDraft(event.target.value);
              setLocalError('');
            }}
          />
          <button type="submit" disabled={pending || draft.trim().length === 0}>
            Áp dụng
          </button>
          {appliedCode ? (
            <button
              type="button"
              className="voucher-control__remove"
              disabled={pending}
              onClick={() => {
                setDraft('');
                setLocalError('');
                onApply(null);
              }}
            >
              Bỏ mã
            </button>
          ) : null}
        </span>
      </label>
      <span
        className={
          localError || currentResult?.status === 'REJECTED'
            ? 'voucher-control__message is-error'
            : 'voucher-control__message'
        }
        aria-live="polite"
        role={localError || currentResult?.status === 'REJECTED' ? 'alert' : 'status'}
      >
        {localError ||
          (pending && appliedCode
            ? `Đang kiểm tra mã ${appliedCode}…`
            : currentResult?.status === 'APPLIED'
              ? `Đã áp dụng ${currentResult.name ?? currentResult.code}: giảm ${money(currentResult.discountMinor)}.`
              : currentResult?.status === 'REJECTED'
                ? voucherRejectionMessage(currentResult.rejectionReason)
                : appliedCode
                  ? `Đang chờ báo giá cho mã ${appliedCode}.`
                  : 'Nhập mã rồi bấm Áp dụng để máy chủ kiểm tra.')}
      </span>
    </form>
  );
}

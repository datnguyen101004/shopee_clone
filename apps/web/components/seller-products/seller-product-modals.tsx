'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { SellerProductSummary } from '@shopee-clone/contracts';

interface DeleteModalProps {
  item: SellerProductSummary | null;
  pending: boolean;
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SellerProductDeleteModal({
  item,
  pending,
  error,
  onConfirm,
  onCancel,
}: DeleteModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (item) {
      confirmButtonRef.current?.focus();
    }
  }, [item]);

  if (!item) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !pending) {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div
      className="seller-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!pending) onCancel();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="seller-modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="seller-delete-dialog-title"
        aria-describedby="seller-delete-dialog-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="seller-delete-dialog-title">Xác nhận xóa sản phẩm</h2>
        <p id="seller-delete-dialog-desc">
          Bạn có chắc chắn muốn xóa sản phẩm <strong>&ldquo;{item.name}&rdquo;</strong>? Dữ liệu lịch sử được giữ lại cho đơn hàng và thống kê.
        </p>
        {error ? (
          <p role="alert" style={{ color: '#dc2626', fontSize: '13px', margin: '-12px 0 16px' }}>
            {error}
          </p>
        ) : null}
        <div className="seller-modal-actions">
          <button
            type="button"
            className="seller-modal-btn-cancel"
            disabled={pending}
            onClick={onCancel}
          >
            Hủy
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className="seller-modal-btn-delete"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Đang xử lý…' : 'Xóa sản phẩm'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface HideModalProps {
  item: SellerProductSummary | null;
  pending: boolean;
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SellerProductHideModal({
  item,
  pending,
  error,
  onConfirm,
  onCancel,
}: HideModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (item) {
      confirmButtonRef.current?.focus();
    }
  }, [item]);

  if (!item) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !pending) {
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div
      className="seller-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!pending) onCancel();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        className="seller-modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="seller-hide-dialog-title"
        aria-describedby="seller-hide-dialog-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="seller-hide-dialog-title">Xác nhận ẩn sản phẩm</h2>
        <p id="seller-hide-dialog-desc">
          Ẩn sản phẩm <strong>&ldquo;{item.name}&rdquo;</strong>? Sản phẩm sẽ biến mất khỏi trang mua sắm cho đến khi bạn đăng bán lại.
        </p>
        {error ? (
          <p role="alert" style={{ color: '#dc2626', fontSize: '13px', margin: '-12px 0 16px' }}>
            {error}
          </p>
        ) : null}
        <div className="seller-modal-actions">
          <button
            type="button"
            className="seller-modal-btn-cancel"
            disabled={pending}
            onClick={onCancel}
          >
            Hủy
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className="seller-modal-btn-hide"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Đang xử lý…' : 'Ẩn sản phẩm'}
          </button>
        </div>
      </div>
    </div>
  );
}

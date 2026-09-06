'use client';

import Link from 'next/link';
import { ChevronRight, Loader2 } from '@shopee-clone/ui';

interface EditorHeaderProps {
  productName: string;
  isNew: boolean;
  pending: boolean;
  isArchived: boolean;
  onCancel: () => void;
  onSave: (publish?: boolean) => void;
}

export function SellerProductEditorActions({
  isNew,
  pending,
  isArchived,
  onCancel,
  onSave,
}: Pick<EditorHeaderProps, 'isNew' | 'pending' | 'isArchived' | 'onCancel' | 'onSave'>) {
  return (
    <>
      <button
        type="button"
        className="seller-pe-btn-cancel"
        disabled={pending}
        onClick={onCancel}
      >
        Hủy
      </button>

      {isNew ? (
        <>
          <button
            type="button"
            className="seller-pe-btn-cancel"
            disabled={pending}
            onClick={() => onSave(false)}
          >
            {pending ? 'Đang lưu…' : 'Lưu nháp'}
          </button>
          <button
            type="button"
            className="seller-pe-btn-save"
            disabled={pending}
            onClick={() => onSave(true)}
          >
            {pending ? (
              <>
                <Loader2 className="animate-spin" size={16} aria-hidden="true" /> Đang đăng…
              </>
            ) : (
              'Đăng bán'
            )}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="seller-pe-btn-save"
          disabled={pending || isArchived}
          onClick={() => onSave(false)}
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin" size={16} aria-hidden="true" /> Đang cập nhật…
            </>
          ) : isArchived ? (
            'Đã lưu trữ'
          ) : (
            'Cập nhật'
          )}
        </button>
      )}
    </>
  );
}

export function SellerProductEditorHeader({
  productName,
  isNew,
  pending,
  isArchived,
  onCancel,
  onSave,
}: EditorHeaderProps) {
  return (
    <div className="seller-pe-header-bar">
      {/* Breadcrumbs & Title */}
      <div className="seller-pe-header-copy">
        <nav aria-label="Đường dẫn trang" className="seller-pe-breadcrumb">
          <Link href="/seller/products" aria-label="Quay lại danh sách">
            Sản phẩm
          </Link>
          <ChevronRight className="seller-pe-breadcrumb__sep" size={14} aria-hidden="true" />
          <Link href="/seller/products">Chi tiết sản phẩm</Link>
          <ChevronRight className="seller-pe-breadcrumb__sep" size={14} aria-hidden="true" />
          <span className="seller-pe-breadcrumb__current">
            {isNew ? 'Thêm mới' : productName || 'Chỉnh sửa'}
          </span>
        </nav>
        <h1 className="seller-pe-header-title seller-pe-visually-hidden">
          {isNew ? 'Thêm sản phẩm mới' : 'Chỉnh sửa sản phẩm'}
        </h1>
      </div>

      {/* Keep edit actions in the header; create actions are rendered after the form content. */}
      {!isNew ? (
        <div className="seller-pe-header-actions">
          <SellerProductEditorActions
            isNew={isNew}
            pending={pending}
            isArchived={isArchived}
            onCancel={onCancel}
            onSave={onSave}
          />
        </div>
      ) : null}
    </div>
  );
}

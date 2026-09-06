'use client';

import { useRef, type ChangeEvent } from 'react';
import type { SellerProductMediaInput } from '@shopee-clone/contracts';
import { ImageOff, Loader2, Plus, X } from '@shopee-clone/ui';

export interface ProductMediaItem extends SellerProductMediaInput {
  key: string;
  previewUrl: string;
  status: 'uploading' | 'ready' | 'error';
  file?: File;
  error?: string;
}

interface GalleryEditorProps {
  mediaList: ProductMediaItem[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onAddFiles: (files: FileList) => void;
  onRemoveItem: (index: number) => void;
  readOnly?: boolean;
  maxMedia?: number;
}

export function SellerProductGalleryEditor({
  mediaList,
  selectedIndex,
  onSelectIndex,
  onAddFiles,
  onRemoveItem,
  readOnly = false,
  maxMedia = 9,
}: GalleryEditorProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeMedia = mediaList[selectedIndex] || mediaList[0];

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles(e.target.files);
      e.target.value = '';
    }
  }

  return (
    <section className={`seller-pe-gallery ${readOnly ? 'seller-pe-readonly' : ''}`} aria-label="Thư viện hình ảnh sản phẩm">
      {/* 1. Main Large Preview (420 x 320) */}
      <div className="seller-pe-gallery__main">
        {activeMedia?.previewUrl ? (
          <img
            src={activeMedia.previewUrl}
            alt="Ảnh xem trước"
            loading="eager"
          />
        ) : (
          <div className="seller-pe-gallery__main-fallback">
            <ImageOff size={48} aria-hidden="true" />
            <span>Chưa có ảnh sản phẩm</span>
          </div>
        )}
      </div>

      {/* 2. Thumbnail Strip & Add button */}
      <div className="seller-pe-gallery__thumbnails" role="tablist" aria-label="Danh sách ảnh">
        {mediaList.map((item, index) => {
          const isActive = index === selectedIndex;
          const altText = item.altText || `Ảnh sản phẩm ${index + 1}`;
          return (
            <div
              key={item.key || index}
              className={`seller-pe-gallery__thumb-btn ${isActive ? 'is-active' : ''}`}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => onSelectIndex(index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectIndex(index);
                }
              }}
            >
              {item.status === 'uploading' ? (
                <div
                  className="seller-pe-gallery__thumb-loading"
                >
                  <Loader2 className="animate-spin" size={20} color="#2563eb" />
                </div>
              ) : (
                <>
                  <img
                    src={item.previewUrl || ''}
                    alt={altText}
                    className="seller-pe-gallery__thumb-image"
                  />
                  {!item.previewUrl && <ImageOff size={20} color="#9ca3af" />}
                </>
              )}

              {/* Remove button */}
              <button
                type="button"
                className="seller-pe-gallery__thumb-remove"
                aria-label={`Xóa ảnh ${index + 1}`}
                disabled={readOnly}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveItem(index);
                }}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          );
        })}

        {/* Add image slot (if under maxMedia) */}
        {mediaList.length < maxMedia ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Chọn ảnh từ máy"
              accept="image/png,image/jpeg,image/webp,image/avif"
              multiple
              style={{ display: 'none' }}
              disabled={readOnly}
              onChange={handleFileChange}
            />
            <button
              type="button"
              className="seller-pe-gallery__thumb-add"
              disabled={readOnly}
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus size={18} aria-hidden="true" />
              <span>Thêm ảnh</span>
            </button>
          </>
        ) : null}
      </div>
      {mediaList.length > 0 && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#16a34a', fontWeight: 500 }}>
          <span>Đã sẵn sàng</span> ({mediaList.length}/{maxMedia} ảnh)
        </div>
      )}
    </section>
  );
}

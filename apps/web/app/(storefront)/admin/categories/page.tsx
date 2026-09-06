'use client';

import type { AdminCategorySummary, AdminCategoryTreeNode } from '@shopee-clone/contracts';
import { useCallback, useEffect, useState } from 'react';

import { FolderIcon, FolderOpenIcon, TagIcon } from '../../../../components/admin/admin-icons';
import { AdminEntityLink } from '../../../../components/admin/admin-entity-link';
import { useAuthSession } from '../../../../components/auth-session-provider';
import {
  createAdminCategory,
  deleteAdminCategory,
  fetchAdminCategories,
  adminErrorMessage,
  updateAdminCategory,
} from '../../../../lib/admin-api';

export default function AdminCategoriesPage() {
  const { authenticatedFetch } = useAuthSession();
  const [categories, setCategories] = useState<AdminCategorySummary[]>([]);
  const [tree, setTree] = useState<AdminCategoryTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [modalMode, setModalMode] = useState<'CREATE' | 'EDIT' | null>(null);
  const [editingCategory, setEditingCategory] = useState<AdminCategorySummary | null>(null);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadCategories = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAdminCategories(authenticatedFetch)
      .then((res) => {
        setCategories(res.items);
        setTree(res.tree);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Không thể tải cây danh mục');
        setLoading(false);
      });
  }, [authenticatedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCategories(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCategories]);

  const openCreateModal = (presetParentId?: string) => {
    setModalMode('CREATE');
    setEditingCategory(null);
    setSlug('');
    setName('');
    setParentId(presetParentId || '');
    setSortOrder(0);
    setIsActive(true);
    setFormError(null);
  };

  const openEditModal = (cat: AdminCategorySummary) => {
    setModalMode('EDIT');
    setEditingCategory(cat);
    setSlug(cat.slug);
    setName(cat.name);
    setParentId(cat.parentId || '');
    setSortOrder(cat.sortOrder);
    setIsActive(cat.isActive);
    setFormError(null);
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingCategory(null);
    setFormError(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      if (modalMode === 'CREATE') {
        await createAdminCategory(authenticatedFetch, {
          slug: slug.trim(),
          name: name.trim(),
          parentId: parentId || null,
          sortOrder: Number(sortOrder),
          isActive,
        });
      } else if (modalMode === 'EDIT' && editingCategory) {
        await updateAdminCategory(authenticatedFetch, editingCategory.id, {
          slug: slug.trim(),
          name: name.trim(),
          parentId: parentId || null,
          sortOrder: Number(sortOrder),
          isActive,
        });
      }
      closeModal();
      loadCategories();
    } catch (error: unknown) {
      setFormError(adminErrorMessage(error, 'Lỗi xử lý danh mục'));
      setSubmitting(false);
    }
  };

  const handleDelete = async (cat: AdminCategorySummary) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa danh mục '${cat.name}'?`)) return;

    try {
      await deleteAdminCategory(authenticatedFetch, cat.id);
      loadCategories();
    } catch (error: unknown) {
      alert(`Không thể xóa: ${adminErrorMessage(error, 'Không thể xóa danh mục')}`);
    }
  };

  const renderTreeNodes = (nodes: AdminCategoryTreeNode[], depth = 0) => {
    return nodes.map((node) => (
      <div key={node.id} className="admin-category-tree__node">
        <div
          id={`admin-category-${node.id}`}
          className={`admin-category-tree__row admin-category-tree__row--depth-${Math.min(depth, 2)}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #f3f4f6',
            background: depth % 2 === 0 ? '#ffffff' : '#fafafa',
            paddingLeft: `${16 + depth * 28}px`,
          }}
        >
          <div className="admin-category-tree__identity">
            <div>
              <AdminEntityLink
                href={`/admin/categories#admin-category-${node.id}`}
                name={node.name}
                meta={node.slug}
                fallbackIcon={
                  depth === 0 ? (
                    <FolderOpenIcon size={18} />
                  ) : depth === 1 ? (
                    <FolderIcon size={17} />
                  ) : (
                    <TagIcon size={15} />
                  )
                }
              />
              {!node.isActive && (
                <span
                  style={{
                    marginLeft: '8px',
                    fontSize: '11px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    padding: '1px 6px',
                    borderRadius: '8px',
                    fontWeight: 600,
                  }}
                >
                  Ẩn
                </span>
              )}
            </div>
          </div>

          <div className="admin-category-tree__meta">
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              {node.productCount} sản phẩm • Thứ tự: {node.sortOrder}
            </span>

            <div className="admin-category-tree__actions">
              {depth < 2 && (
                <button
                  className="admin-btn admin-btn-soft admin-btn-small"
                  onClick={() => openCreateModal(node.id)}
                  style={{
                    padding: '3px 8px',
                    fontSize: '12px',
                    color: '#2563eb',
                    background: '#eff6ff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  + Con
                </button>
              )}
              <button
                className="admin-btn admin-btn-secondary admin-btn-small"
                onClick={() => openEditModal(node)}
                style={{
                  padding: '3px 8px',
                  fontSize: '12px',
                  color: '#4b5563',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Sửa
              </button>
              <button
                className="admin-btn admin-btn-danger-outline admin-btn-small"
                onClick={() => handleDelete(node)}
                style={{
                  padding: '3px 8px',
                  fontSize: '12px',
                  color: '#dc2626',
                  background: '#fee2e2',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
        {node.children && node.children.length > 0 && renderTreeNodes(node.children, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="admin-page admin-categories-page">
      <div className="admin-page-actions">
        <button onClick={() => openCreateModal()} className="admin-btn admin-btn-primary">
          + Thêm Danh mục gốc
        </button>
      </div>

      <div
        className="admin-table-card admin-category-tree-card"
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          overflow: 'hidden',
          border: '1px solid #f3f4f6',
        }}
      >
        {loading ? (
          <div className="admin-state-card__message">Đang tải cây danh mục...</div>
        ) : error ? (
          <div className="admin-state-card__message admin-state-card__message--error">{error}</div>
        ) : tree.length === 0 ? (
          <div className="admin-state-card__message">
            Chưa có danh mục nào. Hãy tạo danh mục đầu tiên!
          </div>
        ) : (
          <div>{renderTreeNodes(tree)}</div>
        )}
      </div>

      {/* Modal */}
      {modalMode && (
        <div
          className="admin-dialog-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="admin-dialog"
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <h2
              style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '16px' }}
            >
              {modalMode === 'CREATE'
                ? 'Tạo mới danh mục'
                : `Chỉnh sửa danh mục: ${editingCategory?.name}`}
            </h2>

            <form
              className="admin-dialog__form admin-category-form"
              onSubmit={handleFormSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div className="admin-field">
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '4px',
                  }}
                >
                  Tên danh mục:
                </label>
                <input
                  className="admin-control"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Thiết Bị Điện Tử"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                  }}
                  required
                />
              </div>

              <div className="admin-field">
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '4px',
                  }}
                >
                  Slug định danh (kebab-case):
                </label>
                <input
                  className="admin-control"
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="thiet-bi-dien-tu"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                  }}
                  required
                />
              </div>

              <div className="admin-field">
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '4px',
                  }}
                >
                  Danh mục cha (Trực thuộc):
                </label>
                <select
                  className="admin-control"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                  }}
                >
                  <option value="">(Không có - Danh mục gốc)</option>
                  {categories
                    .filter((c) => !editingCategory || c.id !== editingCategory.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.slug})
                      </option>
                    ))}
                </select>
              </div>

              <div className="admin-category-form__row">
                <div className="admin-field">
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '4px',
                    }}
                  >
                    Thứ tự hiển thị:
                  </label>
                  <input
                    className="admin-control"
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div
                  className="admin-checkbox-field"
                  style={{ display: 'flex', alignItems: 'center', marginTop: '20px', gap: '8px' }}
                >
                  <input
                    className="admin-checkbox-control"
                    type="checkbox"
                    id="isActiveCheck"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  <label
                    htmlFor="isActiveCheck"
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      cursor: 'pointer',
                    }}
                  >
                    Kích hoạt hiển thị
                  </label>
                </div>
              </div>

              {formError && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                >
                  {formError}
                </div>
              )}

              <div
                className="admin-dialog__actions"
                style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end',
                  marginTop: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="admin-btn admin-btn-secondary"
                  style={{
                    padding: '8px 16px',
                    background: '#f3f4f6',
                    color: '#4b5563',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="admin-btn admin-btn-primary"
                  style={{
                    padding: '8px 16px',
                  }}
                >
                  {submitting ? 'Đang lưu...' : 'Lưu danh mục'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

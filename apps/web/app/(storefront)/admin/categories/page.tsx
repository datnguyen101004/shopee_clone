'use client';

import type { AdminCategorySummary, AdminCategoryTreeNode } from '@shopee-clone/contracts';
import { useEffect, useState } from 'react';

import {
  FolderIcon,
  FolderOpenIcon,
  TagIcon,
} from '../../../../components/admin/admin-icons';
import { useAuthSession } from '../../../../components/auth-session-provider';
import {
  createAdminCategory,
  deleteAdminCategory,
  fetchAdminCategories,
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

  const loadCategories = () => {
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
  };

  useEffect(() => {
    loadCategories();
  }, []);

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
    } catch (err: any) {
      setFormError(err.problem?.detail || err.message || 'Lỗi xử lý danh mục');
      setSubmitting(false);
    }
  };

  const handleDelete = async (cat: AdminCategorySummary) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa danh mục '${cat.name}'?`)) return;

    try {
      await deleteAdminCategory(authenticatedFetch, cat.id);
      loadCategories();
    } catch (err: any) {
      alert(`Không thể xóa: ${err.problem?.detail || err.message}`);
    }
  };

  const renderTreeNodes = (nodes: AdminCategoryTreeNode[], depth = 0) => {
    return nodes.map((node) => (
      <div key={node.id} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ color: depth === 0 ? '#ee4d2d' : depth === 1 ? '#d97706' : '#6b7280', display: 'flex', alignItems: 'center' }}>
              {depth === 0 ? <FolderOpenIcon size={18} /> : depth === 1 ? <FolderIcon size={17} /> : <TagIcon size={15} />}
            </div>
            <div>
              <span style={{ fontWeight: 600, color: '#111827' }}>{node.name}</span>
              <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '8px' }}>({node.slug})</span>
              {!node.isActive && (
                <span style={{ marginLeft: '8px', fontSize: '11px', background: '#fee2e2', color: '#dc2626', padding: '1px 6px', borderRadius: '8px', fontWeight: 600 }}>
                  Ẩn
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              {node.productCount} sản phẩm • Thứ tự: {node.sortOrder}
            </span>

            <div style={{ display: 'flex', gap: '6px' }}>
              {depth < 2 && (
                <button
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>Quản lý Cây Danh mục</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
            Tổ chức phân cấp ngành hàng tối đa 3 cấp, sắp xếp thứ tự hiển thị và kiểm soát liên kết sản phẩm.
          </p>
        </div>
        <button
          onClick={() => openCreateModal()}
          className="admin-btn admin-btn-primary"
        >
          + Thêm Danh mục gốc
        </button>
      </div>


      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          overflow: 'hidden',
          border: '1px solid #f3f4f6',
        }}
      >
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>Đang tải cây danh mục...</div>
        ) : error ? (
          <div style={{ padding: '24px', color: '#ef4444' }}>{error}</div>
        ) : tree.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>Chưa có danh mục nào. Hãy tạo danh mục đầu tiên!</div>
        ) : (
          <div>{renderTreeNodes(tree)}</div>
        )}
      </div>

      {/* Modal */}
      {modalMode && (
        <div
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
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '16px' }}>
              {modalMode === 'CREATE' ? 'Tạo mới danh mục' : `Chỉnh sửa danh mục: ${editingCategory?.name}`}
            </h2>

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Tên danh mục:
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Thiết Bị Điện Tử"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Slug định danh (kebab-case):
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="thiet-bi-dien-tu"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Danh mục cha (Trực thuộc):
                </label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
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

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Thứ tự hiển thị:
                  </label>
                  <input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', marginTop: '20px', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="isActiveCheck"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  <label htmlFor="isActiveCheck" style={{ fontSize: '13px', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                    Kích hoạt hiển thị
                  </label>
                </div>
              </div>

              {formError && (
                <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: '6px', fontSize: '13px' }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
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
                  style={{
                    padding: '8px 16px',
                    background: '#ee4d2d',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
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

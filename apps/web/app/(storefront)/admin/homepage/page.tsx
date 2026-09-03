'use client';

import type { AdminBannerSummary, AdminHomepageModuleSummary } from '@shopee-clone/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useAuthSession } from '../../../../components/auth-session-provider';
import {
  createAdminBanner,
  deleteAdminBanner,
  adminErrorMessage,
  fetchAdminBanners,
  fetchAdminHomepageModules,
  updateAdminBanner,
  updateAdminHomepageModule,
} from '../../../../lib/admin-api';

export default function AdminHomepageConfigPage() {
  const { authenticatedFetch } = useAuthSession();
  const [banners, setBanners] = useState<AdminBannerSummary[]>([]);
  const [modules, setModules] = useState<AdminHomepageModuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab
  const [activeTab, setActiveTab] = useState<'BANNERS' | 'MODULES'>('BANNERS');

  // Banner Modal
  const [bannerModalMode, setBannerModalMode] = useState<'CREATE' | 'EDIT' | null>(null);
  const [editingBanner, setEditingBanner] = useState<AdminBannerSummary | null>(null);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerHref, setBannerHref] = useState('');
  const [bannerImageUrl, setBannerImageUrl] = useState('');
  const [bannerAltText, setBannerAltText] = useState('');
  const [bannerTheme, setBannerTheme] = useState('brand');
  const [bannerEyebrow, setBannerEyebrow] = useState('');
  const [bannerSortOrder, setBannerSortOrder] = useState<number>(0);
  const [bannerSubmitting, setBannerSubmitting] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Module Modal
  const [editingModule, setEditingModule] = useState<AdminHomepageModuleSummary | null>(null);
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleSubtitle, setModuleSubtitle] = useState('');
  const [moduleSortOrder, setModuleSortOrder] = useState<number>(0);
  const [moduleEnabled, setModuleEnabled] = useState(true);
  const [moduleActiveFrom, setModuleActiveFrom] = useState('');
  const [moduleActiveUntil, setModuleActiveUntil] = useState('');
  const [moduleSubmitting, setModuleSubmitting] = useState(false);
  const [moduleError, setModuleError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchAdminBanners(authenticatedFetch),
      fetchAdminHomepageModules(authenticatedFetch),
    ])
      .then(([bannersRes, modulesRes]) => {
        setBanners(bannersRes.items);
        setModules(modulesRes.items);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Không thể tải dữ liệu cấu hình trang chủ');
        setLoading(false);
      });
  }, [authenticatedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const openCreateBannerModal = () => {
    setBannerModalMode('CREATE');
    setEditingBanner(null);
    setBannerTitle('');
    setBannerHref('/');
    setBannerImageUrl('');
    setBannerAltText('');
    setBannerTheme('brand');
    setBannerEyebrow('');
    setBannerSortOrder(0);
    setBannerError(null);
  };

  const openEditBannerModal = (b: AdminBannerSummary) => {
    setBannerModalMode('EDIT');
    setEditingBanner(b);
    setBannerTitle(b.title);
    setBannerHref(b.href);
    setBannerImageUrl(b.imageUrl || '');
    setBannerAltText(b.altText);
    setBannerTheme(b.theme);
    setBannerEyebrow(b.eyebrow || '');
    setBannerSortOrder(b.sortOrder);
    setBannerError(null);
  };

  const handleBannerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerHref.startsWith('/') || bannerHref.startsWith('//') || bannerHref.includes('://')) {
      setBannerError(
        'Đường dẫn phải là relative path hợp lệ (bắt đầu bằng / và không chứa domain ngoài)',
      );
      return;
    }

    setBannerSubmitting(true);
    setBannerError(null);

    try {
      if (bannerModalMode === 'CREATE') {
        await createAdminBanner(authenticatedFetch, {
          title: bannerTitle.trim(),
          href: bannerHref.trim(),
          imageUrl: bannerImageUrl.trim() || null,
          altText: bannerAltText.trim() || bannerTitle.trim(),
          theme: bannerTheme.trim(),
          eyebrow: bannerEyebrow.trim() || undefined,
          sortOrder: Number(bannerSortOrder),
        });
      } else if (bannerModalMode === 'EDIT' && editingBanner) {
        await updateAdminBanner(authenticatedFetch, editingBanner.id, {
          title: bannerTitle.trim(),
          href: bannerHref.trim(),
          imageUrl: bannerImageUrl.trim() || null,
          altText: bannerAltText.trim() || bannerTitle.trim(),
          theme: bannerTheme.trim(),
          eyebrow: bannerEyebrow.trim() || undefined,
          sortOrder: Number(bannerSortOrder),
        });
      }
      setBannerModalMode(null);
      loadData();
    } catch (error: unknown) {
      setBannerError(adminErrorMessage(error, 'Lỗi lưu banner'));
      setBannerSubmitting(false);
    }
  };

  const handleDeleteBanner = async (b: AdminBannerSummary) => {
    if (!window.confirm(`Xóa banner '${b.title}'?`)) return;
    try {
      await deleteAdminBanner(authenticatedFetch, b.id);
      loadData();
    } catch (error: unknown) {
      alert(`Không thể xóa: ${adminErrorMessage(error, 'Không thể xóa banner')}`);
    }
  };

  const openEditModuleModal = (m: AdminHomepageModuleSummary) => {
    setEditingModule(m);
    setModuleTitle(m.title);
    setModuleSubtitle(m.subtitle || '');
    setModuleSortOrder(m.sortOrder);
    setModuleEnabled(m.isEnabled);
    setModuleActiveFrom(m.activeFrom ? m.activeFrom.slice(0, 16) : '');
    setModuleActiveUntil(m.activeUntil ? m.activeUntil.slice(0, 16) : '');
    setModuleError(null);
  };

  const handleModuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModule) return;

    setModuleSubmitting(true);
    setModuleError(null);

    try {
      await updateAdminHomepageModule(authenticatedFetch, editingModule.id, {
        title: moduleTitle.trim(),
        subtitle: moduleSubtitle.trim() || undefined,
        sortOrder: Number(moduleSortOrder),
        isEnabled: moduleEnabled,
        activeFrom: moduleActiveFrom ? new Date(moduleActiveFrom).toISOString() : null,
        activeUntil: moduleActiveUntil ? new Date(moduleActiveUntil).toISOString() : null,
      });
      setEditingModule(null);
      loadData();
    } catch (error: unknown) {
      setModuleError(adminErrorMessage(error, 'Lỗi cập nhật module'));
      setModuleSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>
          Cấu hình Trang chủ & Banner
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
          Quản lý banner chiến dịch và bật/tắt, sắp xếp các module hiển thị trên trang chủ
          Marketplace.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e5e7eb' }}>
        <button
          onClick={() => setActiveTab('BANNERS')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'none',
            fontWeight: 600,
            fontSize: '14px',
            color: activeTab === 'BANNERS' ? '#ee4d2d' : '#6b7280',
            borderBottom: activeTab === 'BANNERS' ? '2px solid #ee4d2d' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          Banner Chiến dịch ({banners.length})
        </button>
        <button
          onClick={() => setActiveTab('MODULES')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'none',
            fontWeight: 600,
            fontSize: '14px',
            color: activeTab === 'MODULES' ? '#ee4d2d' : '#6b7280',
            borderBottom: activeTab === 'MODULES' ? '2px solid #ee4d2d' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          Cấu hình Modules ({modules.length})
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
          Đang tải dữ liệu cấu hình...
        </div>
      ) : error ? (
        <div style={{ padding: '24px', color: '#ef4444' }}>{error}</div>
      ) : activeTab === 'BANNERS' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={openCreateBannerModal} className="admin-btn admin-btn-primary">
              + Thêm Banner mới
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
            {banners.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>
                Chưa có banner nào.
              </div>
            ) : (
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '14px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: '#f9fafb',
                      borderBottom: '1px solid #e5e7eb',
                      color: '#4b5563',
                      fontSize: '13px',
                    }}
                  >
                    <th style={{ padding: '12px 16px' }}>Tiêu đề & Nhãn</th>
                    <th style={{ padding: '12px 16px' }}>Đích đến (Href)</th>
                    <th style={{ padding: '12px 16px' }}>Giao diện (Theme)</th>
                    <th style={{ padding: '12px 16px' }}>Thứ tự</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {banners.map((b) => (
                    <tr key={b.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#111827' }}>{b.title}</div>
                        {b.eyebrow && (
                          <div style={{ fontSize: '12px', color: '#ee4d2d' }}>{b.eyebrow}</div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#4b5563' }}>{b.href}</td>
                      <td style={{ padding: '14px 16px', color: '#6b7280' }}>{b.theme}</td>
                      <td style={{ padding: '14px 16px', color: '#111827', fontWeight: 600 }}>
                        {b.sortOrder}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => openEditBannerModal(b)}
                            style={{
                              padding: '4px 10px',
                              fontSize: '12px',
                              color: '#4b5563',
                              background: '#f3f4f6',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                            }}
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => handleDeleteBanner(b)}
                            style={{
                              padding: '4px 10px',
                              fontSize: '12px',
                              color: '#dc2626',
                              background: '#fee2e2',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                            }}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            overflow: 'hidden',
            border: '1px solid #f3f4f6',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '14px',
            }}
          >
            <thead>
              <tr
                style={{
                  background: '#f9fafb',
                  borderBottom: '1px solid #e5e7eb',
                  color: '#4b5563',
                  fontSize: '13px',
                }}
              >
                <th style={{ padding: '12px 16px' }}>Module Key & Loại</th>
                <th style={{ padding: '12px 16px' }}>Tiêu đề hiển thị</th>
                <th style={{ padding: '12px 16px' }}>Trạng thái</th>
                <th style={{ padding: '12px 16px' }}>Thứ tự</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{m.key}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{m.type}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ color: '#111827' }}>{m.title}</div>
                    {m.subtitle && (
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{m.subtitle}</div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: m.isEnabled ? '#d1fae5' : '#fee2e2',
                        color: m.isEnabled ? '#065f46' : '#991b1b',
                      }}
                    >
                      {m.isEnabled ? 'Kích hoạt' : 'Tắt'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 600 }}>{m.sortOrder}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => openEditModuleModal(m)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        color: '#4f46e5',
                        background: '#eef2ff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Cài đặt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Banner Modal */}
      {bannerModalMode && (
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
            <h2
              style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '16px' }}
            >
              {bannerModalMode === 'CREATE'
                ? 'Tạo banner mới'
                : `Chỉnh sửa banner: ${editingBanner?.title}`}
            </h2>

            <form
              onSubmit={handleBannerSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '4px',
                  }}
                >
                  Tiêu đề banner:
                </label>
                <input
                  type="text"
                  value={bannerTitle}
                  onChange={(e) => setBannerTitle(e.target.value)}
                  placeholder="Siêu Sale Hè 2026"
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

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '4px',
                  }}
                >
                  Đích đến (Relative URL bắt đầu bằng /):
                </label>
                <input
                  type="text"
                  value={bannerHref}
                  onChange={(e) => setBannerHref(e.target.value)}
                  placeholder="/search?q=sale"
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

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '4px',
                  }}
                >
                  URL Ảnh (Media relative hoặc S3):
                </label>
                <input
                  type="text"
                  value={bannerImageUrl}
                  onChange={(e) => setBannerImageUrl(e.target.value)}
                  placeholder="/media/banners/banner1.png"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '4px',
                    }}
                  >
                    Giao diện (Theme):
                  </label>
                  <input
                    type="text"
                    value={bannerTheme}
                    onChange={(e) => setBannerTheme(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      fontSize: '14px',
                    }}
                  />
                </div>
                <div style={{ width: '100px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '4px',
                    }}
                  >
                    Thứ tự:
                  </label>
                  <input
                    type="number"
                    value={bannerSortOrder}
                    onChange={(e) => setBannerSortOrder(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>

              {bannerError && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                >
                  {bannerError}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end',
                  marginTop: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setBannerModalMode(null)}
                  disabled={bannerSubmitting}
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
                  disabled={bannerSubmitting}
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
                  {bannerSubmitting ? 'Đang lưu...' : 'Lưu Banner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Module Edit Modal */}
      {editingModule && (
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
            <h2
              style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '16px' }}
            >
              Cài đặt Module: {editingModule.key}
            </h2>

            <form
              onSubmit={handleModuleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '4px',
                  }}
                >
                  Tiêu đề module:
                </label>
                <input
                  type="text"
                  value={moduleTitle}
                  onChange={(e) => setModuleTitle(e.target.value)}
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

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#374151',
                    marginBottom: '4px',
                  }}
                >
                  Phụ đề (Subtitle):
                </label>
                <input
                  type="text"
                  value={moduleSubtitle}
                  onChange={(e) => setModuleSubtitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
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
                    type="number"
                    value={moduleSortOrder}
                    onChange={(e) => setModuleSortOrder(Number(e.target.value))}
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
                  style={{ display: 'flex', alignItems: 'center', marginTop: '20px', gap: '8px' }}
                >
                  <input
                    type="checkbox"
                    id="moduleEnabledCheck"
                    checked={moduleEnabled}
                    onChange={(e) => setModuleEnabled(e.target.checked)}
                  />
                  <label
                    htmlFor="moduleEnabledCheck"
                    style={{
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      cursor: 'pointer',
                    }}
                  >
                    Kích hoạt module
                  </label>
                </div>
              </div>

              {moduleError && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    borderRadius: '6px',
                    fontSize: '13px',
                  }}
                >
                  {moduleError}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end',
                  marginTop: '12px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setEditingModule(null)}
                  disabled={moduleSubmitting}
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
                  disabled={moduleSubmitting}
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
                  {moduleSubmitting ? 'Đang lưu...' : 'Lưu cài đặt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

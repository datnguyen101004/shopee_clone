'use client';

import type {
  AdminBannerSummary,
  AdminHomepageModuleSummary,
  CampaignAdminSummary,
  HomepageBannerTargetType,
} from '@shopee-clone/contracts';
import { useCallback, useEffect, useState } from 'react';

import { useAuthSession } from '../../../../components/auth-session-provider';
import { AdminEntityLink } from '../../../../components/admin/admin-entity-link';
import { EditIcon, TrashIcon } from '../../../../components/admin/admin-icons';
import {
  createAdminBanner,
  deleteAdminBanner,
  adminErrorMessage,
  fetchAdminBanners,
  fetchAdminHomepageModules,
  updateAdminBanner,
  updateAdminHomepageModule,
} from '../../../../lib/admin-api';
import { fetchAdminCampaigns } from '../../../../lib/campaigns-api';

function adminBannerTarget(banner: AdminBannerSummary, activeCampaigns: CampaignAdminSummary[]) {
  if (!banner.targetId) return null;
  const campaign =
    banner.targetType === 'CAMPAIGN'
      ? activeCampaigns.find((item) => item.id === banner.targetId)
      : undefined;
  const labels: Record<string, string> = {
    PRODUCT: 'Sản phẩm đích',
    SHOP: 'Shop đích',
    CATEGORY: 'Danh mục đích',
    CAMPAIGN: campaign?.title ?? 'Chiến dịch đích',
  };
  const name = banner.targetName ?? labels[banner.targetType ?? ''] ?? 'Đối tượng đích';
  const href =
    banner.targetType === 'CAMPAIGN'
      ? `/admin/campaigns/${banner.targetId}`
      : banner.targetType === 'PRODUCT'
        ? `/admin/products/${banner.targetId}`
        : banner.targetType === 'SHOP'
          ? `/admin/shops/${banner.targetId}`
          : `/admin/categories#admin-category-${banner.targetId}`;
  return { href, name, imageUrl: banner.targetImageUrl };
}

export default function AdminHomepageConfigPage() {
  const { authenticatedFetch } = useAuthSession();
  const [banners, setBanners] = useState<AdminBannerSummary[]>([]);
  const [modules, setModules] = useState<AdminHomepageModuleSummary[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<CampaignAdminSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab
  const [activeTab, setActiveTab] = useState<'BANNERS' | 'MODULES'>('BANNERS');

  // Banner Modal
  const [bannerModalMode, setBannerModalMode] = useState<'CREATE' | 'EDIT' | null>(null);
  const [editingBanner, setEditingBanner] = useState<AdminBannerSummary | null>(null);
  const [bannerTitle, setBannerTitle] = useState('');
  const [bannerTargetType, setBannerTargetType] = useState<HomepageBannerTargetType>('URL');
  const [bannerTargetId, setBannerTargetId] = useState('');
  const [bannerTargetQuery, setBannerTargetQuery] = useState('/');
  const [bannerImageUrl, setBannerImageUrl] = useState('');
  const [bannerAltText, setBannerAltText] = useState('');
  const [bannerTheme, setBannerTheme] = useState('brand');
  const [bannerEyebrow, setBannerEyebrow] = useState('');
  const [bannerSortOrder, setBannerSortOrder] = useState<number>(0);
  const [bannerDisplayFrom, setBannerDisplayFrom] = useState('');
  const [bannerDisplayUntil, setBannerDisplayUntil] = useState('');
  const [bannerEnabled, setBannerEnabled] = useState(true);
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
      fetchAdminCampaigns(authenticatedFetch, '?state=ACTIVE&limit=50'),
    ])
      .then(([bannersRes, modulesRes, campaignsRes]) => {
        setBanners(bannersRes.items);
        setModules(modulesRes.items);
        setActiveCampaigns(campaignsRes.items);
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
    setBannerTargetType('URL');
    setBannerTargetId('');
    setBannerTargetQuery('/');
    setBannerImageUrl('');
    setBannerAltText('');
    setBannerTheme('brand');
    setBannerEyebrow('');
    setBannerSortOrder(0);
    setBannerDisplayFrom('');
    setBannerDisplayUntil('');
    setBannerEnabled(true);
    setBannerError(null);
  };

  const openEditBannerModal = (b: AdminBannerSummary) => {
    setBannerModalMode('EDIT');
    setEditingBanner(b);
    setBannerTitle(b.title);
    setBannerTargetType(b.targetType ?? 'URL');
    setBannerTargetId(b.targetId ?? '');
    setBannerTargetQuery(b.targetQuery ?? b.href ?? '/');
    setBannerImageUrl(b.imageUrl || '');
    setBannerAltText(b.altText);
    setBannerTheme(b.theme);
    setBannerEyebrow(b.eyebrow || '');
    setBannerSortOrder(b.sortOrder ?? b.priority ?? 0);
    setBannerDisplayFrom(b.displayFrom ? b.displayFrom.slice(0, 16) : '');
    setBannerDisplayUntil(b.displayUntil ? b.displayUntil.slice(0, 16) : '');
    setBannerEnabled(b.isEnabled !== false);
    setBannerError(null);
  };

  const handleBannerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const needsId = ['CAMPAIGN', 'PRODUCT', 'SHOP', 'CATEGORY'].includes(bannerTargetType);
    if (needsId && !bannerTargetId.trim()) {
      setBannerError('Vui lòng chọn đối tượng đích cho banner.');
      return;
    }
    if (!needsId && !bannerTargetQuery.trim()) {
      setBannerError('Vui lòng nhập giá trị đích đến.');
      return;
    }

    setBannerSubmitting(true);
    setBannerError(null);

    try {
      const previousTargetType = editingBanner?.targetType ?? 'URL';
      const previousTargetValue = ['CAMPAIGN', 'PRODUCT', 'SHOP', 'CATEGORY'].includes(
        previousTargetType,
      )
        ? (editingBanner?.targetId ?? '')
        : (editingBanner?.targetQuery ?? editingBanner?.href ?? '');
      const nextTargetValue = needsId ? bannerTargetId.trim() : bannerTargetQuery.trim();
      const targetChanged =
        bannerModalMode === 'CREATE' ||
        previousTargetType !== bannerTargetType ||
        previousTargetValue !== nextTargetValue;
      const targetFields = targetChanged
        ? {
            targetType: bannerTargetType,
            targetId: needsId ? bannerTargetId.trim() : null,
            targetQuery: needsId ? null : bannerTargetQuery.trim(),
          }
        : {};
      if (bannerModalMode === 'CREATE') {
        await createAdminBanner(authenticatedFetch, {
          title: bannerTitle.trim(),
          imageUrl: bannerImageUrl.trim() || null,
          altText: bannerAltText.trim() || bannerTitle.trim(),
          theme: bannerTheme.trim(),
          eyebrow: bannerEyebrow.trim() || undefined,
          ...targetFields,
          displayFrom: bannerDisplayFrom ? new Date(bannerDisplayFrom).toISOString() : null,
          displayUntil: bannerDisplayUntil ? new Date(bannerDisplayUntil).toISOString() : null,
          isEnabled: bannerEnabled,
          priority: Number(bannerSortOrder),
          sortOrder: Number(bannerSortOrder),
        });
      } else if (bannerModalMode === 'EDIT' && editingBanner) {
        await updateAdminBanner(authenticatedFetch, editingBanner.id, {
          title: bannerTitle.trim(),
          imageUrl: bannerImageUrl.trim() || null,
          altText: bannerAltText.trim() || bannerTitle.trim(),
          theme: bannerTheme.trim(),
          eyebrow: bannerEyebrow.trim() || undefined,
          ...targetFields,
          displayFrom: bannerDisplayFrom ? new Date(bannerDisplayFrom).toISOString() : null,
          displayUntil: bannerDisplayUntil ? new Date(bannerDisplayUntil).toISOString() : null,
          isEnabled: bannerEnabled,
          priority: Number(bannerSortOrder),
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
    <div className="admin-page admin-homepage-page">
      {/* Tabs */}
      <div className="admin-tabs" role="tablist" aria-label="Cấu hình trang chủ">
        <button
          className={`admin-tab-btn ${activeTab === 'BANNERS' ? 'admin-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('BANNERS')}
        >
          Banner Chiến dịch ({banners.length})
        </button>
        <button
          className={`admin-tab-btn ${activeTab === 'MODULES' ? 'admin-tab-btn--active' : ''}`}
          onClick={() => setActiveTab('MODULES')}
        >
          Cấu hình Modules ({modules.length})
        </button>
      </div>

      {loading ? (
        <div className="admin-state-card__message">Đang tải dữ liệu cấu hình...</div>
      ) : error ? (
        <div className="admin-state-card__message admin-state-card__message--error">{error}</div>
      ) : activeTab === 'BANNERS' ? (
        <div className="admin-homepage-list">
          <div className="admin-page-actions">
            <button onClick={openCreateBannerModal} className="admin-btn admin-btn-primary">
              + Thêm Banner mới
            </button>
          </div>

          <div
            className="admin-table-card"
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              overflow: 'hidden',
              border: '1px solid #f3f4f6',
            }}
          >
            {banners.length === 0 ? (
              <div className="admin-state-card__message">Chưa có banner nào.</div>
            ) : (
              <table
                className="admin-data-table admin-homepage-table admin-homepage-banner-table"
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
                    <th style={{ padding: '12px 16px' }}>Đối tượng đích</th>
                    <th style={{ padding: '12px 16px' }}>Giao diện (Theme)</th>
                    <th style={{ padding: '12px 16px' }}>Thứ tự</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {banners.map((b) => (
                    <tr
                      key={b.id}
                      id={`admin-banner-${b.id}`}
                      style={{ borderBottom: '1px solid #f3f4f6' }}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <AdminEntityLink
                          href={`#admin-banner-${b.id}`}
                          name={b.title}
                          imageUrl={b.imageUrl}
                          meta={b.eyebrow}
                        />
                      </td>
                      <td style={{ padding: '14px 16px', color: '#4b5563' }}>
                        <div>{b.targetType ?? 'URL'}</div>
                        {(() => {
                          const target = adminBannerTarget(b, activeCampaigns);
                          return target ? (
                            <AdminEntityLink
                              href={target.href}
                              name={target.name}
                              imageUrl={target.imageUrl}
                              meta={
                                b.targetAvailable === false ? 'Không khả dụng' : 'Mở trong Admin'
                              }
                            />
                          ) : (
                            <small>{b.targetQuery ?? 'Không có đối tượng quản lý'}</small>
                          );
                        })()}
                        {b.targetType === 'CAMPAIGN' && b.targetAvailable === false && (
                          <div className="admin-badge admin-badge--warning">
                            Mục tiêu không khả dụng
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#6b7280' }}>{b.theme}</td>
                      <td style={{ padding: '14px 16px', color: '#111827', fontWeight: 600 }}>
                        {b.sortOrder}
                      </td>
                      <td className="admin-table-cell--actions admin-homepage-actions-cell">
                        <div className="admin-table-actions admin-homepage-row-actions">
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn--secondary"
                            aria-label={`Sửa banner ${b.title}`}
                            title="Sửa banner"
                            onClick={() => openEditBannerModal(b)}
                          >
                            <EditIcon aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="admin-icon-btn admin-icon-btn--danger"
                            aria-label={`Xóa banner ${b.title}`}
                            title="Xóa banner"
                            onClick={() => handleDeleteBanner(b)}
                          >
                            <TrashIcon aria-hidden="true" />
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
          className="admin-table-card"
          style={{
            background: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            overflow: 'hidden',
            border: '1px solid #f3f4f6',
          }}
        >
          <table
            className="admin-data-table admin-homepage-table admin-homepage-module-table"
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
                <tr key={m.id} id={`admin-module-${m.id}`}>
                  <td style={{ padding: '14px 16px' }}>
                    <AdminEntityLink href={`#admin-module-${m.id}`} name={m.key} meta={m.type} />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ color: '#111827' }}>{m.title}</div>
                    {m.subtitle && (
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>{m.subtitle}</div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      className={`admin-badge ${m.isEnabled ? 'admin-badge--success' : 'admin-badge--danger'}`}
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
                  <td className="admin-table-cell--actions admin-homepage-actions-cell">
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn--secondary"
                      aria-label={`Cài đặt module ${m.key}`}
                      title="Cài đặt module"
                      onClick={() => openEditModuleModal(m)}
                    >
                      <EditIcon aria-hidden="true" />
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
              {bannerModalMode === 'CREATE'
                ? 'Tạo banner mới'
                : `Chỉnh sửa banner: ${editingBanner?.title}`}
            </h2>

            <form
              className="admin-dialog__form admin-banner-form"
              onSubmit={handleBannerSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              {editingBanner?.targetType === 'CAMPAIGN' &&
                editingBanner.targetAvailable === false && (
                  <div className="admin-alert admin-alert--warning" role="alert">
                    Chiến dịch hiện tại không còn hoạt động. Bạn vẫn có thể sửa nội dung banner; hãy
                    chọn một chiến dịch ACTIVE mới để khôi phục liên kết.
                  </div>
                )}
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
                  Tiêu đề banner:
                </label>
                <input
                  className="admin-control"
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
                  Kiểu đối tượng đích:
                </label>
                <select
                  className="admin-control"
                  value={bannerTargetType}
                  onChange={(e) => {
                    const next = e.target.value as HomepageBannerTargetType;
                    setBannerTargetType(next);
                    setBannerTargetId('');
                    setBannerTargetQuery(next === 'URL' ? '/' : '');
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                  }}
                >
                  <option value="CAMPAIGN">Chiến dịch</option>
                  <option value="PRODUCT">Sản phẩm</option>
                  <option value="SHOP">Shop</option>
                  <option value="CATEGORY">Danh mục</option>
                  <option value="SEARCH">Tìm kiếm</option>
                  <option value="URL">Đường dẫn nội bộ</option>
                </select>
              </div>

              {bannerTargetType === 'CAMPAIGN' ? (
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
                    Chiến dịch đang hoạt động:
                  </label>
                  <select
                    className="admin-control"
                    value={bannerTargetId}
                    onChange={(e) => setBannerTargetId(e.target.value)}
                    required
                  >
                    <option value="">Chọn chiến dịch</option>
                    {editingBanner?.targetType === 'CAMPAIGN' &&
                      editingBanner.targetId &&
                      !activeCampaigns.some(
                        (campaign) => campaign.id === editingBanner.targetId,
                      ) && (
                        <option value={editingBanner.targetId} disabled>
                          Chiến dịch hiện tại không còn ACTIVE
                        </option>
                      )}
                    {activeCampaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.title} · {campaign.type.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              ) : ['PRODUCT', 'SHOP', 'CATEGORY'].includes(bannerTargetType) ? (
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
                    ID đối tượng:
                  </label>
                  <input
                    className="admin-control"
                    type="text"
                    value={bannerTargetId}
                    onChange={(e) => setBannerTargetId(e.target.value)}
                    placeholder="UUID của đối tượng"
                    required
                  />
                </div>
              ) : (
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
                    {bannerTargetType === 'SEARCH' ? 'Từ khóa tìm kiếm:' : 'Đường dẫn nội bộ:'}
                  </label>
                  <input
                    className="admin-control"
                    type="text"
                    value={bannerTargetQuery}
                    onChange={(e) => setBannerTargetQuery(e.target.value)}
                    placeholder={bannerTargetType === 'SEARCH' ? 'sale hè 2026' : '/search?q=sale'}
                    required
                  />
                </div>
              )}

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
                  Nhãn phụ (Eyebrow):
                </label>
                <input
                  className="admin-control"
                  type="text"
                  value={bannerEyebrow}
                  onChange={(e) => setBannerEyebrow(e.target.value)}
                  placeholder="Nhãn ngắn hiển thị trên banner"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                  }}
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
                  URL Ảnh (Media relative hoặc S3):
                </label>
                <input
                  className="admin-control"
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

              <div className="admin-homepage-banner-preview" aria-label="Xem trước banner">
                <span className="admin-inline-accent">Xem trước</span>
                <strong>{bannerTitle.trim() || 'Tiêu đề banner'}</strong>
                <small>
                  {bannerTargetType} ·{' '}
                  {bannerTargetId ? 'Đã chọn đối tượng' : bannerTargetQuery || 'Chưa chọn đích'}
                </small>
                {bannerImageUrl.trim() ? <img src={bannerImageUrl.trim()} alt="" /> : null}
              </div>

              <div className="admin-dialog__field-row">
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
                    Giao diện (Theme):
                  </label>
                  <input
                    className="admin-control"
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
                <div className="admin-field admin-field--compact">
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
                    className="admin-control"
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

              <div className="admin-dialog__field-row">
                <label className="admin-field" style={{ display: 'block' }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '4px',
                    }}
                  >
                    Hiển thị từ:
                  </span>
                  <input
                    className="admin-control"
                    type="datetime-local"
                    value={bannerDisplayFrom}
                    onChange={(e) => setBannerDisplayFrom(e.target.value)}
                  />
                </label>
                <label className="admin-field" style={{ display: 'block' }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#374151',
                      marginBottom: '4px',
                    }}
                  >
                    Hiển thị đến:
                  </span>
                  <input
                    className="admin-control"
                    type="datetime-local"
                    value={bannerDisplayUntil}
                    onChange={(e) => setBannerDisplayUntil(e.target.value)}
                  />
                </label>
              </div>

              <label
                className="admin-checkbox-field"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <input
                  className="admin-checkbox-control"
                  type="checkbox"
                  checked={bannerEnabled}
                  onChange={(e) => setBannerEnabled(e.target.checked)}
                />
                <span>Cho phép hiển thị banner</span>
              </label>

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
                  onClick={() => setBannerModalMode(null)}
                  disabled={bannerSubmitting}
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
                  disabled={bannerSubmitting}
                  className="admin-btn admin-btn-primary"
                  style={{
                    padding: '8px 16px',
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
              Cài đặt Module: {editingModule.key}
            </h2>

            <form
              className="admin-dialog__form admin-module-form"
              onSubmit={handleModuleSubmit}
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
                  Tiêu đề module:
                </label>
                <input
                  className="admin-control"
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
                  Phụ đề (Subtitle):
                </label>
                <input
                  className="admin-control"
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

              <div className="admin-dialog__field-row">
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
                  className="admin-checkbox-field"
                  style={{ display: 'flex', alignItems: 'center', marginTop: '20px', gap: '8px' }}
                >
                  <input
                    className="admin-checkbox-control"
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
                  onClick={() => setEditingModule(null)}
                  disabled={moduleSubmitting}
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
                  disabled={moduleSubmitting}
                  className="admin-btn admin-btn-primary"
                  style={{
                    padding: '8px 16px',
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

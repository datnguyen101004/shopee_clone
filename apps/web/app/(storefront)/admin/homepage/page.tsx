'use client';

import type {
  AdminBannerSummary,
  AdminHomepageModuleSummary,
  CampaignAdminSummary,
  HomepageBannerTargetType,
} from '@shopee-clone/contracts';
import { ADMIN_BANNER_MEDIA_MIME_TYPES } from '@shopee-clone/contracts';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { useAuthSession } from '../../../../components/auth-session-provider';
import { AdminEntityLink } from '../../../../components/admin/admin-entity-link';
import { EditIcon, TrashIcon } from '../../../../components/admin/admin-icons';
import { DateTimeLocalPicker } from '../../../../components/datetime-local-picker';
import {
  createAdminBanner,
  deleteAdminBanner,
  adminErrorMessage,
  fetchAdminBanners,
  fetchAdminHomepageModules,
  uploadAdminBannerMedia,
  updateAdminBanner,
  updateAdminHomepageModule,
} from '../../../../lib/admin-api';
import { fetchAllAdminCampaigns } from '../../../../lib/campaigns-api';

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

type BannerImageUploadState = {
  status: 'idle' | 'selected' | 'uploading' | 'ready' | 'error';
  file: File | null;
  fileName: string | null;
  previewUrl: string | null;
  error: string | null;
};

const MAX_BANNER_IMAGE_BYTES = 5 * 1024 * 1024;

function validateBannerImageFile(file: File): string | null {
  if (!(ADMIN_BANNER_MEDIA_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Ảnh banner phải là JPG, PNG hoặc WebP.';
  }
  if (file.size < 1 || file.size > MAX_BANNER_IMAGE_BYTES) {
    return 'Ảnh banner phải có dung lượng từ 1 byte đến tối đa 5 MB.';
  }
  return null;
}

type BannerDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function padBannerDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function bannerDateTimeParts(value: string): BannerDateTimeParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const parsed = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  };
  if (
    parsed.month < 1 ||
    parsed.month > 12 ||
    parsed.day < 1 ||
    parsed.day > 31 ||
    parsed.hour > 23 ||
    parsed.minute > 59
  ) {
    return null;
  }
  return parsed;
}

function bannerDateTimeInputValue(parts: BannerDateTimeParts): string {
  return `${parts.year}-${padBannerDatePart(parts.month)}-${padBannerDatePart(parts.day)}T${padBannerDatePart(parts.hour)}:${padBannerDatePart(parts.minute)}`;
}

function bannerTimeZoneParts(date: Date, timeZone: string): BannerDateTimeParts {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<string, number>;
  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
  };
}

export function isoToBannerDateTimeInput(
  value: string | null | undefined,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return bannerDateTimeInputValue(bannerTimeZoneParts(date, timeZone));
}

function bannerTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = bannerTimeZoneParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - date.getTime();
}

export function bannerDateTimeInputToIso(
  value: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string | null {
  const parts = bannerDateTimeParts(value);
  if (!parts) return null;
  const wallClockMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let utcMs = wallClockMs;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    utcMs = wallClockMs - bannerTimeZoneOffsetMs(new Date(utcMs), timeZone);
  }
  const result = new Date(utcMs);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
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
  const [bannerExistingImageUrl, setBannerExistingImageUrl] = useState('');
  const [bannerImageAssetId, setBannerImageAssetId] = useState<string | null>(null);
  const [bannerImageUpload, setBannerImageUpload] = useState<BannerImageUploadState>({
    status: 'idle',
    file: null,
    fileName: null,
    previewUrl: null,
    error: null,
  });
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
  const bannerSubmittingRef = useRef(false);
  const bannerUploadToken = useRef(0);
  const bannerPreviewUrlRef = useRef<string | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null);

  const invalidateBannerImageUpload = useCallback(() => {
    bannerUploadToken.current += 1;
    if (bannerPreviewUrlRef.current) {
      URL.revokeObjectURL(bannerPreviewUrlRef.current);
      bannerPreviewUrlRef.current = null;
    }
  }, []);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchAdminBanners(authenticatedFetch),
      fetchAdminHomepageModules(authenticatedFetch),
      fetchAllAdminCampaigns(authenticatedFetch, '?state=ACTIVE'),
    ])
      .then(([bannersRes, modulesRes, campaignsRes]) => {
        setBanners(bannersRes.items);
        setModules(modulesRes.items);
        setActiveCampaigns(campaignsRes);
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

  useEffect(
    () => () => {
      invalidateBannerImageUpload();
    },
    [invalidateBannerImageUpload],
  );

  const openCreateBannerModal = () => {
    invalidateBannerImageUpload();
    setBannerModalMode('CREATE');
    setEditingBanner(null);
    setBannerTitle('');
    setBannerTargetType('URL');
    setBannerTargetId('');
    setBannerTargetQuery('/');
    setBannerImageUrl('');
    setBannerExistingImageUrl('');
    setBannerImageAssetId(null);
    setBannerImageUpload({ status: 'idle', file: null, fileName: null, previewUrl: null, error: null });
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
    invalidateBannerImageUpload();
    setBannerModalMode('EDIT');
    setEditingBanner(b);
    setBannerTitle(b.title);
    setBannerTargetType(b.targetType ?? 'URL');
    setBannerTargetId(b.targetId ?? '');
    setBannerTargetQuery(b.targetQuery ?? b.href ?? '/');
    setBannerImageUrl(b.imageUrl || '');
    setBannerExistingImageUrl(b.imageUrl || '');
    setBannerImageAssetId(null);
    setBannerImageUpload({ status: 'idle', file: null, fileName: null, previewUrl: null, error: null });
    setBannerAltText(b.altText);
    setBannerTheme(b.theme);
    setBannerEyebrow(b.eyebrow || '');
    setBannerSortOrder(b.sortOrder ?? b.priority ?? 0);
    setBannerDisplayFrom(isoToBannerDateTimeInput(b.displayFrom));
    setBannerDisplayUntil(isoToBannerDateTimeInput(b.displayUntil));
    setBannerEnabled(b.isEnabled !== false);
    setBannerError(null);
  };

  const handleBannerImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    invalidateBannerImageUpload();
    const validationError = validateBannerImageFile(file);
    if (validationError) {
      setBannerImageAssetId(null);
      setBannerImageUpload({
        status: 'error',
        file: null,
        fileName: file.name,
        previewUrl: null,
        error: validationError,
      });
      setBannerError(null);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    bannerPreviewUrlRef.current = previewUrl;
    setBannerImageAssetId(null);
    setBannerImageUpload({ status: 'selected', file, fileName: file.name, previewUrl, error: null });
    setBannerError(null);
  };

  const clearBannerImageSelection = () => {
    invalidateBannerImageUpload();
    setBannerImageAssetId(null);
    setBannerImageUrl(bannerExistingImageUrl);
    setBannerImageUpload({ status: 'idle', file: null, fileName: null, previewUrl: null, error: null });
  };

  const closeBannerModal = () => {
    if (bannerSubmitting || bannerImageUpload.status === 'uploading') return;
    invalidateBannerImageUpload();
    setBannerModalMode(null);
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
    if (bannerImageUpload.status === 'uploading') {
      setBannerError('Vui lòng chờ ảnh banner tải lên hoàn tất.');
      return;
    }
    if (bannerImageUpload.status === 'error' && !bannerImageUpload.file) {
      setBannerError(bannerImageUpload.error ?? 'Ảnh banner không hợp lệ.');
      return;
    }
    if (bannerSubmittingRef.current || bannerSubmitting) return;

    bannerSubmittingRef.current = true;
    setBannerSubmitting(true);
    setBannerError(null);

    try {
      let nextImageAssetId = bannerImageAssetId;
      let nextImageUrl = bannerImageUrl.trim() || null;
      const selectedFile = bannerImageUpload.file;
      if (
        selectedFile &&
        (bannerImageUpload.status === 'selected' || bannerImageUpload.status === 'error')
      ) {
        const token = ++bannerUploadToken.current;
        setBannerImageUpload((current) => ({ ...current, status: 'uploading', error: null }));
        try {
          const media = await uploadAdminBannerMedia(authenticatedFetch, selectedFile);
          if (token !== bannerUploadToken.current) {
            bannerSubmittingRef.current = false;
            setBannerSubmitting(false);
            return;
          }
          if (bannerPreviewUrlRef.current) {
            URL.revokeObjectURL(bannerPreviewUrlRef.current);
            bannerPreviewUrlRef.current = null;
          }
          nextImageAssetId = media.id;
          nextImageUrl = media.imageUrl;
          setBannerImageAssetId(media.id);
          setBannerImageUrl(media.imageUrl);
          setBannerImageUpload((current) => ({
            ...current,
            status: 'ready',
            previewUrl: media.imageUrl,
            error: null,
          }));
        } catch (cause: unknown) {
          setBannerImageUpload((current) => ({
            ...current,
            status: 'error',
            error: adminErrorMessage(cause, 'Không thể tải ảnh banner lên.'),
          }));
          setBannerError(adminErrorMessage(cause, 'Không thể tải ảnh banner lên.'));
          bannerSubmittingRef.current = false;
          setBannerSubmitting(false);
          return;
        }
      }
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
      const imageFields = nextImageAssetId
        ? { imageAssetId: nextImageAssetId }
        : { imageUrl: nextImageUrl };
      if (bannerModalMode === 'CREATE') {
        await createAdminBanner(authenticatedFetch, {
          title: bannerTitle.trim(),
          ...imageFields,
          altText: bannerAltText.trim() || bannerTitle.trim(),
          theme: bannerTheme.trim(),
          eyebrow: bannerEyebrow.trim() || undefined,
          ...targetFields,
          displayFrom: bannerDisplayFrom ? bannerDateTimeInputToIso(bannerDisplayFrom) : null,
          displayUntil: bannerDisplayUntil ? bannerDateTimeInputToIso(bannerDisplayUntil) : null,
          isEnabled: bannerEnabled,
          priority: Number(bannerSortOrder),
          sortOrder: Number(bannerSortOrder),
        });
      } else if (bannerModalMode === 'EDIT' && editingBanner) {
        await updateAdminBanner(authenticatedFetch, editingBanner.id, {
          title: bannerTitle.trim(),
          ...imageFields,
          altText: bannerAltText.trim() || bannerTitle.trim(),
          theme: bannerTheme.trim(),
          eyebrow: bannerEyebrow.trim() || undefined,
          ...targetFields,
          displayFrom: bannerDisplayFrom ? bannerDateTimeInputToIso(bannerDisplayFrom) : null,
          displayUntil: bannerDisplayUntil ? bannerDateTimeInputToIso(bannerDisplayUntil) : null,
          isEnabled: bannerEnabled,
          priority: Number(bannerSortOrder),
          sortOrder: Number(bannerSortOrder),
        });
      }
      invalidateBannerImageUpload();
      setBannerModalMode(null);
      bannerSubmittingRef.current = false;
      setBannerSubmitting(false);
      loadData();
    } catch (error: unknown) {
      setBannerError(adminErrorMessage(error, 'Lỗi lưu banner'));
      bannerSubmittingRef.current = false;
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
              <div className="admin-table-scroll">
                <table
                  className="admin-data-table admin-management-table admin-homepage-table admin-homepage-banner-table"
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                  }}
                >
                <thead>
                  <tr
                    style={{
                      background: '#f9fafb',
                      borderBottom: '1px solid #e5e7eb',
                      color: '#4b5563',
                    }}
                  >
                    <th style={{ padding: '12px 16px' }} className="management-table-id-cell">ID</th>
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
                      <td className="management-table-id-cell" style={{ padding: '14px 16px' }}>{b.id}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <AdminEntityLink
                          href={`#admin-banner-${b.id}`}
                          name={b.title}
                          imageUrl={b.imageUrl}
                          meta={b.eyebrow}
                        />
                      </td>
                      <td className="admin-homepage-banner-target-cell">
                        <div className="admin-homepage-banner-target">
                          <span className="admin-homepage-banner-target__type">
                            {b.targetType ?? 'URL'}
                          </span>
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
                            <span className="admin-badge admin-badge--warning">
                              Mục tiêu không khả dụng
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#6b7280' }}>{b.theme}</td>
                      <td style={{ padding: '14px 16px', color: '#111827' }}>
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
              </div>
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
          <div className="admin-table-scroll">
            <table
              className="admin-data-table admin-management-table admin-homepage-table admin-homepage-module-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
              }}
            >
            <thead>
              <tr
                style={{
                  background: '#f9fafb',
                  borderBottom: '1px solid #e5e7eb',
                  color: '#4b5563',
                }}
              >
                <th style={{ padding: '12px 16px' }} className="management-table-id-cell">ID</th>
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
                  <td className="management-table-id-cell" style={{ padding: '14px 16px' }}>{m.id}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <AdminEntityLink href={`#admin-module-${m.id}`} name={m.key} meta={m.type} />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ color: '#111827' }}>{m.title}</div>
                    {m.subtitle && (
                      <div className="admin-table-subtext" style={{ color: '#6b7280' }}>{m.subtitle}</div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span
                      className={`admin-badge admin-table-status ${m.isEnabled ? 'admin-badge--success' : 'admin-badge--danger'}`}
                      style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: '12px',
                        background: m.isEnabled ? '#d1fae5' : '#fee2e2',
                        color: m.isEnabled ? '#065f46' : '#991b1b',
                      }}
                    >
                      {m.isEnabled ? 'Kích hoạt' : 'Tắt'}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>{m.sortOrder}</td>
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
        </div>
      )}

      {/* Banner Modal */}
      {bannerModalMode && (
        <div
          className="admin-dialog-backdrop admin-homepage-banner-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeBannerModal();
          }}
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
            className="admin-dialog admin-homepage-banner-dialog"
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
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

              <div className="admin-field admin-banner-image-upload">
                <label htmlFor="admin-banner-image-file">Ảnh banner:</label>
                <div className="admin-banner-image-upload__controls">
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary"
                    onClick={() => bannerFileInputRef.current?.click()}
                    disabled={bannerSubmitting || bannerImageUpload.status === 'uploading'}
                    aria-controls="admin-banner-image-file"
                  >
                    Chọn ảnh từ máy
                  </button>
                  <span className="admin-banner-image-upload__filename">
                    {bannerImageUpload.fileName ?? 'Chưa chọn ảnh mới'}
                  </span>
                </div>
                <input
                  ref={bannerFileInputRef}
                  id="admin-banner-image-file"
                  className="admin-banner-image-upload__input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleBannerImageFileChange}
                  disabled={bannerSubmitting || bannerImageUpload.status === 'uploading'}
                />
                <small className="admin-banner-image-upload__hint">
                  JPG, PNG hoặc WebP · tối đa 5 MB
                </small>
                {bannerImageUpload.status === 'selected' && bannerImageUpload.fileName ? (
                  <small className="admin-banner-image-upload__status" role="status">
                    Đã chọn {bannerImageUpload.fileName}. Ảnh sẽ được tải lên khi lưu banner.
                  </small>
                ) : null}
                {bannerImageUpload.status === 'uploading' && bannerImageUpload.fileName ? (
                  <small className="admin-banner-image-upload__status" role="status">
                    Đang tải {bannerImageUpload.fileName} lên kho ảnh…
                  </small>
                ) : null}
                {bannerImageUpload.status === 'ready' && bannerImageUpload.fileName ? (
                  <small className="admin-banner-image-upload__status" role="status">
                    Đã tải ảnh {bannerImageUpload.fileName} lên kho ảnh.
                  </small>
                ) : null}
                {bannerImageUpload.status === 'error' && bannerImageUpload.error ? (
                  <small className="admin-banner-image-upload__error" role="alert">
                    {bannerImageUpload.error}
                  </small>
                ) : null}
                {bannerImageUpload.status !== 'idle' ? (
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary admin-banner-image-upload__reset"
                    onClick={clearBannerImageSelection}
                    disabled={bannerSubmitting || bannerImageUpload.status === 'uploading'}
                  >
                    {bannerModalMode === 'EDIT' && bannerExistingImageUrl
                      ? 'Giữ ảnh hiện tại'
                      : 'Bỏ ảnh mới'}
                  </button>
                ) : null}
              </div>

              <div className="admin-homepage-banner-preview" aria-label="Xem trước banner">
                <span className="admin-inline-accent">Xem trước</span>
                <strong>{bannerTitle.trim() || 'Tiêu đề banner'}</strong>
                <small>
                  {bannerTargetType} ·{' '}
                  {bannerTargetId ? 'Đã chọn đối tượng' : bannerTargetQuery || 'Chưa chọn đích'}
                </small>
                {(bannerImageUpload.previewUrl ?? bannerImageUrl.trim()) ? (
                  <img src={bannerImageUpload.previewUrl ?? bannerImageUrl.trim()} alt="" />
                ) : null}
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
                <div className="admin-field">
                  <span className="admin-field__label">Hiển thị từ:</span>
                  <DateTimeLocalPicker
                    aria-label="Hiển thị từ"
                    value={bannerDisplayFrom}
                    onChange={setBannerDisplayFrom}
                    locale="en"
                    popoverClassName="datetime-local-picker__popover--admin-modal"
                    disabled={bannerSubmitting}
                  />
                </div>
                <div className="admin-field">
                  <span className="admin-field__label">Hiển thị đến:</span>
                  <DateTimeLocalPicker
                    aria-label="Hiển thị đến"
                    value={bannerDisplayUntil}
                    onChange={setBannerDisplayUntil}
                    locale="en"
                    popoverClassName="datetime-local-picker__popover--admin-modal"
                    disabled={bannerSubmitting}
                  />
                </div>
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
                  onClick={closeBannerModal}
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
                  disabled={
                    bannerSubmitting ||
                    bannerImageUpload.status === 'uploading' ||
                    (bannerImageUpload.status === 'error' && !bannerImageUpload.file)
                  }
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

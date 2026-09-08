'use client';

import type {
  CampaignAdminPage,
  CampaignAdminSummary,
  CampaignBannerDetail,
  CampaignTypeSummary,
  CreateCampaignRequest,
} from '@shopee-clone/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelAdminCampaign,
  createAdminCampaign,
  fetchAdminCampaigns,
  fetchCampaignTypes,
  previewAdminCampaign,
  publishAdminCampaign,
} from '../../lib/campaigns-api';
import { useAuthSession } from '../auth-session-provider';
import { AdminEntityLink } from './admin-entity-link';
import { CheckIcon, EyeIcon, XIcon } from './admin-icons';
import { AdminPagination } from './admin-pagination';

type DateField = 'announceAt' | 'enrollmentStartsAt' | 'enrollmentEndsAt' | 'startsAt' | 'endsAt';

const initial = (): CreateCampaignRequest => ({
  typeCode: 'STANDARD',
  title: '',
  description: '',
  content: [{ kind: 'paragraph', text: '' }],
  altText: 'Ảnh chi tiết chiến dịch',
  announceAt: new Date().toISOString(),
  enrollmentStartsAt: new Date(Date.now() + 3_600_000).toISOString(),
  enrollmentEndsAt: new Date(Date.now() + 86_400_000).toISOString(),
  startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  endsAt: new Date(Date.now() + 172_800_000).toISOString(),
  minimumDiscountBasisPoints: 500,
});

export function localDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16);

  const pad = (part: number) => String(part).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(
    parsed.getHours(),
  )}:${pad(parsed.getMinutes())}`;
}

export function isoDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function campaignLifecycleLabel(value: CampaignAdminSummary['lifecycle']): string {
  const labels: Record<CampaignAdminSummary['lifecycle'], string> = {
    DRAFT: 'Bản nháp',
    ANNOUNCED: 'Đã thông báo',
    ENROLLMENT_OPEN: 'Đang nhận đăng ký',
    SCHEDULED: 'Đã chốt lịch',
    ACTIVE: 'Đang chạy',
    ENDED: 'Đã kết thúc',
    CANCELLED: 'Đã hủy',
  };
  return labels[value];
}

function campaignLifecycleTone(value: CampaignAdminSummary['lifecycle']): string {
  if (value === 'ACTIVE') return 'admin-badge--success';
  if (value === 'CANCELLED' || value === 'ENDED') return 'admin-badge--neutral';
  if (value === 'DRAFT') return 'admin-badge--warning';
  return 'admin-badge--product';
}

function formatCampaignDate(value: string): string {
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CampaignTable({
  campaigns,
  onPublish,
  onCancel,
}: {
  campaigns: CampaignAdminSummary[];
  onPublish: (campaign: CampaignAdminSummary) => void;
  onCancel: (campaign: CampaignAdminSummary) => void;
}) {
  return (
    <div className="admin-table-scroll">
      <table className="admin-data-table admin-management-table admin-campaign-table">
        <thead>
          <tr>
            <th scope="col" className="management-table-id-cell">ID</th>
            <th scope="col">Chiến dịch</th>
            <th scope="col">Loại</th>
            <th scope="col">Lịch chương trình</th>
            <th scope="col">Trạng thái</th>
            <th scope="col">Tham gia</th>
            <th scope="col" className="admin-table-cell--actions">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => (
            <tr key={campaign.id}>
              <td className="management-table-id-cell">{campaign.id}</td>
              <td>
                <AdminEntityLink
                  href={`/admin/campaigns/${campaign.id}`}
                  name={campaign.title}
                />
              </td>
              <td>
                <span>{campaign.type.displayName}</span>
              </td>
              <td>
                <div className="admin-campaign-table__schedule">
                  <span>Đăng ký: {formatCampaignDate(campaign.enrollmentStartsAt)}</span>
                  <span>Chạy: {formatCampaignDate(campaign.startsAt)}</span>
                  <span>Kết thúc: {formatCampaignDate(campaign.endsAt)}</span>
                </div>
              </td>
              <td>
                <span
                  className={`admin-badge admin-table-status ${campaignLifecycleTone(campaign.lifecycle)}`}
                >
                  {campaignLifecycleLabel(campaign.lifecycle)}
                </span>
              </td>
              <td>
                <span>{campaign.sellerJoinedCount} seller</span>
                <small className="admin-table-subtext">{campaign.productCount} sản phẩm</small>
              </td>
              <td className="admin-table-cell--actions">
                <div className="admin-table-actions admin-campaign-table__actions">
                  {campaign.lifecycle === 'DRAFT' ? (
                    <button
                      className="admin-icon-btn admin-icon-btn--primary"
                      type="button"
                      aria-label={`Đăng chiến dịch ${campaign.title}`}
                      title="Đăng chiến dịch"
                      onClick={() => onPublish(campaign)}
                    >
                      <CheckIcon aria-hidden="true" />
                    </button>
                  ) : null}
                  {campaign.lifecycle !== 'CANCELLED' && campaign.lifecycle !== 'ENDED' ? (
                    <button
                      className="admin-icon-btn admin-icon-btn--danger"
                      type="button"
                      aria-label={`Hủy chiến dịch ${campaign.title}`}
                      title="Hủy chiến dịch"
                      onClick={() => onCancel(campaign)}
                    >
                      <XIcon aria-hidden="true" />
                    </button>
                  ) : null}
                  <Link
                    className="admin-icon-btn admin-icon-btn--secondary"
                    href={`/admin/campaigns/${campaign.id}`}
                    aria-label={`Xem chi tiết chiến dịch ${campaign.title}`}
                    title="Xem chi tiết"
                  >
                    <EyeIcon aria-hidden="true" />
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminCampaignsPage() {
  const { authenticatedFetch } = useAuthSession();
  const [types, setTypes] = useState<CampaignTypeSummary[]>([]);
  const [page, setPage] = useState<CampaignAdminPage | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [form, setForm] = useState<CreateCampaignRequest>(initial);
  const [preview, setPreview] = useState<CampaignBannerDetail | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [message, setMessage] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [previewSubmitting, setPreviewSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const createTriggerRef = useRef<HTMLButtonElement | null>(null);
  const createDialogRef = useRef<HTMLElement | null>(null);
  const createBusyRef = useRef(false);

  useEffect(() => {
    createBusyRef.current = createSubmitting || previewSubmitting;
  }, [createSubmitting, previewSubmitting]);

  const load = useCallback((targetPage = 1) => {
    const query = new URLSearchParams();
    query.set('page', String(targetPage));
    if (typeFilter) query.set('typeCode', typeFilter);
    if (stateFilter) query.set('state', stateFilter);
    setLoading(true);
    void Promise.all([
      fetchCampaignTypes(authenticatedFetch),
      fetchAdminCampaigns(authenticatedFetch, query.toString() ? `?${query}` : ''),
    ])
      .then(([typeRows, campaigns]) => {
        const lastPage = Math.max(1, campaigns.totalPages);
        if (targetPage > lastPage) {
          setCurrentPage(lastPage);
          return;
        }
        setTypes(typeRows);
        setPage(campaigns);
        setCurrentPage(campaigns.page);
        setMessage('');
      })
      .catch(() => setMessage('Không thể tải cấu hình chiến dịch.'))
      .finally(() => setLoading(false));
  }, [authenticatedFetch, stateFilter, typeFilter]);

  useEffect(() => {
    // The loader synchronizes server state after auth/filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(currentPage);
  }, [currentPage, load]);

  const setType = (typeCode: string) => {
    const minimumDiscountBasisPoints =
      typeCode === 'FLASH_SALE' ? 1000 : typeCode === 'CHEAPEST_DEALS' ? 300 : 500;
    setForm((current) => ({ ...current, typeCode, minimumDiscountBasisPoints }));
  };

  const setDate = (field: DateField, value: string) =>
    setForm((current) => ({ ...current, [field]: isoDateTime(value) }));

  async function create() {
    if (createSubmitting || previewSubmitting) return;
    setCreateSubmitting(true);
    setFormError('');
    try {
      const created = await createAdminCampaign(authenticatedFetch, form);
      setMessage(`Đã tạo bản nháp ${created.title}.`);
      setForm(initial());
      setPreview(null);
      setCreateOpen(false);
      setCurrentPage(1);
      load(1);
    } catch (error) {
      const nextError = error instanceof Error ? error.message : 'Không thể tạo chiến dịch.';
      setFormError(nextError);
      setMessage(nextError);
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function previewForm() {
    if (createSubmitting || previewSubmitting) return;
    setPreviewSubmitting(true);
    setFormError('');
    try {
      setPreview(await previewAdminCampaign(authenticatedFetch, form));
      setMessage('Preview đã được kiểm tra bởi policy server.');
    } catch (error) {
      const nextError = error instanceof Error ? error.message : 'Không thể preview chiến dịch.';
      setFormError(nextError);
      setMessage(nextError);
    } finally {
      setPreviewSubmitting(false);
    }
  }

  const openCreate = () => {
    setFormError('');
    setPreview(null);
    setCreateOpen(true);
  };

  const closeCreate = useCallback(() => {
    if (createBusyRef.current) return;
    setCreateOpen(false);
    setFormError('');
    setPreview(null);
  }, []);

  useEffect(() => {
    if (!createOpen) return;
    const dialog = createDialogRef.current;
    if (!dialog) return;
    const trigger = createTriggerRef.current;
    const previousFocus = document.activeElement;
    const getFocusable = () => Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    getFocusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (createBusyRef.current) return;
        event.preventDefault();
        closeCreate();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (trigger && document.contains(trigger)) {
        trigger.focus();
      } else if (previousFocus instanceof HTMLElement) {
        previousFocus.focus();
      }
    };
  }, [closeCreate, createOpen]);

  const publish = (campaign: CampaignAdminSummary) => {
    if (!window.confirm(`Publish chiến dịch “${campaign.title}”? Type và importance sẽ bị khóa.`))
      return;
    void publishAdminCampaign(authenticatedFetch, campaign.id, campaign.version)
      .then(() => {
        setMessage('Đã publish chiến dịch.');
        load(currentPage);
      })
      .catch(() => setMessage('Không thể publish chiến dịch.'));
  };

  const cancel = (campaign: CampaignAdminSummary) => {
    const reason = window.prompt('Lý do hủy chiến dịch:', 'Điều chỉnh lịch chương trình');
    if (!reason?.trim()) return;
    void cancelAdminCampaign(authenticatedFetch, campaign.id, campaign.version, reason)
      .then(() => {
        setMessage('Đã hủy chiến dịch và tắt các reservation.');
        load(currentPage);
      })
      .catch(() => setMessage('Không thể hủy chiến dịch.'));
  };

  return (
    <div className="admin-page admin-campaign-page">
      {message ? (
        <p className="admin-state-message" role="status">
          {message}
        </p>
      ) : null}
      <div className="admin-toolbar admin-campaign-filters">
        <label className="admin-field">
          Loại
          <select
            className="admin-control"
            value={typeFilter}
            onChange={(event) => { setTypeFilter(event.target.value); setCurrentPage(1); }}
          >
            <option value="">Tất cả</option>
            {types.map((type) => (
              <option key={type.code} value={type.code}>
                {type.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          Trạng thái
          <select
            className="admin-control"
            value={stateFilter}
            onChange={(event) => { setStateFilter(event.target.value); setCurrentPage(1); }}
          >
            <option value="">Tất cả</option>
            <option value="DRAFT">Bản nháp</option>
            <option value="ANNOUNCED">Đã thông báo</option>
            <option value="ENROLLMENT_OPEN">Đang nhận đăng ký</option>
            <option value="SCHEDULED">Đã chốt lịch</option>
            <option value="UPCOMING">Sắp diễn ra</option>
            <option value="ACTIVE">Đang chạy</option>
            <option value="ENDED">Đã kết thúc</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>
        </label>
        <button ref={createTriggerRef} className="admin-btn admin-btn-primary admin-campaign-toolbar__create" type="button" onClick={openCreate}>
          Tạo chiến dịch
        </button>
      </div>
      {createOpen ? (
        <div className="admin-dialog-backdrop" role="presentation">
          <section
            className="admin-dialog admin-campaign-create-dialog"
            ref={createDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-campaign-create-dialog-title"
            aria-describedby="admin-campaign-create-dialog-description"
          >
            <div className="admin-dialog__header">
              <div>
                <h2 id="admin-campaign-create-dialog-title">Tạo chiến dịch</h2>
                <p id="admin-campaign-create-dialog-description">
                  Nhập thông tin, kiểm tra preview và tạo bản nháp chiến dịch.
                </p>
              </div>
              <button
                type="button"
                className="admin-dialog__close"
                aria-label="Đóng form tạo chiến dịch"
                onClick={closeCreate}
                disabled={createSubmitting || previewSubmitting}
              >
                ×
              </button>
            </div>
            <form
              className="admin-dialog__form admin-campaign-editor"
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <label className="admin-field">
                Loại chiến dịch
                <select
                  className="admin-control"
                  value={form.typeCode}
                  onChange={(event) => setType(event.target.value)}
                  disabled={createSubmitting || previewSubmitting}
                >
                  {types.map((type) => (
                    <option key={type.code} value={type.code}>{type.displayName}</option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                Tiêu đề
                <input
                  className="admin-control"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  disabled={createSubmitting || previewSubmitting}
                />
              </label>
              <label className="admin-field">
                Mô tả
                <textarea
                  className="admin-control admin-control--textarea"
                  value={form.description ?? ''}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  disabled={createSubmitting || previewSubmitting}
                />
              </label>
              <label className="admin-field">
                Nội dung
                <textarea
                  className="admin-control admin-control--textarea"
                  value={form.content[0]?.kind === 'paragraph' ? form.content[0].text : ''}
                  onChange={(event) =>
                    setForm({ ...form, content: [{ kind: 'paragraph', text: event.target.value }] })
                  }
                  disabled={createSubmitting || previewSubmitting}
                />
              </label>
              <label className="admin-field">
                Giảm tối thiểu (%)
                <input
                  className="admin-control"
                  type="number"
                  min={1}
                  max={90}
                  value={form.minimumDiscountBasisPoints / 100}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      minimumDiscountBasisPoints: Math.round(Number(event.target.value) * 100),
                    })
                  }
                  disabled={createSubmitting || previewSubmitting}
                />
              </label>
              <div className="admin-campaign-dates">
                {(
                  [
                    ['announceAt', 'Thông báo'],
                    ['enrollmentStartsAt', 'Mở đăng ký'],
                    ['enrollmentEndsAt', 'Đóng đăng ký'],
                    ['startsAt', 'Bắt đầu'],
                    ['endsAt', 'Kết thúc'],
                  ] as const
                ).map(([field, label]) => (
                  <label className="admin-field" key={field}>
                    {label}
                    <input
                      className="admin-control"
                      type="datetime-local"
                      value={localDateTime(form[field])}
                      onChange={(event) => setDate(field, event.target.value)}
                      disabled={createSubmitting || previewSubmitting}
                    />
                  </label>
                ))}
              </div>
              {formError ? (
                <p className="admin-inline-error" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="admin-dialog__actions">
                <button
                  className="admin-btn admin-btn-secondary"
                  type="button"
                  onClick={closeCreate}
                  disabled={createSubmitting || previewSubmitting}
                >
                  Hủy
                </button>
                <button
                  className="admin-btn admin-btn-secondary"
                  type="button"
                  onClick={() => void previewForm()}
                  disabled={createSubmitting || previewSubmitting}
                >
                  {previewSubmitting ? 'Đang kiểm tra…' : 'Preview'}
                </button>
                <button
                  className="admin-btn admin-btn-primary"
                  type="submit"
                  disabled={createSubmitting || previewSubmitting}
                >
                  {createSubmitting ? 'Đang tạo…' : 'Tạo bản nháp'}
                </button>
              </div>
              {preview ? (
                <div className="admin-campaign-preview" aria-label="Campaign preview">
                  <strong>{preview.type.displayName}</strong>
                  <h3>{preview.title}</h3>
                  <p>{preview.description}</p>
                </div>
              ) : null}
            </form>
          </section>
        </div>
      ) : null}
      <section className="admin-table-card admin-campaign-list-section">
        <div className="admin-table-card__header">
          <div>
            <h2>Danh sách chiến dịch</h2>
            <p>Quản lý lịch, trạng thái và seller tham gia chương trình.</p>
          </div>
          <span className="admin-table-card__count">Tổng {page?.totalItems ?? 0} chiến dịch</span>
        </div>
        {loading ? (
          <div className="admin-state-card__message" role="status">
            Đang tải danh sách chiến dịch…
          </div>
        ) : page?.items.length ? (
          <CampaignTable campaigns={page.items} onPublish={publish} onCancel={cancel} />
        ) : (
          <div className="admin-state-card__message" role="status">
            Chưa có chiến dịch phù hợp bộ lọc.
          </div>
        )}
        <AdminPagination
          itemLabel="chiến dịch"
          page={currentPage}
          totalItems={page?.totalItems ?? 0}
          totalPages={page?.totalPages ?? 0}
          disabled={loading}
          onPageChange={setCurrentPage}
        />
      </section>
    </div>
  );
}

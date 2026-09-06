'use client';

import type {
  CampaignAdminPage,
  CampaignAdminSummary,
  CampaignBannerDetail,
  CampaignTypeSummary,
  CreateCampaignRequest,
} from '@shopee-clone/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
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

function localDateTime(value: string): string {
  return value.slice(0, 16);
}

function isoDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function CampaignCard({
  campaign,
  onPublish,
  onCancel,
}: {
  campaign: CampaignAdminSummary;
  onPublish: (campaign: CampaignAdminSummary) => void;
  onCancel: (campaign: CampaignAdminSummary) => void;
}) {
  return (
    <article className="admin-campaign-card">
      <div>
        <span>
          {campaign.type.displayName} · {campaign.type.importanceClass}
        </span>
        <AdminEntityLink href={`/admin/campaigns/${campaign.id}`} name={campaign.title} />
        <small>
          {campaign.lifecycle} · v{campaign.version} · {campaign.productCount} sản phẩm ·{' '}
          {campaign.sellerJoinedCount} seller tham gia
        </small>
      </div>
      <div>
        {campaign.lifecycle === 'DRAFT' ? (
          <button
            className="admin-btn admin-btn-primary"
            type="button"
            onClick={() => onPublish(campaign)}
          >
            Publish
          </button>
        ) : null}
        {campaign.lifecycle !== 'CANCELLED' && campaign.lifecycle !== 'ENDED' ? (
          <button
            className="admin-btn admin-btn-danger-outline"
            type="button"
            onClick={() => onCancel(campaign)}
          >
            Hủy
          </button>
        ) : null}
        <Link className="admin-btn admin-btn-secondary" href={`/admin/campaigns/${campaign.id}`}>
          Xem chi tiết
        </Link>
      </div>
    </article>
  );
}

export function AdminCampaignsPage() {
  const { authenticatedFetch } = useAuthSession();
  const [types, setTypes] = useState<CampaignTypeSummary[]>([]);
  const [page, setPage] = useState<CampaignAdminPage | null>(null);
  const [form, setForm] = useState<CreateCampaignRequest>(initial);
  const [preview, setPreview] = useState<CampaignBannerDetail | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const query = new URLSearchParams();
    if (typeFilter) query.set('typeCode', typeFilter);
    if (stateFilter) query.set('state', stateFilter);
    setLoading(true);
    void Promise.all([
      fetchCampaignTypes(authenticatedFetch),
      fetchAdminCampaigns(authenticatedFetch, query.toString() ? `?${query}` : ''),
    ])
      .then(([typeRows, campaigns]) => {
        setTypes(typeRows);
        setPage(campaigns);
        setMessage('');
      })
      .catch(() => setMessage('Không thể tải cấu hình chiến dịch.'))
      .finally(() => setLoading(false));
  }, [authenticatedFetch, stateFilter, typeFilter]);

  useEffect(() => {
    // The loader synchronizes server state after auth/filter changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const setType = (typeCode: string) => {
    const minimumDiscountBasisPoints =
      typeCode === 'FLASH_SALE' ? 1000 : typeCode === 'CHEAPEST_DEALS' ? 300 : 500;
    setForm((current) => ({ ...current, typeCode, minimumDiscountBasisPoints }));
  };

  const setDate = (field: DateField, value: string) =>
    setForm((current) => ({ ...current, [field]: isoDateTime(value) }));

  async function create() {
    try {
      const created = await createAdminCampaign(authenticatedFetch, form);
      setMessage(`Đã tạo bản nháp ${created.title}.`);
      setForm(initial());
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể tạo chiến dịch.');
    }
  }

  async function previewForm() {
    try {
      setPreview(await previewAdminCampaign(authenticatedFetch, form));
      setMessage('Preview đã được kiểm tra bởi policy server.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể preview chiến dịch.');
    }
  }

  const publish = (campaign: CampaignAdminSummary) => {
    if (!window.confirm(`Publish chiến dịch “${campaign.title}”? Type và importance sẽ bị khóa.`))
      return;
    void publishAdminCampaign(authenticatedFetch, campaign.id, campaign.version)
      .then(() => {
        setMessage('Đã publish chiến dịch.');
        load();
      })
      .catch(() => setMessage('Không thể publish chiến dịch.'));
  };

  const cancel = (campaign: CampaignAdminSummary) => {
    const reason = window.prompt('Lý do hủy chiến dịch:', 'Điều chỉnh lịch chương trình');
    if (!reason?.trim()) return;
    void cancelAdminCampaign(authenticatedFetch, campaign.id, campaign.version, reason)
      .then(() => {
        setMessage('Đã hủy chiến dịch và tắt các reservation.');
        load();
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
            onChange={(event) => setTypeFilter(event.target.value)}
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
            onChange={(event) => setStateFilter(event.target.value)}
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
      </div>
      <section className="admin-surface-card admin-campaign-editor">
        <h2>Tạo chiến dịch</h2>
        <label className="admin-field">
          Loại chiến dịch
          <select
            className="admin-control"
            value={form.typeCode}
            onChange={(event) => setType(event.target.value)}
          >
            {types.map((type) => (
              <option key={type.code} value={type.code}>
                {type.displayName} · {type.importanceClass}
              </option>
            ))}
          </select>
        </label>
        <p aria-live="polite">
          Importance:{' '}
          <strong>
            {types.find((type) => type.code === form.typeCode)?.importanceClass ?? 'NORMAL'}
          </strong>{' '}
          · ranking do server quyết định
        </p>
        <label className="admin-field">
          Tiêu đề
          <input
            className="admin-control"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </label>
        <label className="admin-field">
          Mô tả
          <textarea
            className="admin-control admin-control--textarea"
            value={form.description ?? ''}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
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
              />
            </label>
          ))}
        </div>
        <div>
          <button
            className="admin-btn admin-btn-secondary"
            type="button"
            onClick={() => void previewForm()}
          >
            Preview
          </button>{' '}
          <button
            className="admin-btn admin-btn-primary"
            type="button"
            onClick={() => void create()}
          >
            Tạo bản nháp
          </button>
        </div>
        {preview ? (
          <div className="admin-campaign-preview" aria-label="Campaign preview">
            <strong>{preview.type.displayName}</strong>
            <h3>{preview.title}</h3>
            <p>{preview.description}</p>
          </div>
        ) : null}
      </section>
      <section className="admin-campaign-list-section">
        <h2>Danh sách</h2>
        {loading ? (
          <p aria-live="polite">Đang tải...</p>
        ) : page?.items.length ? (
          <div className="admin-campaign-list">
            {page.items.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onPublish={publish}
                onCancel={cancel}
              />
            ))}
          </div>
        ) : (
          <p>Chưa có chiến dịch.</p>
        )}
      </section>
    </div>
  );
}

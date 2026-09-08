import type {
  CampaignAdminPage,
  CampaignAdminParticipantPage,
  CampaignAdminSummary,
  CampaignBannerDetail,
  CampaignParticipationResponse,
  CampaignTypeSummary,
  CreateCampaignRequest,
  SellerCampaignDetail,
  SellerCampaignPage,
  SellerCampaignParticipationRequest,
} from '@shopee-clone/contracts';
import { RoleApiError, type AuthenticatedFetcher } from './role-api';

const api = (path: string) =>
  new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001');

async function request<T>(
  fetcher: typeof fetch | AuthenticatedFetcher,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetcher(api(path), {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok)
    throw new RoleApiError(
      'status',
      response.status,
      body && typeof body === 'object'
        ? (body as { detail?: string; invalidParameters?: string[] })
        : undefined,
    );
  return body as T;
}

export const fetchPublicCampaign = (campaignId: string) =>
  request<CampaignBannerDetail>(fetch, `/api/v1/campaigns/${encodeURIComponent(campaignId)}`);
export const fetchCampaignTypes = (fetcher: AuthenticatedFetcher) =>
  request<CampaignTypeSummary[]>(fetcher, '/api/v1/admin/campaign-types');
export const fetchAdminCampaigns = (fetcher: AuthenticatedFetcher, query = '') =>
  request<CampaignAdminPage>(fetcher, `/api/v1/admin/campaigns${query}`);
export async function fetchAllAdminCampaigns(
  fetcher: AuthenticatedFetcher,
  query = '',
): Promise<CampaignAdminSummary[]> {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const items: CampaignAdminSummary[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    params.set('page', String(page));
    const response = await fetchAdminCampaigns(fetcher, `?${params}`);
    items.push(...response.items);
    totalPages = response.totalPages;
    page += 1;
  } while (page <= totalPages);
  return items;
}
export const fetchAdminCampaign = (fetcher: AuthenticatedFetcher, id: string) =>
  request<CampaignAdminSummary>(fetcher, `/api/v1/admin/campaigns/${encodeURIComponent(id)}`);
export const fetchAdminCampaignParticipantDetails = (
  fetcher: AuthenticatedFetcher,
  id: string,
  page = 1,
) =>
  request<CampaignAdminParticipantPage>(
    fetcher,
    `/api/v1/admin/campaigns/${encodeURIComponent(id)}/participant-details?page=${page}`,
  );
export const createAdminCampaign = (fetcher: AuthenticatedFetcher, input: CreateCampaignRequest) =>
  request<CampaignAdminSummary>(fetcher, '/api/v1/admin/campaigns', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(input),
  });
export const previewAdminCampaign = (fetcher: AuthenticatedFetcher, input: CreateCampaignRequest) =>
  request<CampaignBannerDetail>(fetcher, '/api/v1/admin/campaigns/preview', {
    method: 'POST',
    body: JSON.stringify(input),
  });
export const publishAdminCampaign = (fetcher: AuthenticatedFetcher, id: string, version: number) =>
  request<CampaignAdminSummary>(
    fetcher,
    `/api/v1/admin/campaigns/${encodeURIComponent(id)}/publish`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ version }),
    },
  );
export const cancelAdminCampaign = (
  fetcher: AuthenticatedFetcher,
  id: string,
  version: number,
  reason: string,
) =>
  request<CampaignAdminSummary>(
    fetcher,
    `/api/v1/admin/campaigns/${encodeURIComponent(id)}/cancel`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ version, reason }),
    },
  );
export const fetchSellerCampaigns = (fetcher: AuthenticatedFetcher, query = '') =>
  request<SellerCampaignPage>(fetcher, `/api/v1/seller/campaigns${query}`);
export const fetchSellerCampaign = (fetcher: AuthenticatedFetcher, id: string) =>
  request<SellerCampaignDetail>(fetcher, `/api/v1/seller/campaigns/${encodeURIComponent(id)}`);
export const decideSellerCampaign = (
  fetcher: AuthenticatedFetcher,
  id: string,
  input: SellerCampaignParticipationRequest,
  idempotencyKey = crypto.randomUUID(),
) =>
  request<CampaignParticipationResponse>(
    fetcher,
    `/api/v1/seller/campaigns/${encodeURIComponent(id)}/participation`,
    { method: 'PUT', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input) },
  );
export const withdrawSellerCampaign = (
  fetcher: AuthenticatedFetcher,
  id: string,
  version: number,
  idempotencyKey = crypto.randomUUID(),
) =>
  request<CampaignParticipationResponse>(
    fetcher,
    `/api/v1/seller/campaigns/${encodeURIComponent(id)}/participation/withdraw`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ version }),
    },
  );

import { isSellerAnalyticsProductPage, isSellerDashboardResponse, type SellerAnalyticsProductPage, type SellerDashboardResponse } from '@shopee-clone/contracts';
import { RoleApiError, type AuthenticatedFetcher } from './role-api';

const endpoint = (path: string) => new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001');

async function readBody(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return undefined; }
}

function problemOf(value: unknown) {
  const problem = value && typeof value === 'object' ? value as { detail?: unknown; invalidParameters?: unknown } : {};
  return { detail: typeof problem.detail === 'string' ? problem.detail : undefined, invalidParameters: Array.isArray(problem.invalidParameters) ? problem.invalidParameters.filter((item): item is string => typeof item === 'string') : undefined };
}

export async function fetchSellerDashboard(fetcher: AuthenticatedFetcher, input: { from: string; to: string; granularity?: 'DAY' | 'WEEK' | 'MONTH' }): Promise<SellerDashboardResponse> {
  const url = endpoint('/api/v1/seller/dashboard');
  url.searchParams.set('from', input.from); url.searchParams.set('to', input.to); if (input.granularity) url.searchParams.set('granularity', input.granularity);
  const response = await fetcher(url, { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json, application/problem+json' } });
  const body = await readBody(response);
  if (!response.ok) throw new RoleApiError('status', response.status, problemOf(body));
  if (!isSellerDashboardResponse(body)) throw new RoleApiError('contract', response.status);
  return body;
}

export async function fetchSellerProductAnalytics(fetcher: AuthenticatedFetcher, input: { from: string; to: string; limit?: number; cursor?: string }): Promise<SellerAnalyticsProductPage> {
  const url = endpoint('/api/v1/seller/analytics/products');
  Object.entries(input).forEach(([key, value]) => { if (value !== undefined) url.searchParams.set(key, String(value)); });
  const response = await fetcher(url, { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json, application/problem+json' } });
  const body = await readBody(response);
  if (!response.ok) throw new RoleApiError('status', response.status, problemOf(body));
  if (!isSellerAnalyticsProductPage(body)) throw new RoleApiError('contract', response.status);
  return body;
}

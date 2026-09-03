import type {
  CreateReportRequest,
  CreateReportResponse,
  ReporterReportDetail,
  ReporterReportListQuery,
  ReporterReportListResponse,
} from '@shopee-clone/contracts';

const fallbackBaseUrl = 'http://localhost:3001';

export type AuthenticatedFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class ReportingApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem?: {
      title?: string;
      detail?: string;
      code?: string;
      retryAfterSeconds?: number;
      currentCase?: unknown;
    },
  ) {
    super(`Reporting API error (${status}): ${problem?.detail || problem?.title || 'Unknown'}`);
    this.name = 'ReportingApiError';
  }
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

async function requestJson<T>(
  url: URL,
  fetcher: AuthenticatedFetcher,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let problem: Record<string, unknown> | undefined;
    try {
      problem = (await response.json()) as Record<string, unknown>;
    } catch {
      // Body not JSON
    }
    throw new ReportingApiError(response.status, problem as ReportingApiError['problem']);
  }

  return (await response.json()) as T;
}

export async function submitReport(
  fetcher: AuthenticatedFetcher,
  input: CreateReportRequest,
  idempotencyKey: string,
): Promise<CreateReportResponse> {
  const url = endpoint('/api/v1/reports');
  return requestJson<CreateReportResponse>(url, fetcher, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

export async function listMyReports(
  fetcher: AuthenticatedFetcher,
  query?: ReporterReportListQuery,
): Promise<ReporterReportListResponse> {
  const url = endpoint('/api/v1/account/reports');
  if (query?.limit) url.searchParams.set('limit', String(query.limit));
  if (query?.cursor) url.searchParams.set('cursor', query.cursor);
  if (query?.status) url.searchParams.set('status', query.status);
  return requestJson<ReporterReportListResponse>(url, fetcher, { method: 'GET' });
}

export async function getMyReportDetail(
  fetcher: AuthenticatedFetcher,
  reportId: string,
): Promise<ReporterReportDetail> {
  const url = endpoint(`/api/v1/account/reports/${reportId}`);
  return requestJson<ReporterReportDetail>(url, fetcher, { method: 'GET' });
}

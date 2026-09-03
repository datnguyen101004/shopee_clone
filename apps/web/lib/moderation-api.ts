import type {
  AddModerationCaseNoteRequest,
  AdminReviewActionRequest,
  AdminReviewActionResult,
  AdminReviewDetail,
  AdminReportedReviewListResponse,
  AssignModerationCaseRequest,
  CreateModerationDecisionRequest,
  ModerationCaseDetail,
  ModerationCaseListQuery,
  ModerationCaseListResponse,
  ModerationDecisionResult,
} from '@shopee-clone/contracts';

const fallbackBaseUrl = 'http://localhost:3001';

export type AuthenticatedFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export class ModerationApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem?: {
      title?: string;
      detail?: string;
      code?: string;
      currentVersion?: number;
    },
  ) {
    super(`Moderation API error (${status}): ${problem?.detail || problem?.title || 'Unknown'}`);
    this.name = 'ModerationApiError';
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
      // Non JSON
    }
    throw new ModerationApiError(response.status, problem as ModerationApiError['problem']);
  }

  return (await response.json()) as T;
}

export async function listModerationCases(
  fetcher: AuthenticatedFetcher,
  query?: ModerationCaseListQuery,
): Promise<ModerationCaseListResponse> {
  const url = endpoint('/api/v1/admin/moderation/cases');
  if (query?.limit) url.searchParams.set('limit', String(query.limit));
  if (query?.cursor) url.searchParams.set('cursor', query.cursor);
  if (query?.status) url.searchParams.set('status', query.status);
  if (query?.targetType) url.searchParams.set('targetType', query.targetType);
  if (query?.targetId) url.searchParams.set('targetId', query.targetId);
  if (query?.searchId) url.searchParams.set('searchId', query.searchId);
  if (query?.reasonCode) url.searchParams.set('reasonCode', query.reasonCode);
  if (query?.assignedAdminId) url.searchParams.set('assignedAdminId', query.assignedAdminId);
  if (query?.assignedState) url.searchParams.set('assignedState', query.assignedState);
  return requestJson<ModerationCaseListResponse>(url, fetcher, { method: 'GET' });
}

export async function getModerationCaseDetail(
  fetcher: AuthenticatedFetcher,
  caseId: string,
): Promise<ModerationCaseDetail> {
  const url = endpoint(`/api/v1/admin/moderation/cases/${caseId}`);
  return requestJson<ModerationCaseDetail>(url, fetcher, { method: 'GET' });
}

export async function assignModerationCase(
  fetcher: AuthenticatedFetcher,
  caseId: string,
  input: AssignModerationCaseRequest,
  idempotencyKey: string,
): Promise<{ caseDetail: ModerationCaseDetail }> {
  const url = endpoint(`/api/v1/admin/moderation/cases/${caseId}/assign`);
  return requestJson<{ caseDetail: ModerationCaseDetail }>(url, fetcher, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

export async function addModerationCaseNote(
  fetcher: AuthenticatedFetcher,
  caseId: string,
  input: AddModerationCaseNoteRequest,
  idempotencyKey: string,
): Promise<{ caseDetail: ModerationCaseDetail }> {
  const url = endpoint(`/api/v1/admin/moderation/cases/${caseId}/notes`);
  return requestJson<{ caseDetail: ModerationCaseDetail }>(url, fetcher, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

export async function makeModerationDecision(
  fetcher: AuthenticatedFetcher,
  caseId: string,
  input: CreateModerationDecisionRequest,
  idempotencyKey: string,
): Promise<ModerationDecisionResult> {
  const url = endpoint(`/api/v1/admin/moderation/cases/${caseId}/decisions`);
  return requestJson<ModerationDecisionResult>(url, fetcher, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

export async function getAdminReviewDetail(
  fetcher: AuthenticatedFetcher,
  reviewId: string,
): Promise<AdminReviewDetail> {
  const url = endpoint(`/api/v1/admin/reviews/${reviewId}`);
  return requestJson<AdminReviewDetail>(url, fetcher, { method: 'GET' });
}

export async function listAdminReportedReviews(
  fetcher: AuthenticatedFetcher,
): Promise<AdminReportedReviewListResponse> {
  const url = endpoint('/api/v1/admin/reviews/reported');
  return requestJson<AdminReportedReviewListResponse>(url, fetcher, { method: 'GET' });
}

export async function executeAdminReviewAction(
  fetcher: AuthenticatedFetcher,
  reviewId: string,
  input: AdminReviewActionRequest,
  idempotencyKey: string,
): Promise<AdminReviewActionResult> {
  const url = endpoint(`/api/v1/admin/reviews/${reviewId}/actions`);
  return requestJson<AdminReviewActionResult>(url, fetcher, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}

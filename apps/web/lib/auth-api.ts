import {
  isAuthProblemDetails,
  isAuthUser,
  parseAuthSessionResponse,
  type AuthProblemDetails,
  type AuthSessionResponse,
  type AuthUser,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
} from '@shopee-clone/contracts';

const fallbackBaseUrl = 'http://127.0.0.1:3001';

export class AuthApiError extends Error {
  constructor(
    public readonly kind: 'transport' | 'status' | 'contract',
    public readonly status = 0,
    public readonly problem: AuthProblemDetails | null = null,
  ) {
    super(`Authentication API ${kind} error`);
    this.name = 'AuthApiError';
  }
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

async function request(
  path: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(endpoint(path), {
      ...init,
      cache: 'no-store',
      credentials: 'include',
      headers: {
        Accept: 'application/json, application/problem+json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new AuthApiError('transport');
  }
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // A malformed dependency failure is intentionally reduced to a status error.
    }
    throw new AuthApiError('status', response.status, isAuthProblemDetails(body) ? body : null);
  }
  return response;
}

async function sessionRequest(
  path: string,
  body: RegisterRequest | LoginRequest | undefined,
  fetcher?: typeof fetch,
): Promise<AuthSessionResponse> {
  const response = await request(
    path,
    { method: 'POST', body: body ? JSON.stringify(body) : undefined },
    fetcher,
  );
  const session = parseAuthSessionResponse(await response.json());
  if (!session) throw new AuthApiError('contract', response.status);
  return session;
}

export function registerAccount(input: RegisterRequest, fetcher?: typeof fetch) {
  return sessionRequest('/api/v1/auth/register', input, fetcher);
}

export function loginAccount(input: LoginRequest, fetcher?: typeof fetch) {
  return sessionRequest('/api/v1/auth/login', input, fetcher);
}

export function refreshAccountSession(fetcher?: typeof fetch) {
  return sessionRequest('/api/v1/auth/refresh', undefined, fetcher);
}

export async function logoutAccount(fetcher?: typeof fetch): Promise<void> {
  await request('/api/v1/auth/logout', { method: 'POST' }, fetcher);
}

export async function fetchCurrentUser(
  accessToken: string,
  fetcher?: typeof fetch,
): Promise<AuthUser> {
  const response = await request(
    '/api/v1/auth/me',
    { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } },
    fetcher,
  );
  const body: unknown = await response.json();
  if (!isAuthUser(body)) throw new AuthApiError('contract', response.status);
  return body;
}

export async function requestPasswordReset(
  input: ForgotPasswordRequest,
  fetcher?: typeof fetch,
): Promise<void> {
  await request(
    '/api/v1/auth/forgot-password',
    { method: 'POST', body: JSON.stringify(input) },
    fetcher,
  );
}

export async function resetAccountPassword(
  input: ResetPasswordRequest,
  fetcher?: typeof fetch,
): Promise<void> {
  await request(
    '/api/v1/auth/reset-password',
    { method: 'POST', body: JSON.stringify(input) },
    fetcher,
  );
}

const apiFetchLoggerInstalled = '__shopeeCloneApiFetchLoggerInstalled' as const;

type ApiLoggerGlobal = typeof globalThis & {
  [apiFetchLoggerInstalled]?: boolean;
};

type ApiRequestDetails = {
  method: string;
  url: string;
};

const sensitiveQueryParameter = /^(?:access_?)?token$|secret|password|authorization|code/i;

function requestUrl(input: RequestInfo | URL): URL | null {
  const rawUrl =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  try {
    return typeof window === 'undefined'
      ? new URL(rawUrl)
      : new URL(rawUrl, window.location.href);
  } catch {
    return null;
  }
}

function getApiRequestDetails(input: RequestInfo | URL, init?: RequestInit): ApiRequestDetails | null {
  const url = requestUrl(input);
  if (!url || !url.pathname.startsWith('/api/')) return null;

  for (const key of url.searchParams.keys()) {
    if (sensitiveQueryParameter.test(key)) url.searchParams.set(key, '[redacted]');
  }

  const requestMethod =
    init?.method ??
    (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET');

  return { method: requestMethod.toUpperCase(), url: url.toString() };
}

function durationMs(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}

/**
 * Logs API requests without exposing their bodies or request headers. It is installed in both
 * browser and server instrumentation so browser-initiated and Server Component requests are visible.
 */
export function installApiRequestLogger() {
  const target = globalThis as ApiLoggerGlobal;
  if (target[apiFetchLoggerInstalled]) return;

  const originalFetch: typeof fetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const request = getApiRequestDetails(input, init);
    if (!request) return originalFetch(input, init);

    const startedAt = performance.now();
    console.info('[api-debug] request', JSON.stringify(request));

    try {
      const response = await originalFetch(input, init);
      const log = response.ok ? console.info : console.error;
      log(
        '[api-debug] response',
        JSON.stringify({
          ...request,
          status: response.status,
          statusText: response.statusText,
          durationMs: durationMs(startedAt),
        }),
      );
      return response;
    } catch (error) {
      console.error(
        '[api-debug] transport error',
        JSON.stringify({
          ...request,
          durationMs: durationMs(startedAt),
          error: error instanceof Error ? { name: error.name, message: error.message } : error,
        }),
      );
      throw error;
    }
  };

  target[apiFetchLoggerInstalled] = true;
}

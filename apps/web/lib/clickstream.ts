'use client';

import type { ClickstreamCollectionRequest } from '@shopee-clone/contracts';

const SESSION_STORAGE_KEY = 'shopee-clone-clickstream-session';
const fallbackApi = 'http://localhost:3001';
export type FirstPartyFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return '00000000-0000-4000-8000-000000000000'.replace(/[08]/g, (value) =>
    (Number(value) ^ ((Math.random() * 16) >> (Number(value) / 4))).toString(16),
  );
}
export function getClickstreamSessionId(): string {
  if (typeof window === 'undefined') return uuid();
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const next = uuid();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return uuid();
  }
}

export function createClickstreamCorrelationId(scope?: string): string {
  void scope;
  return uuid();
}

export function submitClickstreamEvent(
  event: Omit<
    ClickstreamCollectionRequest,
    'eventId' | 'sessionId' | 'schemaVersion' | 'occurredAt'
  >,
  timeoutMs = 1_500,
  fetcher?: FirstPartyFetch,
): void {
  if (typeof window === 'undefined') return;
  const request = fetcher ?? (typeof window.fetch === 'function' ? window.fetch.bind(window) : null);
  if (!request) return;
  const body: ClickstreamCollectionRequest = {
    ...event,
    eventId: uuid(),
    sessionId: getClickstreamSessionId(),
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
  } as ClickstreamCollectionRequest;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  void request(
    new URL('/api/v1/clickstream/events', process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackApi),
    {
      method: 'POST',
      body: JSON.stringify(body),
      credentials: 'include',
      keepalive: true,
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    },
  )
    .catch(() => undefined)
    .finally(() => window.clearTimeout(timer));
}

export function createClickstreamImpressionDeduper(): {
  seen(key: string): boolean;
  clear(): void;
} {
  const keys = new Set<string>();
  return {
    seen(key: string) {
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    },
    clear() {
      keys.clear();
    },
  };
}

export function clickstreamImpressionKey(input: {
  requestId: string;
  placement: string;
  productId: string;
  position: number;
}): string {
  return `${input.requestId}:${input.placement}:${input.productId}:${input.position}`;
}

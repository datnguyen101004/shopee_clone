import { MOMO_SANDBOX_ORIGIN } from './momo.config';
import type { MomoHttpTransport } from './momo-payment-provider';
import {
  ProviderMalformedResponseError,
  ProviderRejectedError,
  ProviderTemporaryError,
  ProviderTimeoutError,
} from './payment-result';

const MOMO_PATHS = new Set([
  '/v2/gateway/api/create',
  '/v2/gateway/api/query',
  '/v2/gateway/api/refund',
  '/v2/gateway/api/refund/query',
]);

export type MomoFetch = typeof fetch;

export class MomoSandboxHttpTransport implements MomoHttpTransport {
  constructor(private readonly fetchImplementation: MomoFetch = fetch) {}

  async post(
    path: string,
    body: Readonly<Record<string, unknown>>,
    timeoutMs: number,
  ): Promise<unknown> {
    if (!MOMO_PATHS.has(path)) throw new ProviderRejectedError('MoMo path is not allowlisted');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 120_000) {
      throw new ProviderRejectedError('MoMo HTTP timeout is outside the safe range');
    }

    let response: Response;
    try {
      response = await this.fetchImplementation(`${MOMO_SANDBOX_ORIGIN}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new ProviderTimeoutError('MoMo sandbox request timed out');
      }
      throw new ProviderTemporaryError('MoMo sandbox network request failed');
    }

    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) {
        throw new ProviderTemporaryError('MoMo sandbox is temporarily unavailable');
      }
      throw new ProviderRejectedError('MoMo sandbox rejected the HTTP request');
    }

    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ProviderMalformedResponseError('MoMo sandbox returned invalid JSON');
    }
  }
}

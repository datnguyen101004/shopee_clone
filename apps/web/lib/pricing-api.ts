import {
  isPricingQuoteRequest,
  parsePricingProblemDetails,
  parsePricingQuoteResponse,
  type PricingProblemDetails,
  type PricingQuoteRequest,
  type PricingQuoteResponse,
} from '@shopee-clone/contracts';

import type { AuthenticatedFetch } from './account-api';

const fallbackBaseUrl = 'http://localhost:3001';

export class PricingApiError extends Error {
  constructor(
    readonly kind: 'input' | 'transport' | 'status' | 'contract' | 'aborted',
    readonly status = 0,
    readonly problem: PricingProblemDetails | null = null,
  ) {
    super(`Pricing API ${kind} error`);
  }
}

function endpoint(path: string): URL {
  return new URL(path, process.env.NEXT_PUBLIC_API_BASE_URL ?? fallbackBaseUrl);
}

export async function getPricingQuote(
  input: PricingQuoteRequest,
  cartVersion: number,
  authenticatedFetch: AuthenticatedFetch,
  signal?: AbortSignal,
): Promise<PricingQuoteResponse> {
  if (!isPricingQuoteRequest(input) || !Number.isSafeInteger(cartVersion) || cartVersion < 0) {
    throw new PricingApiError('input');
  }
  let response: Response;
  try {
    response = await authenticatedFetch(endpoint('/api/v1/cart/quote'), {
      method: 'POST',
      headers: {
        Accept: 'application/json, application/problem+json',
        'Content-Type': 'application/json',
        'If-Match': `"cart-${cartVersion}"`,
      },
      body: JSON.stringify(input),
      cache: 'no-store',
      signal,
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new PricingApiError('aborted');
    }
    throw new PricingApiError('transport');
  }
  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // The useful HTTP status is retained when an upstream problem body is malformed.
    }
    throw new PricingApiError('status', response.status, parsePricingProblemDetails(body));
  }
  const parsed = parsePricingQuoteResponse(await response.json());
  if (!parsed || parsed.cartVersion !== cartVersion) {
    throw new PricingApiError('contract', response.status);
  }
  return parsed;
}

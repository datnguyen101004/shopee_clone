import { describe, expect, it } from 'vitest';

import { isHealthResponse } from '../src';

describe('isHealthResponse', () => {
  it('accepts the shared API health payload', () => {
    expect(
      isHealthResponse({
        status: 'ok',
        service: 'api',
        timestamp: '2026-08-12T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(isHealthResponse({ status: 'ok', service: 'web', timestamp: 'today' })).toBe(false);
  });
});

import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { loadAuthConfig } from '../auth/auth.config';
import { BrowserMutationSecurityError } from './browser-mutation.error';
import { BrowserMutationGuard } from './browser-mutation.guard';

function context(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => context,
    getClass: () => BrowserMutationGuard,
  } as unknown as ExecutionContext;
}

describe('BrowserMutationGuard', () => {
  const config = loadAuthConfig({ NODE_ENV: 'test' });
  const guard = new BrowserMutationGuard(config, new Reflector());

  it('keeps ordinary reads available without Origin', () => {
    expect(
      guard.canActivate(context({ method: 'GET', headers: {}, query: {} } as Partial<Request>)),
    ).toBe(true);
  });

  it('fails closed for missing, malformed, null and untrusted mutation origins', () => {
    for (const origin of [
      undefined,
      'null',
      'https://attacker.test',
      'http://localhost:3000/path',
    ]) {
      expect(() =>
        guard.canActivate(
          context({
            method: 'POST',
            headers: origin === undefined ? {} : { origin },
            query: {},
          } as Partial<Request>),
        ),
      ).toThrow(BrowserMutationSecurityError);
    }
  });

  it('accepts exact trusted JSON and rejects form payloads and method override', () => {
    expect(
      guard.canActivate(
        context({
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
            'content-length': '12',
            'content-type': 'application/json; charset=utf-8',
          },
          query: {},
        } as Partial<Request>),
      ),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
            'content-length': '12',
            'content-type': 'application/x-www-form-urlencoded',
          },
          query: {},
        } as Partial<Request>),
      ),
    ).toThrow('mutation-media-type-unsupported');
    expect(() =>
      guard.canActivate(
        context({
          method: 'POST',
          headers: { origin: 'http://localhost:3000', 'x-http-method-override': 'DELETE' },
          query: {},
        } as Partial<Request>),
      ),
    ).toThrow('mutation-method-override-denied');
  });
});

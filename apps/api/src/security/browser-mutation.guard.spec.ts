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

  it('allows multipart overhead for a permitted review image, while retaining the request cap', () => {
    const upload = (contentLength: number) => context({
      method: 'POST',
      originalUrl: '/api/v1/account/review-media',
      headers: {
        origin: 'http://localhost:3000',
        'content-length': String(contentLength),
        'content-type': 'multipart/form-data; boundary=review-upload',
      },
      query: {},
    } as Partial<Request>);
    expect(guard.canActivate(upload(5 * 1024 * 1024 + 2048))).toBe(true);
    expect(() => guard.canActivate(upload(5 * 1024 * 1024 + 64 * 1024 + 1))).toThrow('mutation-body-too-large');
  });

  it('allows multipart overhead only for the seller product media route', () => {
    const request = (path: string, length: number) => context({
      method: 'POST', originalUrl: path, headers: { origin: 'http://localhost:3000', 'content-length': String(length), 'content-type': 'multipart/form-data; boundary=product-upload' }, query: {},
    } as Partial<Request>);
    expect(guard.canActivate(request('/api/v1/seller/products/media', 5 * 1024 * 1024 + 2048))).toBe(true);
    expect(() => guard.canActivate(request('/api/v1/seller/products', 2048))).toThrow('mutation-media-type-unsupported');
    expect(() => guard.canActivate(request('/api/v1/seller/products/media', 5 * 1024 * 1024 + 64 * 1024 + 1))).toThrow('mutation-body-too-large');
  });
});

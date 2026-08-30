import { MOMO_SANDBOX_ORIGIN } from './momo.config';
import { MomoSandboxHttpTransport, type MomoFetch } from './momo-http.transport';
import {
  ProviderMalformedResponseError,
  ProviderRejectedError,
  ProviderTemporaryError,
  ProviderTimeoutError,
} from './payment-result';

function mockedFetch(implementation: (...arguments_: Parameters<MomoFetch>) => Promise<Response>) {
  return jest.fn(implementation) as unknown as jest.MockedFunction<MomoFetch>;
}

describe('MomoSandboxHttpTransport', () => {
  it('posts JSON only to the fixed sandbox origin with redirects disabled', async () => {
    const fetchImplementation = mockedFetch(
      async () =>
        new Response(JSON.stringify({ resultCode: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const transport = new MomoSandboxHttpTransport(fetchImplementation);

    await expect(
      transport.post('/v2/gateway/api/create', { orderId: 'order-1' }, 30_000),
    ).resolves.toEqual({
      resultCode: 0,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      `${MOMO_SANDBOX_ORIGIN}/v2/gateway/api/create`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ orderId: 'order-1' }),
        redirect: 'error',
        signal: expect.any(AbortSignal),
      },
    );
  });

  it.each([
    ['/v2/gateway/api/unknown', 30_000],
    ['/v2/gateway/api/create', 29_999],
    ['/v2/gateway/api/create', 120_001],
  ] as const)(
    'rejects a non-allowlisted path or timeout before network',
    async (path, timeoutMs) => {
      const fetchImplementation = mockedFetch(async () => new Response('{}'));
      const transport = new MomoSandboxHttpTransport(fetchImplementation);
      await expect(transport.post(path, {}, timeoutMs)).rejects.toBeInstanceOf(
        ProviderRejectedError,
      );
      expect(fetchImplementation).not.toHaveBeenCalled();
    },
  );

  it('maps abort timeouts separately from temporary network failures', async () => {
    const timeout = new MomoSandboxHttpTransport(
      mockedFetch(async () => {
        throw new DOMException('timed out', 'TimeoutError');
      }),
    );
    await expect(timeout.post('/v2/gateway/api/query', {}, 30_000)).rejects.toBeInstanceOf(
      ProviderTimeoutError,
    );

    const network = new MomoSandboxHttpTransport(
      mockedFetch(async () => {
        throw new TypeError('network failed');
      }),
    );
    await expect(network.post('/v2/gateway/api/query', {}, 30_000)).rejects.toBeInstanceOf(
      ProviderTemporaryError,
    );
  });

  it.each([429, 500, 503])('treats HTTP %s as temporary', async (status) => {
    const transport = new MomoSandboxHttpTransport(
      mockedFetch(async () => new Response('{}', { status })),
    );
    await expect(transport.post('/v2/gateway/api/query', {}, 30_000)).rejects.toBeInstanceOf(
      ProviderTemporaryError,
    );
  });

  it('rejects permanent HTTP errors and malformed JSON', async () => {
    const rejected = new MomoSandboxHttpTransport(
      mockedFetch(async () => new Response('{}', { status: 400 })),
    );
    await expect(rejected.post('/v2/gateway/api/query', {}, 30_000)).rejects.toBeInstanceOf(
      ProviderRejectedError,
    );

    const malformed = new MomoSandboxHttpTransport(
      mockedFetch(async () => new Response('not-json', { status: 200 })),
    );
    await expect(malformed.post('/v2/gateway/api/query', {}, 30_000)).rejects.toBeInstanceOf(
      ProviderMalformedResponseError,
    );
  });
});

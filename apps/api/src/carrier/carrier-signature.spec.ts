import { createCarrierSignature, verifyCarrierSignature } from './carrier-signature';

describe('carrier callback signatures', () => {
  it('signs the exact request bytes and rejects tampering or stale timestamps', () => {
    const body = Buffer.from('{"status":"DELIVERED"}', 'utf8');
    const headers = {
      timestamp: '1760000000',
      keyId: 'local-demo-carrier-v1',
      signature: createCarrierSignature('local-secret', '1760000000', 'POST', '/api/v1/carrier/webhooks/demo', body),
    };
    expect(verifyCarrierSignature('local-secret', headers, 'POST', '/api/v1/carrier/webhooks/demo', body, 1760000200)).toBe(true);
    expect(verifyCarrierSignature('local-secret', headers, 'POST', '/api/v1/carrier/webhooks/demo', Buffer.from('{"status":"CREATED"}'), 1760000200)).toBe(false);
    expect(verifyCarrierSignature('local-secret', headers, 'POST', '/api/v1/carrier/webhooks/demo', body, 1760000401)).toBe(false);
  });
});

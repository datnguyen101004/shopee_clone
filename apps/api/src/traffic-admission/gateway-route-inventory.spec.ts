import { describe, expect, it } from '@jest/globals';
import { EXEMPT_GATEWAY_ROUTES, PROTECTED_CHECKOUT_ROUTES } from './gateway-route-inventory';

describe('traffic gateway route inventory', () => {
  it('covers every checkout/payment creation route and keeps queue polling outside business ingress', () => {
    expect(PROTECTED_CHECKOUT_ROUTES).toEqual(expect.arrayContaining([
      'POST /api/v1/checkout/preview',
      'POST /api/v1/checkout/cod',
      'POST /api/v1/checkout/online-payments',
      'POST /api/v1/payments/:paymentReference/retry',
    ]));
    expect(EXEMPT_GATEWAY_ROUTES).toContain('GET /api/v1/admission/checkout/status');
    expect(EXEMPT_GATEWAY_ROUTES).toContain('GET /api/v1/admission/checkout/results/:idempotencyKey');
  });
});

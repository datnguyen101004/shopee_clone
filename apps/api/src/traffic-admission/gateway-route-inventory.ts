/** Route inventory shared with a local reverse proxy/gateway deployment. */
export const PROTECTED_CHECKOUT_ROUTES = [
  'POST /api/v1/checkout/preview',
  'POST /api/v1/checkout/cod',
  'POST /api/v1/checkout/online-payments',
  'POST /api/v1/payments/:paymentReference/retry',
] as const;

export const EXEMPT_GATEWAY_ROUTES = [
  'POST /api/v1/admission/checkout/tickets',
  'GET /api/v1/admission/checkout/status',
  'DELETE /api/v1/admission/checkout/ticket',
  'POST /api/v1/admission/checkout/relinquish',
  'POST /api/v1/admission/checkout/heartbeat',
  'GET /api/v1/admission/checkout/results/:idempotencyKey',
  'GET /api/v1/campaigns/:campaignId/flash-sale/status',
] as const;

export const TRAFFIC_GATEWAY_CONTEXT_HEADER = 'x-gateway-context';

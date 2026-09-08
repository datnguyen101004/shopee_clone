import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

export const metrics = {
  requests: new Counter('t35_requests'),
  admitted: new Counter('t35_admitted'),
  waiting: new Counter('t35_waiting'),
  orders: new Counter('t35_orders'),
  rejections: new Counter('t35_rejections'),
  unexpected: new Counter('t35_unexpected'),
  successRate: new Rate('t35_success_rate'),
  apiLatency: new Trend('t35_api_latency', true),
};

export const fixture = JSON.parse(
  open(__ENV.FIXTURE_PATH || './scripts/poc/t35/fixtures.local.json'),
);
export const baseUrl = (
  __ENV.BASE_URL ||
  fixture.baseUrl ||
  'http://127.0.0.1:3001/api/v1'
).replace(/\/$/, '');
export const controlPlaneUrl = (
  __ENV.CONTROL_PLANE_URL ||
  fixture.controlPlaneUrl ||
  baseUrl
).replace(/\/$/, '');
export const maxPolls = Number(__ENV.MAX_POLLS || 60);

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));

export function userForVu(offset = 0) {
  const users = fixture.users || [];
  if (!users.length) throw new Error('FIXTURE_PATH must contain at least one user');
  return users[(Math.max(1, __VU) - 1 + offset) % users.length];
}

function authHeaders(user, extra = {}) {
  const headers = { Accept: 'application/json', ...extra };
  if (user?.accessToken) headers.Authorization = `Bearer ${user.accessToken}`;
  if (user?.origin) headers.Origin = user.origin;
  return headers;
}

export function request(user, method, path, body, extra = {}, urlBase = baseUrl) {
  const payload = body === undefined ? null : JSON.stringify(body);
  const response = http.request(method, `${urlBase}${path}`, payload, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(user, extra) },
    tags: { t35_endpoint: path },
  });
  metrics.requests.add(1);
  metrics.apiLatency.add(response.timings.duration, { t35_endpoint: path });
  return response;
}

export function classify(response, accepted, label) {
  const ok = accepted.includes(response.status);
  metrics.successRate.add(ok, { t35_case: label });
  if (
    response.status === 429 ||
    response.status === 428 ||
    response.status === 403 ||
    response.status === 409
  )
    metrics.rejections.add(1, { t35_case: label, status: String(response.status) });
  if (!ok && response.status >= 500)
    metrics.unexpected.add(1, { t35_case: label, status: String(response.status) });
  check(response, { [`${label}: expected HTTP ${accepted.join('/')}`]: (r) => ok });
  return ok;
}

export function json(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

export function stableKey(prefix, user, suffix = '') {
  const id = user?.id || user?.userId || `vu-${__VU}`;
  return `${prefix}-${id}-${suffix || Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 120)
    .padEnd(16, '0');
}

export function admissionJoin(user, key = stableKey('join', user)) {
  return request(
    user,
    'POST',
    '/admission/checkout/tickets',
    undefined,
    { 'Idempotency-Key': key },
    controlPlaneUrl,
  );
}

export function pollAdmission(user, ticketId, label = 'admission') {
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const response = request(
      user,
      'GET',
      `/admission/checkout/status?ticketId=${encodeURIComponent(ticketId)}`,
      undefined,
      {},
      controlPlaneUrl,
    );
    const status = json(response);
    if (response.status !== 200 || !status) {
      classify(response, [200], `${label}-status`);
      return status;
    }
    if (status.state === 'ADMITTED') {
      metrics.admitted.add(1, { t35_case: label });
      return status;
    }
    if (status.state === 'WAITING') {
      metrics.waiting.add(1, { t35_case: label });
      sleep(Math.min(10, Math.max(1, Number(status.retryAfterSeconds || 5))));
      continue;
    }
    return status;
  }
  metrics.unexpected.add(1, { t35_case: `${label}-poll-timeout` });
  return null;
}

export function joinAndAdmit(user, key = stableKey('join', user), label = 'admission') {
  const joined = admissionJoin(user, key);
  const body = json(joined);
  if (!classify(joined, [200], `${label}-join`)) return { response: joined, status: body };
  if (!body?.ticketId || body.state === 'ADMITTED') return { response: joined, status: body };
  return { response: joined, status: pollAdmission(user, body.ticketId, label) };
}

export function preview(user, status, label = 'preview') {
  const payload = user.preview;
  if (!payload) return null;
  const headers = { 'If-Match': user.cartEtag || `"cart-${user.cartVersion}"` };
  const response = request(user, 'POST', '/checkout/preview', payload, headers);
  classify(response, [200, 409, 428, 429], label);
  return { response, body: json(response) };
}

export function confirm(user, previewBody, key = stableKey('order', user), label = 'confirm') {
  const payload = user.confirmation ? { ...user.confirmation } : { ...(user.preview || {}) };
  if (previewBody?.checkoutFingerprint)
    payload.checkoutFingerprint = previewBody.checkoutFingerprint;
  if (!payload.checkoutFingerprint) return null;
  const response = request(user, 'POST', '/checkout/cod', payload, {
    'If-Match': user.cartEtag || `"cart-${user.cartVersion}"`,
    'Idempotency-Key': uuidFromKey(key),
  });
  if (__ENV.T35_DEBUG_RESPONSES === '1' && response.status >= 400)
    console.log(`confirm status=${response.status} body=${response.body}`);
  classify(response, [200, 201, 409, 428, 429], label);
  if (response.status === 200 || response.status === 201)
    metrics.orders.add(1, { t35_case: label });
  return { response, body: json(response), key: uuidFromKey(key) };
}

export function sleepJitter(minSeconds, maxSeconds) {
  sleep(minSeconds + Math.random() * Math.max(0, maxSeconds - minSeconds));
}

function uuidFromKey(value) {
  let hex = '';
  for (const character of String(value)) hex += character.charCodeAt(0).toString(16).padStart(2, '0');
  hex = (hex + '00000000000000000000000000000000').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

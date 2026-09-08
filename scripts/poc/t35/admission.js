import { check, sleep } from 'k6';
import {
  admissionJoin,
  controlPlaneUrl,
  fixture,
  json,
  metrics,
  pollAdmission,
  request,
  stableKey,
  userForVu,
} from './lib.js';

const scenario = __ENV.SCENARIO || 'A02';
const vus = Number(__ENV.VUS || (scenario === 'A02' ? 21 : 1));
export const options = {
  scenarios: {
    admission: {
      executor: 'shared-iterations',
      vus,
      iterations: Number(__ENV.ITERATIONS || vus),
      maxDuration: __ENV.MAX_DURATION || '10m',
    },
  },
  thresholds: { t35_unexpected: ['count==0'] },
};

export default function () {
  const user = userForVu();
  const joinKey = stableKey(`join-${scenario}`, user, String(__ITER));
  if (scenario === 'A06' && fixture.mode === 'ordinary') {
    const bypass = admissionJoin(user, joinKey);
    const body = json(bypass);
    check(bypass, { 'ordinary-only join bypass returns HTTP 200': (r) => r.status === 200 });
    check(body || {}, {
      'ordinary-only cart bypasses admission': (value) =>
        value.ticketId === 'bypass' && value.state === 'ADMITTED',
    });
    return;
  }
  if (scenario === 'A06' && fixture.mode !== 'ordinary') {
    const previewWithoutAdmission = request(
      user,
      'POST',
      '/checkout/preview',
      user.preview,
      { 'If-Match': user.cartEtag || `"cart-${user.cartVersion}"` },
    );
    check(previewWithoutAdmission, {
      'mixed/flash preview without admission is rejected': (r) => r.status === 428,
    });
    if (previewWithoutAdmission.status !== 428) metrics.unexpected.add(1, { t35_case: 'A06-missing-admission' });
    return;
  }
  if (scenario === 'A03') {
    const first = admissionJoin(user, joinKey);
    const second = admissionJoin(user, joinKey);
    const firstBody = json(first);
    const secondBody = json(second);
    check(first, { 'duplicate-join first response is HTTP 200': (r) => r.status === 200 });
    check(second, { 'duplicate-join retry response is HTTP 200': (r) => r.status === 200 });
    const sameTicket = firstBody?.ticketId === secondBody?.ticketId;
    check({ sameTicket }, { 'duplicate join reuses ticket': (value) => value.sameTicket });
    if (!sameTicket) metrics.unexpected.add(1, { t35_case: 'duplicate-join-ticket' });
    return;
  }
  if (scenario === 'A08') {
    const joined = admissionJoin(user, joinKey);
    const body = json(joined);
    check(joined, { 'expiry join returns HTTP 200': (r) => r.status === 200 });
    const admitted = body?.state === 'ADMITTED'
      ? body
      : body?.ticketId
        ? pollAdmission(user, body.ticketId, 'A08')
        : null;
    if (!admitted?.ticketId) {
      metrics.unexpected.add(1, { t35_case: 'A08-no-ticket' });
      return;
    }
    // T35_POC_LEASE_TTL_MS shortens the five-minute lease for this local-only
    // diagnostic. With the default unset this remains a five-minute run.
    sleep(Number(__ENV.T35_POC_LEASE_TTL_MS || 300000) / 1000 + 0.5);
    const expired = request(
      user,
      'GET',
      `/admission/checkout/status?ticketId=${encodeURIComponent(admitted.ticketId)}`,
      undefined,
      {},
      controlPlaneUrl,
    );
    const expiredBody = json(expired);
    check(expired, { 'expired lease status returns HTTP 200': (r) => r.status === 200 });
    check(expiredBody || {}, { 'expired lease is terminal EXPIRED': (value) => value.state === 'EXPIRED' });
    if (expired.status !== 200 || expiredBody?.state !== 'EXPIRED')
      metrics.unexpected.add(1, { t35_case: 'A08-expiry' });
    return;
  }
  const joined = admissionJoin(user, joinKey);
  const body = json(joined);
  check(joined, { 'join response is HTTP 200': (r) => r.status === 200 });
  if (scenario === 'A07' && body?.ticketId) {
    const otherUser = userForVu(1);
    const mismatched = request(
      otherUser,
      'GET',
      `/admission/checkout/status?ticketId=${encodeURIComponent(body.ticketId)}`,
      undefined,
      {},
      controlPlaneUrl,
    );
    check(mismatched, { 'token/session mismatch is rejected': (r) => [401, 403, 404, 428].includes(r.status) });
    return;
  }
  if (!body?.ticketId || body.state === 'ADMITTED') {
    sleep(0.1);
    return;
  }
  const status = pollAdmission(user, body.ticketId, scenario);
  if (scenario === 'A07' && status?.state === 'ADMITTED')
    metrics.unexpected.add(1, { t35_case: 'token-binding-fixture' });
}

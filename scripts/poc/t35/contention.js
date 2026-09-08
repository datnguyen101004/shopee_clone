import { check, sleep } from 'k6';
import { confirm, joinAndAdmit, metrics, preview, request, userForVu } from './lib.js';

const scenario = __ENV.SCENARIO || 'Q01';
const vus = Number(__ENV.VUS || (scenario === 'Q01' ? 20 : 6));
export const options = {
  scenarios: {
    contention: {
      executor: 'per-vu-iterations',
      vus,
      iterations: Number(__ENV.ITERATIONS || 1),
      maxDuration: __ENV.MAX_DURATION || '10m',
      exec: 'contention',
    },
  },
  thresholds: { t35_unexpected: ['count==0'] },
};

export function contention() {
  const user = userForVu();
  const admission = joinAndAdmit(
    user,
    `join-${scenario}-${user.id || __VU}`.padEnd(16, '0'),
    scenario,
  );
  if (admission.status?.state !== 'ADMITTED') return;
  const built = preview(user, admission.status, `${scenario}-preview`);
  if (!built?.body?.checkoutFingerprint) return;
  if (scenario === 'Q03' || scenario === 'A09') {
    const key = `order-${scenario}-${user.id || __VU}`.padEnd(16, '0');
    const first = confirm(user, built.body, key, `${scenario}-first`);
    const second = confirm(user, built.body, key, `${scenario}-replay`);
    const firstOk = first?.response.status === 201;
    const secondOk = second?.response.status === 200;
    check({ firstOk, secondOk }, {
      'same-key first confirmation creates one order': (value) => value.firstOk,
      'same-key replay returns HTTP 200': (value) => value.secondOk,
    });
    if (!firstOk || !secondOk) metrics.unexpected.add(1, { t35_case: 'Q03-replay' });
    // The checkout endpoint converts the human-readable harness key into the
    // UUID idempotency key persisted by the API. Result lookup must use that
    // persisted UUID, otherwise the API correctly rejects the path as invalid.
    const resultKey = first?.key || second?.key;
    const lookup = request(user, 'GET', `/admission/checkout/results/${encodeURIComponent(resultKey || '')}`);
    const lookupBody = lookup.json();
    check(lookup, { 'same-key result lookup returns committed purchase': (r) => r.status === 200 });
    check({ samePurchase: lookupBody?.purchase?.id === first?.body?.purchase?.id }, {
      'result lookup matches original purchase': (value) => value.samePurchase,
    });
    if (lookup.status !== 200 || lookupBody?.purchase?.id !== first?.body?.purchase?.id)
      metrics.unexpected.add(1, { t35_case: 'Q03-result-lookup' });
    // Keep the payload schema-valid while changing a digest field. The API
    // must return an idempotency conflict before trying to validate/use the
    // changed address in the checkout flow.
    const altered = {
      ...(user.confirmation || user.preview || {}),
      shippingAddressId: '00000000-0000-4000-8000-000000000099',
      checkoutFingerprint: built.body.checkoutFingerprint,
    };
    const conflict = request(user, 'POST', '/checkout/cod', altered, {
      'If-Match': user.cartEtag || `"cart-${user.cartVersion}"`,
      'Idempotency-Key': resultKey || key,
    });
    if (__ENV.T35_DEBUG_RESPONSES === '1')
      console.log(`altered status=${conflict.status} body=${conflict.body}`);
    check(conflict, { 'same-key changed payload conflicts': (r) => r.status === 409 });
    if (conflict.status !== 409) metrics.unexpected.add(1, { t35_case: 'Q03-payload-conflict' });
    return;
  }
  // All VUs reach confirmation without a client-side stagger. A server-side
  // POC barrier may be enabled separately to hold five executions in flight.
  confirm(user, built.body, `order-${scenario}-${user.id || __VU}`.padEnd(16, '0'), scenario);
  sleep(0.1);
}

export default contention;

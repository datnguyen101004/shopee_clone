import { check } from 'k6';
import { confirm, joinAndAdmit, preview, userForVu } from './lib.js';

export const options = { vus: 1, iterations: 1, thresholds: { t35_unexpected: ['count==0'] } };

export default function () {
  const user = userForVu();
  const admission = joinAndAdmit(user, `join-smoke-${user.id || __VU}`.padEnd(16, '0'), 'smoke');
  check(admission.status || {}, {
    'smoke has admission state': (s) =>
      ['WAITING', 'ADMITTED', 'EXPIRED', 'CLOSED'].includes(s.state),
  });
  if (admission.status?.state !== 'ADMITTED') return;
  const built = preview(user, admission.status, 'smoke-preview');
  if (built?.body?.checkoutFingerprint)
    confirm(user, built.body, `order-smoke-${user.id || __VU}`.padEnd(16, '0'), 'smoke-confirm');
}

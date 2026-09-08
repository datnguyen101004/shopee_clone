import { check } from 'k6';
import { baseUrl, fixture, json, request, sleepJitter, userForVu } from './lib.js';

const phase = __ENV.PHASE || 'active';
const variants = fixture.public?.variantIds || [];
const campaignId = fixture.public?.campaignId || '';
const cadence = phase === 'before' ? [10, 15] : [3, 5];
export const options = {
  scenarios: {
    phase: phase === 'contracts'
      ? {
          executor: 'per-vu-iterations',
          vus: Number(__ENV.VUS || 1),
          iterations: 1,
          maxDuration: __ENV.MAX_DURATION || '30s',
        }
      : {
          executor: 'constant-vus',
          vus: Number(__ENV.VUS || 10),
          duration: __ENV.DURATION || '60s',
        },
  },
  thresholds: { t35_unexpected: ['count==0'] },
};

export default function () {
  const user = userForVu();
  if (phase === 'contracts') {
    const valid = request(
      user,
      'GET',
      `/campaigns/${encodeURIComponent(campaignId)}/flash-sale/status?variantIds=${variants.map(encodeURIComponent).join(',')}`,
    );
    const invalidId = request(
      user,
      'GET',
      `/campaigns/${encodeURIComponent(campaignId)}/flash-sale/status?variantIds=not-a-uuid`,
    );
    const tooManyIds = Array.from({ length: 51 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
    const tooMany = request(
      user,
      'GET',
      `/campaigns/${encodeURIComponent(campaignId)}/flash-sale/status?variantIds=${tooManyIds.join(',')}`,
    );
    check(valid, { 'valid batch status is HTTP 200': (r) => r.status === 200 });
    check(invalidId, { 'invalid variant id is rejected': (r) => r.status === 400 });
    check(tooMany, { 'batch over 50 ids is rejected': (r) => r.status === 400 });
    return;
  }
  const response = request(
    user,
    'GET',
    `/campaigns/${encodeURIComponent(campaignId)}/flash-sale/status?variantIds=${variants.map(encodeURIComponent).join(',')}`,
  );
  const body = json(response);
  check(response, { 'status endpoint returns success': (r) => r.status === 200 });
  check(body || {}, {
    'public response does not expose exact quota': (value) =>
      !JSON.stringify(value).match(/remainingQuantity|allocatedQuantity|physicalStock/i),
  });
  sleepJitter(cadence[0], cadence[1]);
}
